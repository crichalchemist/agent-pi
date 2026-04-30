import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makePiClient, makePiSessionAdapter, makePiSessionFactory } from '../../src/server/pi-client.js'
import { createAgentSession } from '@mariozechner/pi-coding-agent'
import type { ActiveSession, ModelInfo, SessionFactory } from '../../src/server/types.js'

vi.mock('@mariozechner/pi-coding-agent', () => ({
  createAgentSession: vi.fn(),
  AuthStorage: class {},
  ModelRegistry: class {},
  SessionManager: class {},
}))

// Minimal mock of a Pi AgentSession
const makeMockPiSession = () => {
  let listener: ((e: unknown) => void) | null = null
  return {
    steer:     vi.fn(async () => {}),
    abort:     vi.fn(async () => {}),
    subscribe: vi.fn((cb: (e: unknown) => void) => { listener = cb; return () => {} }),
    emit:      (event: unknown) => { listener?.(event) },
  }
}

// Pi SDK's normalized AssistantMessageEvent format (same across all providers)
const textDeltaEvent = (text: string) => ({
  type: 'message_update',
  assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: text },
})
const agentEndEvent = () => ({ type: 'agent_end', messages: [] })
// Pi SDK nests stopReason/errorMessage inside message, not at event top level
const messageEndErrorEvent = (msg: string) => ({ type: 'message_end', message: { stopReason: 'error', errorMessage: msg } })

// Minimal mock that satisfies ActiveSession
const makeActiveSession = (): ActiveSession => ({
  steer: vi.fn(),
  abort: vi.fn(),
  subscribe: vi.fn(() => () => {}),
})

// Mock modelRegistry — no Pi SDK import needed in tests
const mockModelRegistry = {
  getAvailable: vi.fn(async () => [
    { provider: 'google', id: 'gemini-2.5-pro' },
    { provider: 'google', id: 'gemini-2.0-flash' },
    { provider: 'openai', id: 'gpt-4o' },
  ]),
}

describe('makePiClient', () => {
  it('startSession calls factory with task, modelKey, and cwd', async () => {
    const factory: SessionFactory = vi.fn(async () => makeActiveSession())
    const client = makePiClient(factory, mockModelRegistry)

    await client.startSession('do the thing', 'google/gemini-2.0-flash', '/tmp')

    expect(factory).toHaveBeenCalledWith('do the thing', 'google/gemini-2.0-flash', '/tmp')
  })

  it('startSession returns the ActiveSession from the factory', async () => {
    const session = makeActiveSession()
    const factory: SessionFactory = async () => session
    const client = makePiClient(factory, mockModelRegistry)

    const result = await client.startSession('task', 'google/gpt-4o', '/tmp')
    expect(result).toBe(session)
  })

  it('listModels returns ModelInfo with key, provider, id, tier', async () => {
    const client = makePiClient(vi.fn(), mockModelRegistry, { readSettings: async () => ({}) })
    const models = await client.listModels()

    expect(models).toEqual([
      { key: 'google/gemini-2.5-pro',   provider: 'google', id: 'gemini-2.5-pro',   tier: 'frontier' },
      { key: 'google/gemini-2.0-flash', provider: 'google', id: 'gemini-2.0-flash', tier: 'fast'     },
      { key: 'openai/gpt-4o',           provider: 'openai', id: 'gpt-4o',           tier: 'balanced' },
    ])
  })

  it('listModels falls back to "balanced" tier for unknown model ids', async () => {
    const registry = {
      getAvailable: vi.fn(async () => [{ provider: 'acme', id: 'unknown-model-x' }]),
    }
    const client = makePiClient(vi.fn(), registry, { readSettings: async () => ({}) })
    const models = await client.listModels()
    expect(models[0].tier).toBe('balanced')
  })

  it('listModels filters to enabledModels when Pi settings are present', async () => {
    const readSettings = vi.fn(async () => ({
      enabledModels: ['google/gemini-2.5-pro', 'openai/gpt-4o'],
    }))
    const client = makePiClient(vi.fn(), mockModelRegistry, { readSettings })
    const models = await client.listModels()

    expect(models).toHaveLength(2)
    expect(models.map(m => m.key)).toEqual(['google/gemini-2.5-pro', 'openai/gpt-4o'])
  })

  it('listModels returns all models when enabledModels is absent in settings', async () => {
    const readSettings = vi.fn(async () => ({}))
    const client = makePiClient(vi.fn(), mockModelRegistry, { readSettings })
    const models = await client.listModels()
    expect(models).toHaveLength(3)
  })

  it('listModels returns all models when readSettings throws', async () => {
    const readSettings = vi.fn(async () => { throw new Error('read failed') })
    const client = makePiClient(vi.fn(), mockModelRegistry, { readSettings })
    const models = await client.listModels()
    expect(models).toHaveLength(3)
  })
})

