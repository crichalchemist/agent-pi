import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { AuthStorage, ModelRegistry, SessionManager } from '@mariozechner/pi-coding-agent'
import { makeSessionStore } from './session-store.js'
import { makePiClient, makePiSessionFactory } from './pi-client.js'
import { makeTools } from './tools.js'

const authStorage = AuthStorage.create()
const modelRegistry = ModelRegistry.create(authStorage)
const sessionManager = SessionManager.inMemory()
const sessionDeps = { authStorage, modelRegistry, sessionManager }

const store = makeSessionStore()
const factory = makePiSessionFactory(sessionDeps)
const client = makePiClient(factory, modelRegistry)
const { tools: toolHandlers, schemas } = makeTools(store, client)
const tools = toolHandlers as unknown as Record<string, (args: Record<string, unknown>) => Promise<unknown>>

const server = new Server(
  { name: 'pi', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: schemas,
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = tools[request.params.name]
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
  }

  try {
    const result = await handler(request.params.arguments ?? {})
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    }
  } catch (err) {
    throw new McpError(
      ErrorCode.InternalError,
      err instanceof Error ? err.message : String(err)
    )
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)

const cleanup = () => {
  store.dispose()
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
