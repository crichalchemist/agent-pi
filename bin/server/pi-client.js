import { createAgentSession, } from '@mariozechner/pi-coding-agent';
import { getTier } from './types.js';
// Production adapter: bridges Pi's AgentSession to our ActiveSession interface.
// subscribe maps Pi's 'message_update' events to text deltas and 'agent_end' to onEnd.
// If the Pi SDK's MessageEvent shape changes, update the content_block_delta check below.
const adaptPiSession = (piSession) => ({
    steer: (text) => piSession.steer(text),
    abort: () => piSession.abort(),
    subscribe: (onDelta, onEnd, onError) => piSession.subscribe((event) => {
        if (event.type === 'message_update') {
            const e = event.assistantMessageEvent;
            if (e['type'] === 'content_block_delta' &&
                e['delta']?.['type'] === 'text_delta') {
                onDelta(String(e['delta']['text'] ?? ''));
            }
        }
        else if (event.type === 'agent_end') {
            onEnd();
        }
    }),
});
// Production session factory. Requires Pi auth to be configured via `pi auth` or
// provider env vars (ANTHROPIC_API_KEY, GEMINI_API_KEY, etc.) before calling.
export const makePiSessionFactory = (deps) => async (task, modelKey, cwd) => {
    const [provider, ...idParts] = modelKey.split('/');
    const id = idParts.join('/');
    const model = deps.modelRegistry.find(provider, id);
    if (!model)
        throw { kind: 'model_not_found', model: modelKey };
    const { session } = await createAgentSession({
        model,
        cwd,
        authStorage: deps.authStorage,
        modelRegistry: deps.modelRegistry,
        sessionManager: deps.sessionManager,
    });
    await session.prompt(task);
    return adaptPiSession(session);
};
export const makePiClient = (factory, modelRegistry) => ({
    startSession: (task, modelKey, cwd) => factory(task, modelKey, cwd),
    listModels: async () => {
        const models = await modelRegistry.getAvailable();
        return models.map((m) => ({
            key: `${m.provider}/${m.id}`,
            provider: m.provider,
            id: m.id,
            tier: getTier(m.id),
        }));
    },
});
