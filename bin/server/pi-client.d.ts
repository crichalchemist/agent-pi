import { AuthStorage, ModelRegistry, SessionManager } from '@mariozechner/pi-coding-agent';
import type { ActiveSession, PiClient, SessionFactory } from './types.js';
import { type PiSettings } from './pi-settings.js';
type ModelRegistryLike = {
    getAvailable: () => Array<{
        provider: string;
        id: string;
    }> | PromiseLike<Array<{
        provider: string;
        id: string;
    }>>;
};
type PiSessionLike = {
    steer: (text: string) => Promise<void>;
    abort: () => Promise<void>;
    subscribe: (listener: (event: unknown) => void) => () => void;
};
export declare const makePiSessionAdapter: (piSession: PiSessionLike) => ActiveSession;
export declare const makePiSessionFactory: (deps: {
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    sessionManager: SessionManager;
}) => SessionFactory;
export declare const makePiClient: (factory: SessionFactory, modelRegistry: ModelRegistryLike, opts?: {
    readSettings?: () => Promise<PiSettings>;
}) => PiClient;
export {};
