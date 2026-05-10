import type { PiClient, SessionStore } from './types.js';
type RunTaskParams = {
    task: string;
    model: string;
    cwd?: string;
    timeout?: number;
    followUp?: boolean;
};
type SpawnParams = {
    task: string;
    model: string;
    cwd?: string;
    followUp?: boolean;
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
                readonly description: "Model key in \"provider/model-id\" format (e.g. google/gemini-2.0-flash, anthropic/claude-haiku-4-5, openai/gpt-4o)";
            };
            readonly cwd: {
                readonly type: "string";
                readonly description: "Working directory for the agent (defaults to Claude's cwd)";
            };
            readonly timeout: {
                readonly type: "number";
                readonly description: "Timeout in ms (default 300000)";
            };
            readonly followUp: {
                readonly type: "boolean";
                readonly description: "If true, queues the message to be delivered after the agent finishes all work (non-interruptive). Default false.";
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
                readonly description: "Task description for the Pi agent";
            };
            readonly model: {
                readonly type: "string";
                readonly description: "Model key in \"provider/model-id\" format (e.g. anthropic/claude-sonnet-4-6, openai/gpt-4o)";
            };
            readonly cwd: {
                readonly type: "string";
            };
            readonly followUp: {
                readonly type: "boolean";
                readonly description: "If true, queues the message to be delivered after the agent finishes all work (non-interruptive). Default false.";
            };
        };
        readonly required: readonly ["task", "model"];
    };
}, {
    readonly name: "pi_steer_agent";
    readonly description: "Send a steering message to a running Pi agent. Delivered after the current assistant turn finishes its tool calls. Use pi_followup_agent if you want to wait for full completion before sending.";
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
    readonly name: "pi_followup_agent";
    readonly description: "Queue a follow-up message for a spawned Pi agent. Delivered only after the agent finishes all work. Use this when you do not want to interrupt the agent at all.";
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
export declare const makeTools: (store: SessionStore, client: PiClient, opts?: {
    sessionsDir?: string;
}) => {
    tools: {
        pi_list_models: (_args: Record<string, unknown>) => Promise<{
            models: import("./types.js").ModelInfo[];
        }>;
        pi_run_task: ({ task, model, cwd, timeout, followUp }: RunTaskParams) => Promise<{
            output: string;
            timedOut?: true;
            error?: string;
        }>;
        pi_spawn_agent: ({ task, model, cwd, followUp }: SpawnParams) => Promise<{
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
        pi_followup_agent: ({ session_id, message }: SteerParams) => Promise<{
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
                    readonly description: "Model key in \"provider/model-id\" format (e.g. google/gemini-2.0-flash, anthropic/claude-haiku-4-5, openai/gpt-4o)";
                };
                readonly cwd: {
                    readonly type: "string";
                    readonly description: "Working directory for the agent (defaults to Claude's cwd)";
                };
                readonly timeout: {
                    readonly type: "number";
                    readonly description: "Timeout in ms (default 300000)";
                };
                readonly followUp: {
                    readonly type: "boolean";
                    readonly description: "If true, queues the message to be delivered after the agent finishes all work (non-interruptive). Default false.";
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
                    readonly description: "Task description for the Pi agent";
                };
                readonly model: {
                    readonly type: "string";
                    readonly description: "Model key in \"provider/model-id\" format (e.g. anthropic/claude-sonnet-4-6, openai/gpt-4o)";
                };
                readonly cwd: {
                    readonly type: "string";
                };
                readonly followUp: {
                    readonly type: "boolean";
                    readonly description: "If true, queues the message to be delivered after the agent finishes all work (non-interruptive). Default false.";
                };
            };
            readonly required: readonly ["task", "model"];
        };
    }, {
        readonly name: "pi_steer_agent";
        readonly description: "Send a steering message to a running Pi agent. Delivered after the current assistant turn finishes its tool calls. Use pi_followup_agent if you want to wait for full completion before sending.";
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
        readonly name: "pi_followup_agent";
        readonly description: "Queue a follow-up message for a spawned Pi agent. Delivered only after the agent finishes all work. Use this when you do not want to interrupt the agent at all.";
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
