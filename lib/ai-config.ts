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
 * IDs here match what each provider accepts via their REST API.
 */
export const MODEL_ALIAS_MAP: Record<string, string> = {
  // OpenAI — GPT-5 family (released August 2025)
  'gpt-5.1':    'gpt-5',
  'gpt-5-mini': 'gpt-5-mini',
  'gpt-4o':     'gpt-4o',
  'gpt-4o-mini':'gpt-4o-mini',

  // Google Gemini — Gemini 3.x family (released late 2025 / early 2026)
  'gemini-3-flash':  'gemini-3-flash',
  'gemini-3.1-flash':'gemini-3.1-flash',
  'gemini-3.1-pro':  'gemini-3.1-pro',
};

/** Resolves a UI model ID to the real API model string. Falls back to the raw ID if not in the map. */
export function resolveModel(modelId: string): string {
  return MODEL_ALIAS_MAP[modelId] ?? modelId;
}
