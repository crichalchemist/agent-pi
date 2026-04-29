import { fileURLToPath } from 'node:url'
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent'
import { getTier } from '../server/types.js'

type ModelLike = { provider: string; id: string }

type RunOpts = {
  getAvailable?: () => ModelLike[] | Promise<ModelLike[]>
  output?: (line: string) => void
  exit?: (code: number) => void
}

const NO_MODELS_MSG =
  '[pi-models] No models available — configure Pi auth with `pi auth` or set provider env vars'

const formatLine = (models: ModelLike[]): string => {
  const parts = models.map(m => `${m.id} (${getTier(m.id)})`).join(', ')
  return `[pi-models] Available: ${parts} — use pi_list_models to refresh`
}

const defaultGetAvailable = (): ModelLike[] => {
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)
  return modelRegistry.getAvailable()
}

export const run = async (opts: RunOpts = {}): Promise<void> => {
  const {
    getAvailable = defaultGetAvailable,
    output = console.log,
    exit = process.exit,
  } = opts

  try {
    const models = await getAvailable()
    if (models.length === 0) {
      output(NO_MODELS_MSG)
    } else {
      output(formatLine(models))
    }
    exit(0)
  } catch {
    exit(1)
  }
}

// Only auto-run when this file is the entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
}
