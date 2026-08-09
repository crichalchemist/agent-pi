import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
const DEFAULT_SETTINGS_PATH = join(homedir(), '.pi', 'agent', 'settings.json');
export const readPiSettings = async (path = DEFAULT_SETTINGS_PATH) => {
    try {
        const raw = await readFile(path, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
};
const patternToRegex = (pattern) => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
};
export const filterByEnabledModels = (models, settings) => {
    const { enabledModels } = settings;
    if (!enabledModels || enabledModels.length === 0)
        return models;
    const patterns = enabledModels.map(patternToRegex);
    return models.filter(m => {
        const key = `${m.provider}/${m.id}`;
        return patterns.some(re => re.test(key));
    });
};
