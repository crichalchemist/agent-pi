import { createAgentSession, } from '@mariozechner/pi-coding-agent';
import { getTier } from './types.js';
const dispatchEvent = (event, onDelta, onEnd) => {
    const e = event;
    if (e['type'] === 'message_update') {
        // Pi SDK normalizes all providers to AssistantMessageEvent.
        // text_delta events carry delta: string directly (not Anthropic's raw format).
        const ame = e['assistantMessageEvent'];
        if (ame?.['type'] === 'text_delta') {
            onDelta(String(ame['delta'] ?? ''));
        }
    }
    else if (e['type'] === 'agent_end') {
        onEnd();
    }
};
// Exported for unit testing — adapts any PiSession-like object to ActiveSession.
// Subscribes immediately on construction to buffer events, then drains the buffer
// when the caller's subscribe() arrives (prevents race with fast completions).
export const makePiSessionAdapter = (piSession) => {
    const buffered = [];
    let forward = null;
    piSession.subscribe((event) => {
        if (forward) {
            forward(event);
        }
        else {
            buffered.push(event);
        }
    });
    return {
        steer: (text) => piSession.steer(text),
        abort: () => piSession.abort(),
        subscribe: (onDelta, onEnd, _onError) => {
            forward = (event) => dispatchEvent(event, onDelta, onEnd);
            for (const e of buffered)
                forward(e);
            buffered.length = 0;
            return () => { forward = null; };
        },
    };
};
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
    // Adapter subscribes to piSession immediately — buffers events until our
    // caller's subscribe() arrives, preventing loss of fast completions.
    const adapted = makePiSessionAdapter(session);
    await session.prompt(task);
    return adapted;
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
