import { randomUUID } from 'node:crypto';
import { makeSessionLogger } from './event-logger.js';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
// Each tool input schema — used by index.ts for MCP registration
export const TOOL_SCHEMAS = [
    {
        name: 'pi_list_models',
        description: 'List Pi models available for this session with tier labels (fast/balanced/frontier).',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'pi_run_task',
        description: 'Run a task on a Pi agent and wait for completion. Returns accumulated output. On timeout, aborts and returns partial output with timedOut: true.',
        inputSchema: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'Task description for the Pi agent' },
                model: { type: 'string', description: 'Model key in "provider/model-id" format (e.g. google/gemini-2.0-flash, anthropic/claude-haiku-4-5, openai/gpt-4o)' },
                cwd: { type: 'string', description: 'Working directory for the agent (defaults to Claude\'s cwd)' },
                timeout: { type: 'number', description: 'Timeout in ms (default 300000)' },
                followUp: { type: 'boolean', description: 'If true, queues the message to be delivered after the agent finishes all work (non-interruptive). Default false.' },
            },
            required: ['task', 'model'],
        },
    },
    {
        name: 'pi_spawn_agent',
        description: 'Spawn a Pi agent and return a session_id immediately. Use pi_poll_agent to check progress.',
        inputSchema: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'Task description for the Pi agent' },
                model: { type: 'string', description: 'Model key in "provider/model-id" format (e.g. anthropic/claude-sonnet-4-6, openai/gpt-4o)' },
                cwd: { type: 'string' },
                followUp: { type: 'boolean', description: 'If true, queues the message to be delivered after the agent finishes all work (non-interruptive). Default false.' },
            },
            required: ['task', 'model'],
        },
    },
    {
        name: 'pi_steer_agent',
        description: 'Send a steering message to a running Pi agent. Delivered after the current assistant turn finishes its tool calls. Use pi_followup_agent if you want to wait for full completion before sending.',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string' },
                message: { type: 'string' },
            },
            required: ['session_id', 'message'],
        },
    },
    {
        name: 'pi_followup_agent',
        description: 'Queue a follow-up message for a spawned Pi agent. Delivered only after the agent finishes all work. Use this when you do not want to interrupt the agent at all.',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string' },
                message: { type: 'string' },
            },
            required: ['session_id', 'message'],
        },
    },
    {
        name: 'pi_poll_agent',
        description: 'Check status and accumulated output of a spawned Pi agent.',
        inputSchema: {
            type: 'object',
            properties: { session_id: { type: 'string' } },
            required: ['session_id'],
        },
    },
    {
        name: 'pi_get_result',
        description: 'Wait for a spawned Pi agent to finish and return its final output.',
        inputSchema: {
            type: 'object',
            properties: { session_id: { type: 'string' } },
            required: ['session_id'],
        },
    },
    {
        name: 'pi_terminate_agent',
        description: 'Abort a running Pi agent and return whatever output was accumulated.',
        inputSchema: {
            type: 'object',
            properties: { session_id: { type: 'string' } },
            required: ['session_id'],
        },
    },
];
export const makeTools = (store, client, opts = {}) => {
    const tools = {
        pi_list_models: async (_args) => ({
            models: await client.listModels(),
        }),
        pi_run_task: async ({ task, model, cwd, timeout = DEFAULT_TIMEOUT_MS, followUp }) => {
            const resolvedCwd = cwd ?? process.cwd();
            const session = await client.startSession(task, model, resolvedCwd, followUp);
            return new Promise((resolve) => {
                let output = '';
                let settled = false;
                // Both declared before subscribe so settle() is safe to call synchronously
                // during buffer drain (before handle/unsubscribe are assigned).
                // clearTimeout(undefined) and the no-op unsub are both safe.
                let handle;
                let unsubscribe = () => { };
                const settle = (value) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(handle);
                    unsubscribe();
                    resolve(value);
                };
                unsubscribe = session.subscribe((delta) => { output += delta; }, () => { settle({ output }); }, (err) => { settle({ output, error: err }); });
                handle = setTimeout(() => {
                    session.abort();
                    settle({ output, timedOut: true });
                }, timeout);
            });
        },
        pi_spawn_agent: async ({ task, model, cwd, followUp }) => {
            const session_id = randomUUID();
            const resolvedCwd = cwd ?? process.cwd();
            const session = await client.startSession(task, model, resolvedCwd, followUp);
            store.add(session_id, { session, output: '', status: 'running', createdAt: Date.now(), model });
            const logger = makeSessionLogger({
                sessionsDir: opts.sessionsDir,
                sessionId: session_id,
                task,
                model,
            });
            // Declared before subscribe so onEnd/onError callbacks can call unsubscribe()
            // without hitting a temporal dead zone (same pattern as pi_run_task).
            let unsubscribe = () => { };
            unsubscribe = session.subscribe((delta) => {
                const e = store.get(session_id);
                if (e)
                    store.update(session_id, { output: e.output + delta });
                logger.delta(delta);
            }, () => {
                const output = store.get(session_id)?.output ?? '';
                store.update(session_id, { status: 'done' });
                logger.end(output);
                unsubscribe();
            }, (err) => {
                const output = store.get(session_id)?.output ?? '';
                store.update(session_id, { status: 'error', error: err });
                logger.error(err, output);
                unsubscribe();
            });
            return { session_id };
        },
        pi_poll_agent: async ({ session_id }) => {
            const entry = store.get(session_id);
            if (!entry)
                return { status: 'error', output: '', error: `Session ${session_id} not found` };
            return { status: entry.status, output: entry.output, ...(entry.error ? { error: entry.error } : {}) };
        },
        pi_steer_agent: async ({ session_id, message }) => {
            const entry = store.get(session_id);
            if (!entry || entry.status !== 'running')
                return { ok: false };
            await entry.session.steer(message);
            return { ok: true };
        },
        pi_followup_agent: async ({ session_id, message }) => {
            const entry = store.get(session_id);
            if (!entry || entry.status !== 'running')
                return { ok: false };
            await entry.session.followUp(message);
            return { ok: true };
        },
        pi_get_result: async ({ session_id }) => {
            const entry = store.get(session_id);
            if (!entry)
                throw { kind: 'session_not_found', session_id };
            if (entry.status === 'error')
                throw { kind: 'pi_unavailable', message: entry.error ?? 'unknown' };
            if (entry.status === 'done')
                return { output: entry.output };
            // Poll until done
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    const e = store.get(session_id);
                    if (!e || e.status === 'error') {
                        clearInterval(interval);
                        reject({ kind: 'pi_unavailable', message: e?.error ?? 'session lost' });
                    }
                    else if (e.status === 'done') {
                        clearInterval(interval);
                        resolve({ output: e.output });
                    }
                }, 500);
            });
        },
        pi_terminate_agent: async ({ session_id }) => {
            const entry = store.get(session_id);
            if (!entry)
                return { output: '' };
            await entry.session.abort();
            store.update(session_id, { status: 'done' });
            return { output: store.get(session_id)?.output ?? '' };
        },
    };
    return { tools, schemas: TOOL_SCHEMAS };
};
