import { describe, it, expect, vi } from 'vitest'
import { makePiClient } from '../../src/server/pi-client.js'
import type { ActiveSession, ModelInfo, SessionFactory } from '../../src/server/types.js'

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
