import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SessionStore } from './types.js'

type StatusData = {
  running: number
  models: string[]
  totalOutputBytes: number
  updatedAt: number
}

const DEFAULT_STATUS_DIR = join(homedir(), '.claude', 'claude-pi')

const stripProvider = (modelKey: string): string => {
  const slash = modelKey.indexOf('/')
  return slash === -1 ? modelKey : modelKey.slice(slash + 1)
}

export const makeStatusWriter = (opts: {
  statusDir?: string
  store: SessionStore
}): () => Promise<void> => {
  const dir = opts.statusDir ?? DEFAULT_STATUS_DIR
  const { store } = opts

  // Each call gets a unique tmp path so concurrent writes don't collide.
  let seq = 0

  return async () => {
    const entries = [...store.all().values()]

    const running = entries.filter(e => e.status === 'running')
    const models = running
      .map(e => e.model ? stripProvider(e.model) : null)
      .filter((m): m is string => m !== null)

    const totalOutputBytes = entries.reduce((sum, e) => sum + Buffer.byteLength(e.output), 0)

    const data: StatusData = {
      running: running.length,
      models,
      totalOutputBytes,
      updatedAt: Date.now(),
    }

    await mkdir(dir, { recursive: true })
    const statusPath = join(dir, 'status.json')
    const tmpPath = join(dir, `.status.${seq++}.tmp`)
    await writeFile(tmpPath, JSON.stringify(data))
    await rename(tmpPath, statusPath)
  }
}
