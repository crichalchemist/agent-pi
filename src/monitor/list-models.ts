import { fileURLToPath } from 'node:url'
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent'
import { getTier } from '../server/types.js'
import { readPiSettings, filterByEnabledModels, type PiSettings } from '../server/pi-settings.js'

type ModelLike = { provider: string; id: string }

type RunOpts = {
  getAvailable?: () => ModelLike[] | Promise<ModelLike[]>
  readSettings?: () => Promise<PiSettings>
  output?: (line: string) => void
  exit?: (code: number) => void
}

const LOG_PREFIX = '[pi-models]'
const REFRESH_TOOL = 'pi_list_models'

const NO_MODELS_MSG =
  `${LOG_PREFIX} No models available — configure Pi auth with \`pi auth\` or set provider env vars`

const formatLine = (models: ModelLike[], settings: PiSettings): string => {
  const parts = models.map(m => `${m.id} (${getTier(m.id)})`).join(', ')
  const defaultKey = settings.defaultProvider && settings.defaultModel
    ? ` — default: ${settings.defaultProvider}/${settings.defaultModel}`
    : ''
  return `${LOG_PREFIX} Available: ${parts}${defaultKey} — use ${REFRESH_TOOL} to refresh`
}

const defaultGetAvailable = (): ModelLike[] => {
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)
  return modelRegistry.getAvailable()
}

export const run = async (opts: RunOpts = {}): Promise<void> => {
  const {
    getAvailable = defaultGetAvailable,
    readSettings = readPiSettings,
    output = console.log,
    exit = process.exit,
  } = opts

  try {
    const [rawModels, settings] = await Promise.all([
      Promise.resolve(getAvailable()),
      readSettings().catch(() => ({} as PiSettings)),
    ])
    const models = filterByEnabledModels(rawModels, settings)
    if (models.length === 0) {
      output(NO_MODELS_MSG)
    } else {
      output(formatLine(models, settings))
    }
    exit(0)
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to load models:`, err instanceof Error ? err.message : String(err))
    exit(1)
  }
}

// Only auto-run when this file is the entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
}
