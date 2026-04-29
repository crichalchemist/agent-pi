import type { SessionStore } from './types.js';
export declare const makeSessionStore: (opts?: {
    ttlMs?: number;
    cleanupIntervalMs?: number;
}) => SessionStore;
