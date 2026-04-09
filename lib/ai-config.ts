export const AI_MODELS = {
  openai: [
    { id: 'gpt-5.1', name: 'GPT-5.1 (High Tech)', isDefault: true },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini (Speed)', isDefault: false },
    { id: 'gpt-4o', name: 'GPT-4o (Standard)', isDefault: false },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', isDefault: false },
  ],
  gemini: [
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash (Fast)', isDefault: true },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', isDefault: false },
    { id: 'gemini-3.1-flash', name: 'Gemini 3.1 Flash', isDefault: false },
  ]
};

export type AIModelType = 'openai' | 'gemini';

export interface AIConfig {
  engine: AIModelType;
  model: string;
}

export const DEFAULT_CONFIG: AIConfig = {
  engine: 'openai',
  model: 'gpt-5.1'
};

/**
 * Translates UI model IDs to their actual API endpoint identifiers.
 * Gemini IDs map to stable strings accepted by the v1beta generateContent endpoint.
 * OpenAI IDs map to strings accepted by the /v1/chat/completions endpoint.
 */
export const MODEL_ALIAS_MAP: Record<string, string> = {
  // OpenAI
  'gpt-5.1':    'gpt-5',
  'gpt-5-mini': 'gpt-5-mini',
  'gpt-4o':     'gpt-4o',
  'gpt-4o-mini':'gpt-4o-mini',

  // Google Gemini — mapped to valid v1beta API strings
  'gemini-3-flash':  'gemini-2.5-flash-preview-04-17',
  'gemini-3.1-flash':'gemini-2.5-flash-preview-04-17',
  'gemini-3.1-pro':  'gemini-2.5-pro-preview-03-25',
};

/** Resolves a UI model ID to the real API model string. Falls back to the raw ID if not in the map. */
export function resolveModel(modelId: string): string {
  return MODEL_ALIAS_MAP[modelId] ?? modelId;
}

/**
 * Returns true for models that do not support a custom temperature value.
 * These models require temperature to be omitted or set to exactly 1.
 */
export function isReasoningModel(modelId: string): boolean {
  const resolved = resolveModel(modelId);
  return resolved.startsWith('o1') || resolved.startsWith('o3') || resolved.startsWith('gpt-5');
}
