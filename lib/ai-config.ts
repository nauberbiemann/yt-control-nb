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