describe('makePiSessionAdapter event buffering', () => {
  it('replays text deltas that fired before subscribe was called', () => {
    const pi = makeMockPiSession()
    const adapted = makePiSessionAdapter(pi)

    // Events fire before caller subscribes (the race condition scenario)
    pi.emit(textDeltaEvent('hello '))
    pi.emit(textDeltaEvent('world'))
    pi.emit(agentEndEvent())

    const onDelta = vi.fn()
    const onEnd   = vi.fn()
    adapted.subscribe(onDelta, onEnd, vi.fn())

    expect(onDelta).toHaveBeenCalledWith('hello ')
    expect(onDelta).toHaveBeenCalledWith('world')
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('forwards events immediately when subscribe is already set up', () => {
    const pi = makeMockPiSession()
    const adapted = makePiSessionAdapter(pi)

    const onDelta = vi.fn()
    const onEnd   = vi.fn()
    adapted.subscribe(onDelta, onEnd, vi.fn())

    // Events fire after caller subscribes (normal scenario)
    pi.emit(textDeltaEvent('async output'))
    pi.emit(agentEndEvent())

    expect(onDelta).toHaveBeenCalledWith('async output')
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('drains buffer exactly once — replayed events not fired again', () => {
    const pi = makeMockPiSession()
    const adapted = makePiSessionAdapter(pi)

    pi.emit(textDeltaEvent('buffered'))
    pi.emit(agentEndEvent())

    const onDelta = vi.fn()
    const onEnd   = vi.fn()
    adapted.subscribe(onDelta, onEnd, vi.fn())

    // Re-subscribing after unsubscribe should NOT replay old events
    const unsub = adapted.subscribe(vi.fn(), vi.fn(), vi.fn())
    expect(onDelta).toHaveBeenCalledTimes(1)  // only from first subscribe
  })

  it('calls onError (not onEnd) when agent_end follows message_end with stopReason error', () => {
    const pi = makeMockPiSession()
    const adapted = makePiSessionAdapter(pi)

    const onEnd   = vi.fn()
    const onError = vi.fn()
    adapted.subscribe(vi.fn(), onEnd, onError)

    pi.emit(messageEndErrorEvent('400 provider rejected request'))
    pi.emit(agentEndEvent())

    expect(onError).toHaveBeenCalledWith('400 provider rejected request')
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('calls onEnd (not onError) when agent_end follows a non-error message_end', () => {
    const pi = makeMockPiSession()
    const adapted = makePiSessionAdapter(pi)

    const onEnd   = vi.fn()
    const onError = vi.fn()
    adapted.subscribe(vi.fn(), onEnd, onError)

    pi.emit({ type: 'message_end', message: { stopReason: 'end_turn' } })
    pi.emit(agentEndEvent())

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('ignores non-text-delta message_update events (thinking, toolcall, etc.)', () => {
    const pi = makeMockPiSession()
    const adapted = makePiSessionAdapter(pi)

    pi.emit({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'hmm' } })
    pi.emit({ type: 'message_update', assistantMessageEvent: { type: 'toolcall_delta', contentIndex: 1, delta: '{}' } })
    pi.emit({ type: 'tool_execution_start', toolCallId: 'x', toolName: 'bash', args: {} })

    const onDelta = vi.fn()
    const onEnd   = vi.fn()
    adapted.subscribe(onDelta, onEnd, vi.fn())

    expect(onDelta).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })
})

describe('makePiSessionFactory', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns the session without blocking on prompt()', async () => {
    let resolvePrompt!: () => void
    const promptDone = new Promise<void>(r => { resolvePrompt = r })

    const piSession = {
      prompt:    vi.fn(() => promptDone),
      steer:     vi.fn(async () => {}),
      abort:     vi.fn(async () => {}),
      subscribe: vi.fn((_cb: (e: unknown) => void) => () => {}),
    }

    vi.mocked(createAgentSession).mockResolvedValue({ session: piSession } as any)

    const factory = makePiSessionFactory({
      authStorage:    {} as any,
      modelRegistry:  { find: vi.fn().mockReturnValue({ provider: 'google', id: 'flash' }) } as any,
      sessionManager: {} as any,
    })

    // Fixed: resolves immediately without waiting for prompt().
    // Broken: hangs here because factory awaits promptDone, which never resolves.
    const session = await factory('do the thing', 'google/flash', '/cwd')

    expect(session).toBeDefined()
    expect(piSession.prompt).toHaveBeenCalledWith('do the thing')

    // Verify prompt is still in-flight (hasn't resolved)
    let promptCompleted = false
    promptDone.then(() => { promptCompleted = true })
    await Promise.resolve()
    expect(promptCompleted).toBe(false)

    resolvePrompt()
    await promptDone
  }, 500)
})
