import {
  ModelRuntime,
  SessionManager,
  createAgentSession,
  type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent'
import type { ActiveSession, ModelInfo, PiClient, SessionFactory } from './types.js'
import { getTier } from './types.js'
import { readPiSettings, filterByEnabledModels, type PiSettings } from './pi-settings.js'

// The injection seam for the SDK's ModelRuntime. Declared structurally so the concrete
// SDK type stays out of exported signatures and tests can pass a plain object.
// getAvailable() is async on ModelRuntime; the PromiseLike arm covers that.
type ModelRuntimeLike = {
  getAvailable: () => ReadonlyArray<{ provider: string; id: string }> | PromiseLike<ReadonlyArray<{ provider: string; id: string }>>
  getModel: (provider: string, id: string) => unknown
}

type PiSessionLike = {
  steer:     (text: string) => Promise<void>
  followUp?: (text: string) => Promise<void>
  abort:     () => Promise<void>
  subscribe: (listener: (event: unknown) => void) => () => void
}

// Exported for unit testing — adapts any PiSession-like object to ActiveSession.
// Subscribes immediately on construction to buffer events, then drains the buffer
// when the caller's subscribe() arrives (prevents race with fast completions).
export const makePiSessionAdapter = (piSession: PiSessionLike, opts: { followUp?: boolean } = {}): ActiveSession => {
  const buffered: unknown[] = []
  let forward: ((e: unknown) => void) | null = null

  piSession.subscribe((event) => {
    if (forward) { forward(event) } else { buffered.push(event) }
  })

  return {
    steer: (text) => piSession.steer(text),
    followUp: (text) => (piSession.followUp ?? piSession.steer)(text),
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
  modelRuntime: ModelRuntime
  sessionManager: SessionManager
}): SessionFactory => async (task, modelKey, cwd, followUp) => {
  const [provider, ...idParts] = modelKey.split('/')
  const id = idParts.join('/')

  // getModel is the 0.84 replacement for ModelRegistry.find — still sync, still
  // returns undefined (not a throw) when the provider/id pair is unknown.
  const model = deps.modelRuntime.getModel(provider, id)
  if (!model) throw { kind: 'model_not_found' as const, model: modelKey }

  const { session } = await createAgentSession({
    model,
    cwd,
    modelRuntime: deps.modelRuntime,
    sessionManager: deps.sessionManager,
  })

  // Adapter subscribes immediately and buffers events, so fire prompt as a
  // background task — tools.ts gets the session handle while the agent runs,
  // allowing store.add('running') to fire before the task completes.
  const adapted = makePiSessionAdapter(session)
  if (followUp) {
    session.followUp(task).catch(() => {})
  } else {
    session.prompt(task).catch(() => {})
  }
  return adapted
}

export const makePiClient = (
  factory: SessionFactory,
  modelRuntime: ModelRuntimeLike,
  opts: { readSettings?: () => Promise<PiSettings> } = {}
): PiClient => ({
  startSession: (task, modelKey, cwd, followUp) => factory(task, modelKey, cwd, followUp),
  listModels: async () => {
    const getSettings = opts.readSettings ?? readPiSettings
    const [models, settings] = await Promise.all([
      modelRuntime.getAvailable(),
      getSettings().catch(() => ({} as PiSettings)),
    ])
    return filterByEnabledModels(models, settings).map((m): ModelInfo => ({
      key:      `${m.provider}/${m.id}`,
      provider: m.provider,
      id:       m.id,
      tier:     getTier(m.id),
    }))
  },
})
