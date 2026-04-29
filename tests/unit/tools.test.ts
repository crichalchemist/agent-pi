import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeTools } from '../../src/server/tools.js'
import { makeSessionStore } from '../../src/server/session-store.js'
import type { ActiveSession, PiClient, ModelInfo } from '../../src/server/types.js'

const MODELS: ModelInfo[] = [
  { key: 'google/gemini-2.0-flash', provider: 'google', id: 'gemini-2.0-flash', tier: 'fast' },
  { key: 'google/gemini-2.5-pro',   provider: 'google', id: 'gemini-2.5-pro',   tier: 'frontier' },
]

const makeSession = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  steer: vi.fn(async () => {}),
  abort: vi.fn(async () => {}),
  subscribe: vi.fn((onDelta, onEnd) => {
    // Default: immediately emit one delta then end
    setTimeout(() => { onDelta('result'); onEnd() }, 0)
    return () => {}
  }),
  ...overrides,
})

const makeClient = (session: ActiveSession = makeSession()): PiClient => ({
  startSession: vi.fn(async () => session),
  listModels: vi.fn(async () => MODELS),
})

describe('pi_list_models', () => {
  it('returns models from the client', async () => {
    const { tools } = makeTools(makeSessionStore(), makeClient())
    const result = await tools.pi_list_models({})
    expect(result).toEqual({ models: MODELS })
  })
})

