import { z } from 'zod';

export const AI_MODELS = {
  openai: [
    { id: 'gpt-5.1',     name: 'GPT-5.1',      isDefault: true  },
    { id: 'gpt-5-mini',  name: 'GPT-5 Mini',    isDefault: false },
    { id: 'gpt-4o',      name: 'GPT-4o',        isDefault: false },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini',   isDefault: false },
  ],
  gemini: [
    { id: 'gemini-3-flash',         name: 'Gemini 3 Flash',         isDefault: true  },
    { id: 'gemini-3.1-pro',         name: 'Gemini 3.1 Pro',         isDefault: false },
    { id: 'gemini-3.1-flash',       name: 'Gemini 3.1 Flash',       isDefault: false },
    { id: 'gemini-2.5-flash',       name: 'Gemini 2.5 Flash',       isDefault: false },
    { id: 'gemini-2.0-flash',       name: 'Gemini 2.0 Flash',       isDefault: false },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isDefault: false },
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
 * Update this map when a provider changes or deprecates a model string.
 * The DB field ai_engine_rules.gemini_api_model takes priority over this map at runtime.
 */
export const MODEL_ALIAS_MAP: Record<string, string> = {
  // OpenAI
  'gpt-5.1':     'gpt-5',
  'gpt-5-mini':  'gpt-5-mini',
  'gpt-4o':      'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',

  // Google Gemini
  'gemini-3-flash':         'gemini-2.5-flash',
  'gemini-3.1-flash':       'gemini-2.5-flash',
  'gemini-3.1-pro':         'gemini-2.5-flash',
  'gemini-2.5-flash':       'gemini-2.5-flash',
  'gemini-2.0-flash':       'gemini-2.0-flash',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
};

/** Resolves a UI model ID to the actual API model string. Falls back to the raw ID. */
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

/**
 * ZOD SCHEMA: CONTRACT FOR AI GENERATED CONTENT
 * Ensures that the LLM response contains all necessary fields for Titles and BI Logging.
 */
export const AIResponseSchema = z.object({
  titles: z.object({
    S1: z.string(),
    S2: z.string(),
    S3: z.string(),
    S4: z.string(),
    S5: z.string(),
  }),
  composition_log: z.object({
    theme_mapped: z.string(),
    journey_layer: z.string(),
    metaphors_used: z.array(z.string()),
  })
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

