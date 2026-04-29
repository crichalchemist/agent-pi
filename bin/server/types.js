// Tier labels keyed on Pi's model id field
export const MODEL_TIERS = {
    'gemini-2.5-pro': 'frontier',
    'gemini-2.0-flash': 'fast',
    'claude-haiku-4-5': 'fast',
    'claude-sonnet-4-6': 'balanced',
    'claude-opus-4-7': 'frontier',
    'gpt-4o': 'balanced',
    'gpt-4o-mini': 'fast',
    'o3': 'frontier',
    'o3-mini': 'balanced',
    'o4-mini': 'balanced',
};
export const getTier = (modelId) => MODEL_TIERS[modelId] ?? 'balanced';
