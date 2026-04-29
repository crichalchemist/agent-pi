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

// Tier labels keyed on Pi's model id field
export const MODEL_TIERS: Record<string, ModelTier> = {
  'gemini-2.5-pro':         'frontier',
  'gemini-2.0-flash':       'fast',
  'claude-haiku-4-5':       'fast',
  'claude-sonnet-4-6':      'balanced',
  'claude-opus-4-7':        'frontier',
  'gpt-4o':                 'balanced',
  'gpt-4o-mini':            'fast',
  'o3':                     'frontier',
  'o3-mini':                'balanced',
  'o4-mini':                'balanced',
}

export const getTier = (modelId: string): ModelTier =>
  MODEL_TIERS[modelId] ?? 'balanced'
