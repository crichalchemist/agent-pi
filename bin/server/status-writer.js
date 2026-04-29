import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
const DEFAULT_STATUS_DIR = join(homedir(), '.claude', 'claude-pi');
const stripProvider = (modelKey) => {
    const slash = modelKey.indexOf('/');
    return slash === -1 ? modelKey : modelKey.slice(slash + 1);
};
export const makeStatusWriter = (opts) => {
    const dir = opts.statusDir ?? DEFAULT_STATUS_DIR;
    const { store } = opts;
    return async () => {
        const entries = [...store.all().values()];
        const running = entries.filter(e => e.status === 'running');
        const models = running
            .map(e => e.model ? stripProvider(e.model) : null)
            .filter((m) => m !== null);
        const totalOutputBytes = entries.reduce((sum, e) => sum + Buffer.byteLength(e.output), 0);
        const data = {
            running: running.length,
            models,
            totalOutputBytes,
            updatedAt: Date.now(),
        };
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, 'status.json'), JSON.stringify(data));
    };
};
