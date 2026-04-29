import type { PiClient, SessionStore } from './types.js';
type RunTaskParams = {
    task: string;
    model: string;
    cwd?: string;
    timeout?: number;
};
type SpawnParams = {
    task: string;
    model: string;
    cwd?: string;
};
type SessionIdParam = {
    session_id: string;
};
type SteerParams = SessionIdParam & {
    message: string;
};
export declare const TOOL_SCHEMAS: readonly [{
    readonly name: "pi_list_models";
    readonly description: "List Pi models available for this session with tier labels (fast/balanced/frontier).";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {};
    };
}, {
    readonly name: "pi_run_task";
    readonly description: "Run a task on a Pi agent and wait for completion. Returns accumulated output. On timeout, aborts and returns partial output with timedOut: true.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly task: {
                readonly type: "string";
                readonly description: "Task description for the Pi agent";
            };
            readonly model: {
                readonly type: "string";
                readonly description: "Model key in provider/id format (e.g. google/gemini-2.0-flash)";
            };
            readonly cwd: {
                readonly type: "string";
                readonly description: "Working directory for the agent (defaults to Claude's cwd)";
            };
            readonly timeout: {
                readonly type: "number";
                readonly description: "Timeout in ms (default 300000)";
            };
        };
        readonly required: readonly ["task", "model"];
    };
}, {
    readonly name: "pi_spawn_agent";
    readonly description: "Spawn a Pi agent and return a session_id immediately. Use pi_poll_agent to check progress.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly task: {
                readonly type: "string";
            };
            readonly model: {
                readonly type: "string";
                readonly description: "Model key in provider/id format";
            };
            readonly cwd: {
                readonly type: "string";
            };
        };
        readonly required: readonly ["task", "model"];
    };
}, {
    readonly name: "pi_steer_agent";
    readonly description: "Send a steering message to a running Pi agent.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly session_id: {
                readonly type: "string";
            };
            readonly message: {
                readonly type: "string";
            };
        };
        readonly required: readonly ["session_id", "message"];
    };
}, {
    readonly name: "pi_poll_agent";
    readonly description: "Check status and accumulated output of a spawned Pi agent.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly session_id: {
                readonly type: "string";
            };
        };
        readonly required: readonly ["session_id"];
    };
}, {
    readonly name: "pi_get_result";
    readonly description: "Wait for a spawned Pi agent to finish and return its final output.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly session_id: {
                readonly type: "string";
            };
        };
        readonly required: readonly ["session_id"];
    };
}, {
    readonly name: "pi_terminate_agent";
    readonly description: "Abort a running Pi agent and return whatever output was accumulated.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly session_id: {
                readonly type: "string";
            };
        };
        readonly required: readonly ["session_id"];
    };
}];
export declare const makeTools: (store: SessionStore, client: PiClient) => {
    tools: {
        pi_list_models: (_args: Record<string, unknown>) => Promise<{
            models: import("./types.js").ModelInfo[];
        }>;
        pi_run_task: ({ task, model, cwd, timeout }: RunTaskParams) => Promise<{
            output: string;
            timedOut?: true;
            error?: string;
        }>;
        pi_spawn_agent: ({ task, model, cwd }: SpawnParams) => Promise<{
            session_id: `${string}-${string}-${string}-${string}-${string}`;
        }>;
        pi_poll_agent: ({ session_id }: SessionIdParam) => Promise<{
            error?: string | undefined;
            status: import("./types.js").SessionStatus;
            output: string;
        }>;
        pi_steer_agent: ({ session_id, message }: SteerParams) => Promise<{
            ok: boolean;
        }>;
        pi_get_result: ({ session_id }: SessionIdParam) => Promise<{
            output: string;
        }>;
        pi_terminate_agent: ({ session_id }: SessionIdParam) => Promise<{
            output: string;
        }>;
    };
    schemas: readonly [{
        readonly name: "pi_list_models";
        readonly description: "List Pi models available for this session with tier labels (fast/balanced/frontier).";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {};
        };
    }, {
        readonly name: "pi_run_task";
        readonly description: "Run a task on a Pi agent and wait for completion. Returns accumulated output. On timeout, aborts and returns partial output with timedOut: true.";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly task: {
                    readonly type: "string";
                    readonly description: "Task description for the Pi agent";
                };
                readonly model: {
                    readonly type: "string";
                    readonly description: "Model key in provider/id format (e.g. google/gemini-2.0-flash)";
                };
                readonly cwd: {
                    readonly type: "string";
                    readonly description: "Working directory for the agent (defaults to Claude's cwd)";
                };
                readonly timeout: {
                    readonly type: "number";
                    readonly description: "Timeout in ms (default 300000)";
                };
            };
            readonly required: readonly ["task", "model"];
        };
    }, {
        readonly name: "pi_spawn_agent";
        readonly description: "Spawn a Pi agent and return a session_id immediately. Use pi_poll_agent to check progress.";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly task: {
                    readonly type: "string";
                };
                readonly model: {
                    readonly type: "string";
                    readonly description: "Model key in provider/id format";
                };
                readonly cwd: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["task", "model"];
        };
    }, {
        readonly name: "pi_steer_agent";
        readonly description: "Send a steering message to a running Pi agent.";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly session_id: {
                    readonly type: "string";
                };
                readonly message: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["session_id", "message"];
        };
    }, {
        readonly name: "pi_poll_agent";
        readonly description: "Check status and accumulated output of a spawned Pi agent.";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly session_id: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["session_id"];
        };
    }, {
        readonly name: "pi_get_result";
        readonly description: "Wait for a spawned Pi agent to finish and return its final output.";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly session_id: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["session_id"];
        };
    }, {
        readonly name: "pi_terminate_agent";
        readonly description: "Abort a running Pi agent and return whatever output was accumulated.";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly session_id: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["session_id"];
        };
    }];
};
export {};
