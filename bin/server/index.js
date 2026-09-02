import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent';
import { makeSessionStore } from './session-store.js';
import { makePiClient, makePiSessionFactory } from './pi-client.js';
import { makeTools } from './tools.js';
import { makeStatusWriter } from './status-writer.js';
// ModelRuntime.create() reads Pi's local model store and resolves credentials itself —
// no AuthStorage to thread through. It stays off the network by default (allowModelNetwork
// is false), so this adds ~40ms of local I/O before server.connect(), not a network round trip.
const modelRuntime = await ModelRuntime.create();
const sessionManager = SessionManager.inMemory();
const sessionDeps = { modelRuntime, sessionManager };
// writeStatus is assigned after store creation; onChange only fires post-construction
let writeStatus;
const store = makeSessionStore({
    onChange: () => { writeStatus?.().catch(() => { }); },
});
writeStatus = makeStatusWriter({ store });
const factory = makePiSessionFactory(sessionDeps);
const client = makePiClient(factory, modelRuntime);
const { tools: toolHandlers, schemas } = makeTools(store, client);
// Each handler has a specific typed params interface (RunTaskParams, SpawnParams, etc.) to keep
// tool implementations type-safe internally. At the MCP dispatch boundary we need a uniform
// index-by-string type; the as unknown as cast is intentional — MCP args arrive untyped and
// each handler validates its own required fields at runtime.
const tools = toolHandlers;
const server = new Server({ name: 'pi', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: schemas,
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handler = tools[request.params.name];
    if (!handler) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
    try {
        const result = await handler(request.params.arguments ?? {});
        return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
        };
    }
    catch (err) {
        // PiError objects are plain discriminated unions — String(obj) produces "[object Object]".
        // JSON.stringify preserves the kind and contextual fields for the MCP caller.
        throw new McpError(ErrorCode.InternalError, err instanceof Error ? err.message : JSON.stringify(err));
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
// Write idle status immediately so stale data from a previous process is cleared.
writeStatus().catch(() => { });
const cleanup = () => {
    store.dispose();
    process.exit(0);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
