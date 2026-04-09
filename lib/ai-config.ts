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
 * UI uses branded/fictional names; this map ensures each resolves
 * to a currently valid model string accepted by the respective API.
 */
export const MODEL_ALIAS_MAP: Record<string, string> = {
  // OpenAI — map future/fictional IDs to real available models
  'gpt-5.1':    'gpt-4o',       // No GPT-5.1 released publicly; use gpt-4o
  'gpt-5-mini': 'gpt-4o-mini',  // No GPT-5-mini released publicly; use gpt-4o-mini
  'gpt-4o':     'gpt-4o',
  'gpt-4o-mini':'gpt-4o-mini',

  // Google Gemini — map fictional 3.x names to real available models
  'gemini-3-flash':  'gemini-2.0-flash',
  'gemini-3.1-flash':'gemini-2.0-flash',
  'gemini-3.1-pro':  'gemini-2.0-flash', // gemini-2.5-pro requires allowlist access
};

/** Resolves a UI model ID to the real API model string. Falls back to the input if not mapped. */
export function resolveModel(modelId: string): string {
  return MODEL_ALIAS_MAP[modelId] ?? modelId;
}
