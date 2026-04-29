import { randomUUID } from 'node:crypto';
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
                model: { type: 'string', description: 'Model key in provider/id format (e.g. google/gemini-2.0-flash)' },
                cwd: { type: 'string', description: 'Working directory for the agent (defaults to Claude\'s cwd)' },
                timeout: { type: 'number', description: 'Timeout in ms (default 300000)' },
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
                task: { type: 'string' },
                model: { type: 'string', description: 'Model key in provider/id format' },
                cwd: { type: 'string' },
            },
            required: ['task', 'model'],
        },
    },
    {
        name: 'pi_steer_agent',
        description: 'Send a steering message to a running Pi agent.',
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
export const makeTools = (store, client) => {
    const tools = {
        pi_list_models: async (_args) => ({
            models: await client.listModels(),
        }),
        pi_run_task: async ({ task, model, cwd, timeout = DEFAULT_TIMEOUT_MS }) => {
            const resolvedCwd = cwd ?? process.cwd();
            const session = await client.startSession(task, model, resolvedCwd);
            return new Promise((resolve) => {
                let output = '';
                let settled = false;
                const settle = (value) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(handle);
                    unsubscribe();
                    resolve(value);
                };
                const unsubscribe = session.subscribe((delta) => { output += delta; }, () => { settle({ output }); }, (err) => { settle({ output, error: err }); });
                const handle = setTimeout(() => {
                    session.abort();
                    settle({ output, timedOut: true });
                }, timeout);
            });
        },
        pi_spawn_agent: async ({ task, model, cwd }) => {
            const session_id = randomUUID();
            const resolvedCwd = cwd ?? process.cwd();
            const session = await client.startSession(task, model, resolvedCwd);
            store.add(session_id, { session, output: '', status: 'running', createdAt: Date.now(), model });
            const unsubscribe = session.subscribe((delta) => {
                const e = store.get(session_id);
                if (e)
                    store.update(session_id, { output: e.output + delta });
            }, () => {
                store.update(session_id, { status: 'done' });
                unsubscribe();
            }, (err) => {
                store.update(session_id, { status: 'error', error: err });
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
