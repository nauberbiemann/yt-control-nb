import { z } from 'zod';

export const AI_MODELS = {
  openai: [
    { id: 'gpt-5.1',       name: 'GPT-5.1',        isDefault: true  },
    { id: 'gpt-5.4',       name: 'GPT-5.4',        isDefault: false },
    { id: 'gpt-5.4-mini',  name: 'GPT-5.4 Mini',   isDefault: false },
    { id: 'gpt-5.4-nano',  name: 'GPT-5.4 Nano',   isDefault: false },
    { id: 'gpt-5.2',       name: 'GPT-5.2',        isDefault: false },
    { id: 'gpt-5',         name: 'GPT-5',          isDefault: false },
    { id: 'gpt-5-mini',    name: 'GPT-5 Mini',     isDefault: false },
    { id: 'gpt-5-nano',    name: 'GPT-5 Nano',     isDefault: false },
    { id: 'gpt-4.1',       name: 'GPT-4.1',        isDefault: false },
    { id: 'gpt-4.1-mini',  name: 'GPT-4.1 Mini',   isDefault: false },
    { id: 'gpt-4.1-nano',  name: 'GPT-4.1 Nano',   isDefault: false },
    { id: 'gpt-4o',        name: 'GPT-4o',         isDefault: false },
    { id: 'gpt-4o-mini',   name: 'GPT-4o Mini',    isDefault: false },
    { id: 'o1',            name: 'o1 (Reasoning)', isDefault: false },
    { id: 'o1-mini',       name: 'o1-mini (Reasoning)', isDefault: false },
    { id: 'o3',            name: 'o3 (Reasoning)', isDefault: false },
    { id: 'o3-mini',       name: 'o3-mini (Reasoning)', isDefault: false },
    { id: 'o4-mini',       name: 'o4-mini (Reasoning)', isDefault: false },
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
  // OpenAI Models Map
  'gpt-5.1':       'gpt-5.1',
  'gpt-5.4':       'gpt-5.4',
  'gpt-5.4-mini':  'gpt-5.4-mini',
  'gpt-5.4-nano':  'gpt-5.4-nano',
  'gpt-5.2':       'gpt-5.2',
  'gpt-5':         'gpt-5',
  'gpt-5-mini':    'gpt-5-mini',
  'gpt-5-nano':    'gpt-5-nano',
  'gpt-4.1':       'gpt-4.1',
  'gpt-4.1-mini':  'gpt-4.1-mini',
  'gpt-4.1-nano':  'gpt-4.1-nano',
  'gpt-4o':        'gpt-4o',
  'gpt-4o-mini':   'gpt-4o-mini',
  'o1':            'o1',
  'o1-mini':       'o1-mini',
  'o3':            'o3',
  'o3-mini':       'o3-mini',
  'o4-mini':       'o4-mini',

  // Google Gemini Models Map
  'gemini-3-flash':         'gemini-3-flash',
  'gemini-3.1-flash':       'gemini-3.1-flash',
  'gemini-3.1-pro':         'gemini-3.1-pro',
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
  if (resolved.startsWith('o1') || resolved.startsWith('o3') || resolved.startsWith('o4')) {
    return true;
  }
  return resolved.startsWith('gpt-5') && !resolved.includes('mini') && !resolved.includes('nano');
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
  refined_match_score: z.number().optional(),
  analysis_suggestion: z.string().optional(),
  composition_log: z.object({
    theme_mapped: z.string().optional(),
    journey_layer: z.string().optional(),
    metaphors_used: z.array(z.string()).optional(),
  }).optional()
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

