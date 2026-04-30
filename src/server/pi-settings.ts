import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export type PiSettings = {
  enabledModels?: string[]
  defaultModel?: string
  defaultProvider?: string
}

const DEFAULT_SETTINGS_PATH = join(homedir(), '.pi', 'agent', 'settings.json')

export const readPiSettings = async (path = DEFAULT_SETTINGS_PATH): Promise<PiSettings> => {
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as PiSettings
  } catch {
    return {}
  }
}

export const filterByEnabledModels = <T extends { provider: string; id: string }>(
  models: T[],
  settings: PiSettings
): T[] => {
  const { enabledModels } = settings
  if (!enabledModels || enabledModels.length === 0) return models
  const enabled = new Set(enabledModels)
  return models.filter(m => enabled.has(`${m.provider}/${m.id}`))
}
