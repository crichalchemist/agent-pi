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
  getAvailable: () => Promise<Array<{ provider: string; id: string }>>
}

// Production adapter: bridges Pi's AgentSession to our ActiveSession interface.
// subscribe maps Pi's 'message_update' events to text deltas and 'agent_end' to onEnd.
// If the Pi SDK's MessageEvent shape changes, update the content_block_delta check below.
const adaptPiSession = (piSession: Awaited<ReturnType<typeof createAgentSession>>['session']): ActiveSession => ({
  steer: (text) => piSession.steer(text),
  abort: () => piSession.abort(),
  subscribe: (onDelta, onEnd, onError) =>
    piSession.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'message_update') {
        const e = event.assistantMessageEvent as Record<string, unknown>
        if (
          e['type'] === 'content_block_delta' &&
          (e['delta'] as Record<string, unknown>)?.['type'] === 'text_delta'
        ) {
          onDelta(String((e['delta'] as Record<string, unknown>)['text'] ?? ''))
        }
      } else if (event.type === 'agent_end') {
        onEnd()
      }
    }),
})

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

  await session.prompt(task)
  return adaptPiSession(session)
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