describe('pi_run_task', () => {
  it('starts a session, collects output, and returns it', async () => {
    const session = makeSession()
    const client = makeClient(session)
    const { tools } = makeTools(makeSessionStore(), client)

    const result = await tools.pi_run_task({
      task: 'do work',
      model: 'google/gemini-2.0-flash',
      cwd: '/tmp',
    })

    expect(client.startSession).toHaveBeenCalledWith('do work', 'google/gemini-2.0-flash', '/tmp')
    expect(result).toEqual({ output: 'result' })
  })

  it('uses process.cwd() when cwd is omitted', async () => {
    const client = makeClient()
    const { tools } = makeTools(makeSessionStore(), client)

    await tools.pi_run_task({ task: 'x', model: 'google/gemini-2.0-flash' })

    expect(client.startSession).toHaveBeenCalledWith('x', 'google/gemini-2.0-flash', process.cwd())
  })

  it('resolves correctly when onEnd fires synchronously during subscribe (buffered fast completion)', async () => {
    const session = makeSession({
      subscribe: vi.fn((onDelta, onEnd) => {
        // Synchronous — simulates buffer drain in makePiSessionAdapter
        onDelta('sync output')
        onEnd()
        return () => {}
      }),
    })
    const { tools } = makeTools(makeSessionStore(), makeClient(session))
    const result = await tools.pi_run_task({ task: 'x', model: 'google/gemini-2.0-flash' })
    expect(result.output).toBe('sync output')
  })

  it('returns error field when agent errors before completing', async () => {
    const session = makeSession({
      subscribe: vi.fn((onDelta, _onEnd, onError) => {
        setTimeout(() => { onDelta('partial output'); onError('400 model rejected request') }, 0)
        return () => {}
      }),
    })
    const { tools } = makeTools(makeSessionStore(), makeClient(session))
    const result = await tools.pi_run_task({ task: 'x', model: 'google/gemini-2.0-flash' })
    expect(result.error).toBe('400 model rejected request')
    expect(result.output).toBe('partial output')
  })

  it('returns partial output on timeout', async () => {
    vi.useFakeTimers()
    const session = makeSession({
      subscribe: vi.fn((onDelta, _onEnd) => {
        setTimeout(() => onDelta('partial'), 100)
        // never calls onEnd
        return () => {}
      }),
      abort: vi.fn(async () => {}),
    })
    const { tools } = makeTools(makeSessionStore(), makeClient(session))

    const resultPromise = tools.pi_run_task({
      task: 'slow task',
      model: 'google/gemini-2.5-pro',
      timeout: 50,
    })
    await vi.advanceTimersByTimeAsync(50)
    const result = await resultPromise

    expect(result.timedOut).toBe(true)
    expect(session.abort).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('pi_spawn_agent', () => {
  it('returns a session_id immediately without waiting for completion', async () => {
    let endCalled = false
    const session = makeSession({
      subscribe: vi.fn((onDelta, onEnd) => {
        setTimeout(() => { onDelta('text'); onEnd(); endCalled = true }, 100)
        return () => {}
      }),
    })
    const store = makeSessionStore()
    const { tools } = makeTools(store, makeClient(session))

    const { session_id } = await tools.pi_spawn_agent({ task: 'x', model: 'google/gemini-2.0-flash' })

    expect(typeof session_id).toBe('string')
    expect(session_id.length).toBeGreaterThan(0)
    expect(endCalled).toBe(false)  // async event not fired yet
    store.dispose()
  })

  it('accumulates output in store as events arrive', async () => {
    vi.useFakeTimers()
    const session = makeSession({
      subscribe: vi.fn((onDelta, onEnd) => {
        setTimeout(() => { onDelta('hello '); onDelta('world'); onEnd() }, 10)
        return () => {}
      }),
    })
    const store = makeSessionStore()
    const { tools } = makeTools(store, makeClient(session))

    const { session_id } = await tools.pi_spawn_agent({ task: 'x', model: 'google/gemini-2.5-pro' })

    vi.advanceTimersByTime(10)
    await Promise.resolve()  // flush microtasks

    expect(store.get(session_id)?.output).toBe('hello world')
    expect(store.get(session_id)?.status).toBe('done')
    store.dispose()
    vi.useRealTimers()
  })
})

describe('pi_poll_agent', () => {
  it('returns running status and current output for a live session', async () => {
    const store = makeSessionStore()
    const { tools } = makeTools(store, makeClient())
    const { session_id } = await tools.pi_spawn_agent({ task: 'x', model: 'google/gemini-2.0-flash' })

    const result = await tools.pi_poll_agent({ session_id })
    expect(result.status).toBe('running')
    store.dispose()
  })

  it('returns error for unknown session_id', async () => {
    const { tools } = makeTools(makeSessionStore(), makeClient())
    const result = await tools.pi_poll_agent({ session_id: 'no-such-id' })
    expect(result.error).toMatch(/not found/)
  })
})

describe('pi_steer_agent', () => {
  it('calls steer on the session and returns { ok: true }', async () => {
    const session = makeSession()
    const store = makeSessionStore()
    const { tools } = makeTools(store, makeClient(session))

    const { session_id } = await tools.pi_spawn_agent({ task: 'x', model: 'google/gemini-2.0-flash' })
    const result = await tools.pi_steer_agent({ session_id, message: 'focus on types' })

    expect(session.steer).toHaveBeenCalledWith('focus on types')
    expect(result).toEqual({ ok: true })
    store.dispose()
  })

  it('returns { ok: false } for unknown session', async () => {
    const { tools } = makeTools(makeSessionStore(), makeClient())
    const result = await tools.pi_steer_agent({ session_id: 'nope', message: 'steer' })
    expect(result).toEqual({ ok: false })
  })
})

describe('pi_terminate_agent', () => {
  it('aborts the session and returns accumulated output', async () => {
    vi.useFakeTimers()
    const session = makeSession({
      subscribe: vi.fn((onDelta) => {
        setTimeout(() => onDelta('partial output'), 10)
        return () => {}
      }),
      abort: vi.fn(async () => {}),
    })
    const store = makeSessionStore()
    const { tools } = makeTools(store, makeClient(session))

    const { session_id } = await tools.pi_spawn_agent({ task: 'x', model: 'google/gemini-2.5-pro' })
    vi.advanceTimersByTime(10)
    await Promise.resolve()

    const result = await tools.pi_terminate_agent({ session_id })

    expect(session.abort).toHaveBeenCalled()
    expect(result.output).toBe('partial output')
    store.dispose()
    vi.useRealTimers()
  })
})

describe('pi_get_result', () => {
  it('returns output once session is done', async () => {
    vi.useFakeTimers()
    const session = makeSession({
      subscribe: vi.fn((onDelta, onEnd) => {
        setTimeout(() => { onDelta('final'); onEnd() }, 10)
        return () => {}
      }),
    })
    const store = makeSessionStore()
    const { tools } = makeTools(store, makeClient(session))

    const { session_id } = await tools.pi_spawn_agent({ task: 'x', model: 'google/gemini-2.5-pro' })
    vi.advanceTimersByTime(10)
    await Promise.resolve()

    const result = await tools.pi_get_result({ session_id })
    expect(result).toEqual({ output: 'final' })
    store.dispose()
    vi.useRealTimers()
  })

  it('rejects with error message for unknown session', async () => {
    const { tools } = makeTools(makeSessionStore(), makeClient())
    await expect(tools.pi_get_result({ session_id: 'nope' })).rejects.toMatchObject({
      kind: 'session_not_found',
    })
  })
})
