export type SessionStatus = 'running' | 'done' | 'error';
export type ModelTier = 'fast' | 'balanced' | 'frontier';
export type ModelInfo = {
    readonly key: string;
    readonly provider: string;
    readonly id: string;
    readonly tier: ModelTier;
};
export type ActiveSession = {
    steer: (text: string) => Promise<void>;
    abort: () => Promise<void>;
    subscribe: (onDelta: (text: string) => void, onEnd: () => void, onError: (message: string) => void) => () => void;
};
export type SessionEntry = {
    readonly session: ActiveSession;
    readonly output: string;
    readonly status: SessionStatus;
    readonly error?: string;
    readonly createdAt: number;
};
export type SessionStore = {
    add: (id: string, entry: SessionEntry) => void;
    get: (id: string) => SessionEntry | undefined;
    update: (id: string, patch: Partial<Pick<SessionEntry, 'output' | 'status' | 'error'>>) => void;
    remove: (id: string) => void;
    all: () => ReadonlyMap<string, SessionEntry>;
    dispose: () => void;
};
export type SessionFactory = (task: string, modelKey: string, cwd: string) => Promise<ActiveSession>;
export type PiClient = {
    startSession: (task: string, modelKey: string, cwd: string) => Promise<ActiveSession>;
    listModels: () => Promise<ModelInfo[]>;
};
export type PiError = {
    kind: 'auth_failed';
    message: string;
} | {
    kind: 'model_not_found';
    model: string;
} | {
    kind: 'session_timeout';
    session_id: string;
    partialOutput: string;
} | {
    kind: 'pi_unavailable';
    message: string;
} | {
    kind: 'session_not_found';
    session_id: string;
};
export declare const MODEL_TIERS: Record<string, ModelTier>;
export declare const getTier: (modelId: string) => ModelTier;
