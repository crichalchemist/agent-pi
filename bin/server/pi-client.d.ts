import { AuthStorage, ModelRegistry, SessionManager } from '@mariozechner/pi-coding-agent';
import type { PiClient, SessionFactory } from './types.js';
type ModelRegistryLike = {
    getAvailable: () => Array<{
        provider: string;
        id: string;
    }> | PromiseLike<Array<{
        provider: string;
        id: string;
    }>>;
};
export declare const makePiSessionFactory: (deps: {
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    sessionManager: SessionManager;
}) => SessionFactory;
export declare const makePiClient: (factory: SessionFactory, modelRegistry: ModelRegistryLike) => PiClient;
export {};
