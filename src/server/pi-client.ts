import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent'
import type { ActiveSession, ModelInfo, PiClient, SessionFactory } from './types.js'
import { getTier } from './types.js'

type ModelRegistryLike = {
  getAvailable: () => Array<{ provider: string; id: string }> | PromiseLike<Array<{ provider: string; id: string }>>
}

type PiSessionLike = {
  steer:     (text: string) => Promise<void>
  abort:     () => Promise<void>
  subscribe: (listener: (event: unknown) => void) => () => void
}

// Exported for unit testing — adapts any PiSession-like object to ActiveSession.
// Subscribes immediately on construction to buffer events, then drains the buffer
// when the caller's subscribe() arrives (prevents race with fast completions).
export const makePiSessionAdapter = (piSession: PiSessionLike): ActiveSession => {
  const buffered: unknown[] = []
  let forward: ((e: unknown) => void) | null = null

  piSession.subscribe((event) => {
    if (forward) { forward(event) } else { buffered.push(event) }
  })

  return {
    steer: (text) => piSession.steer(text),
    abort: () => piSession.abort(),
    subscribe: (onDelta, onEnd, onError) => {
      // Tracks error from message_end so agent_end can route to onError instead of onEnd.
      // Pi SDK fires message_end { stopReason: 'error' } before agent_end on provider failures.
      let pendingError: string | null = null
      forward = (event) => {
        const e = event as Record<string, unknown>
        if (e['type'] === 'message_update') {
          // Pi SDK normalizes all providers to AssistantMessageEvent.
          // text_delta events carry delta: string directly (not Anthropic's raw format).
          const ame = e['assistantMessageEvent'] as Record<string, unknown>
          if (ame?.['type'] === 'text_delta') {
            onDelta(String(ame['delta'] ?? ''))
          }
        } else if (e['type'] === 'message_end') {
          // Pi SDK nests stopReason/errorMessage inside e['message'], not at top level
          const msg = e['message'] as Record<string, unknown> | undefined
          if (msg?.['stopReason'] === 'error') {
            pendingError = String(msg['errorMessage'] ?? 'Pi agent error')
          }
        } else if (e['type'] === 'agent_end') {
          if (pendingError) { onError(pendingError) } else { onEnd() }
        }
      }
      for (const e of buffered) forward(e)
      buffered.length = 0
      return () => { forward = null }
    },
  }
}

// Production session factory. Requires Pi auth to be configured via `pi auth` or
// provider env vars (ANTHROPIC_API_KEY, GEMINI_API_KEY, etc.) before calling.
export const makePiSessionFactory = (deps: {
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  sessionManager: SessionManager
}): SessionFactory => async (task, modelKey, cwd) => {
  const [provider, ...idParts] = modelKey.split('/')
  const id = idParts.join('/')

  const model = deps.modelRegistry.find(provider, id)
  if (!model) throw { kind: 'model_not_found' as const, model: modelKey }

  const { session } = await createAgentSession({
    model,
    cwd,
    authStorage: deps.authStorage,
    modelRegistry: deps.modelRegistry,
    sessionManager: deps.sessionManager,
  })

  // Adapter subscribes to piSession immediately — buffers events until our
  // caller's subscribe() arrives, preventing loss of fast completions.
  const adapted = makePiSessionAdapter(session)
  await session.prompt(task)
  return adapted
}

export const makePiClient = (
  factory: SessionFactory,
  modelRegistry: ModelRegistryLike
): PiClient => ({
  startSession: (task, modelKey, cwd) => factory(task, modelKey, cwd),
  listModels: async () => {
    const models = await modelRegistry.getAvailable()
    return models.map((m): ModelInfo => ({
      key:      `${m.provider}/${m.id}`,
      provider: m.provider,
      id:       m.id,
      tier:     getTier(m.id),
    }))
  },
})
