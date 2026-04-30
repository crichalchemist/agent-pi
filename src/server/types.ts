export type SessionStatus = 'running' | 'done' | 'error'

export type ModelTier = 'fast' | 'balanced' | 'frontier'

export type ModelInfo = {
  readonly key: string       // "provider/id" — pass this as the model param in all tools
  readonly provider: string
  readonly id: string
  readonly tier: ModelTier
}

// Our abstraction over Pi's AgentSession — the only shape the rest of the codebase sees
export type ActiveSession = {
  steer: (text: string) => Promise<void>
  abort: () => Promise<void>
  // Returns an unsubscribe function
  subscribe: (
    onDelta: (text: string) => void,
    onEnd: () => void,
    onError: (message: string) => void
  ) => () => void
}

export type SessionEntry = {
  readonly session: ActiveSession
  readonly output: string
  readonly status: SessionStatus
  readonly error?: string
  readonly createdAt: number
  readonly model?: string
}

export type SessionStore = {
  add: (id: string, entry: SessionEntry) => void
  get: (id: string) => SessionEntry | undefined
  update: (id: string, patch: Partial<Pick<SessionEntry, 'output' | 'status' | 'error'>>) => void
  remove: (id: string) => void
  all: () => ReadonlyMap<string, SessionEntry>
  dispose: () => void
}

// Injectable factory — the only interface tests need to provide a mock for
export type SessionFactory = (
  task: string,
  modelKey: string,
  cwd: string
) => Promise<ActiveSession>

export type PiClient = {
  startSession: (task: string, modelKey: string, cwd: string) => Promise<ActiveSession>
  listModels: () => Promise<ModelInfo[]>
}

export type PiError =
  | { kind: 'auth_failed';      message: string }
  | { kind: 'model_not_found';  model: string }
  | { kind: 'session_timeout';  session_id: string; partialOutput: string }
  | { kind: 'pi_unavailable';   message: string }
  | { kind: 'session_not_found'; session_id: string }

// Exact overrides for models that don't classify cleanly from their name
const MODEL_TIER_OVERRIDES: Record<string, ModelTier> = {
  'o3':      'frontier',
  'o4':      'frontier',
  'o3-mini': 'balanced',
  'o4-mini': 'balanced',
}

// Keywords matched against the bare model name (provider prefix stripped)
const FAST_PATTERN     = /\b(flash|haiku|mini|nano)\b/i
const FRONTIER_PATTERN = /\b(opus|thinking|pro)\b/i

export const getTier = (modelId: string): ModelTier => {
  if (MODEL_TIER_OVERRIDES[modelId]) return MODEL_TIER_OVERRIDES[modelId]
  // Strip provider prefix: "google/gemini-2.5-pro" → "gemini-2.5-pro"
  const name = modelId.includes('/') ? modelId.split('/').pop()! : modelId
  if (FAST_PATTERN.test(name))     return 'fast'
  if (FRONTIER_PATTERN.test(name)) return 'frontier'
  return 'balanced'
}
