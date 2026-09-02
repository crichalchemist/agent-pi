#!/usr/bin/env node
// Stub Pi MCP server for behavioral evals.
//
// Registers the REAL tool schemas and the REAL makeTools dispatch from bin/, but
// swaps in a canned PiClient — so a worker's pi_* calls are genuine MCP tool calls
// (and land in csd's pre_tool_use event stream) without spending a cent on Pi.
//
// Imports from bin/, not src/ — bin/ is what actually runs. Run `npm run build` first.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { makeSessionStore } from '../../bin/server/session-store.js'
import { makeTools } from '../../bin/server/tools.js'
import { getTier } from '../../bin/server/types.js'

// The exact fleet the scenarios advertise, so tier reasoning under test is grounded.
const MODEL_KEYS = [
  'google/gemini-2.0-flash',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-4o',
  'anthropic/claude-sonnet-4-6',
  'google/gemini-2.5-pro',
  'anthropic/claude-opus-4-7',
]

const models = MODEL_KEYS.map((key) => {
  const [provider, ...rest] = key.split('/')
  const id = rest.join('/')
  return { key, provider, id, tier: getTier(id) }   // real getTier — classification is under test too
})

const stubClient = {
  listModels: async () => models,
  startSession: async (task, modelKey) => ({
    steer:    async () => {},
    followUp: async () => {},
    abort:    async () => {},
    subscribe: (onDelta, onEnd) => {
      // Settle on a later tick so spawn records status 'running' before 'done',
      // exercising the same ordering as a real session.
      setTimeout(() => {
        onDelta(`[stub:${modelKey}] completed: ${String(task).slice(0, 60)}`)
        onEnd()
      }, 40)
      return () => {}
    },
  }),
}

const store = makeSessionStore({})
const { tools, schemas } = makeTools(store, stubClient, {
  sessionsDir: process.env.PI_SESSIONS_DIR,   // eval runner points this at a scratch dir
})

const server = new Server({ name: 'pi', version: 'stub' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: schemas }))
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = tools[request.params.name]
  if (!handler) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
  const result = await handler(request.params.arguments ?? {})
  return { content: [{ type: 'text', text: JSON.stringify(result) }] }
})

await server.connect(new StdioServerTransport())
