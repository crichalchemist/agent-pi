import { describe, it, expect, vi } from 'vitest'
import { makePiClient, makePiSessionAdapter } from '../../src/server/pi-client.js'
import type { ActiveSession, ModelInfo, SessionFactory } from '../../src/server/types.js'

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

const textDeltaEvent = (text: string) => ({
  type: 'message_update',
  assistantMessageEvent: {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  },
})
const agentEndEvent = () => ({ type: 'agent_end', messages: [] })

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
    const client = makePiClient(vi.fn(), mockModelRegistry)
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
    const client = makePiClient(vi.fn(), registry)
    const models = await client.listModels()
    expect(models[0].tier).toBe('balanced')
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

  it('ignores non-text-delta message_update events', () => {
    const pi = makeMockPiSession()
    const adapted = makePiSessionAdapter(pi)

    pi.emit({ type: 'message_update', assistantMessageEvent: { type: 'message_start' } })
    pi.emit({ type: 'tool_execution_start', toolCallId: 'x', toolName: 'bash', args: {} })

    const onDelta = vi.fn()
    const onEnd   = vi.fn()
    adapted.subscribe(onDelta, onEnd, vi.fn())

    expect(onDelta).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })
})
