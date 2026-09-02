import { ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent';
import type { ActiveSession, PiClient, SessionFactory } from './types.js';
import { type PiSettings } from './pi-settings.js';
type ModelRuntimeLike = {
    getAvailable: () => ReadonlyArray<{
        provider: string;
        id: string;
    }> | PromiseLike<ReadonlyArray<{
        provider: string;
        id: string;
    }>>;
    getModel: (provider: string, id: string) => unknown;
};
type PiSessionLike = {
    steer: (text: string) => Promise<void>;
    followUp?: (text: string) => Promise<void>;
    abort: () => Promise<void>;
    subscribe: (listener: (event: unknown) => void) => () => void;
};
export declare const makePiSessionAdapter: (piSession: PiSessionLike, opts?: {
    followUp?: boolean;
}) => ActiveSession;
export declare const makePiSessionFactory: (deps: {
    modelRuntime: ModelRuntime;
    sessionManager: SessionManager;
}) => SessionFactory;
export declare const makePiClient: (factory: SessionFactory, modelRuntime: ModelRuntimeLike, opts?: {
    readSettings?: () => Promise<PiSettings>;
}) => PiClient;
export {};
