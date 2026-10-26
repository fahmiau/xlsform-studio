/**
 * Provider registry (Task 6.2a).
 *
 * Providers are data, not code: one entry per API surface, grouped into three
 * wire protocols. Adding a provider is a one-entry diff plus its exact URL in
 * `src-tauri/capabilities/default.json` (a registry test enforces that).
 */

export type ProviderProtocol = 'openai' | 'openai-compatible' | 'anthropic' | 'google';

/** Auth header style understood by the Rust proxy binding. */
export type AuthStyle = 'bearer' | 'x-api-key' | 'x-goog-api-key' | 'none';

export interface RecommendedModel {
  id: string;
  label: string;
  /** Known to support tool calling (Build Mode). */
  tools: boolean;
}

export interface LocalProbe {
  /** Path probed on the loopback server while the local card is visible. */
  probePath: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  auth: AuthStyle;
  /** Paste auto-detection; tested in array order. */
  keyPattern?: RegExp;
  /** "Get a key" link (system browser, capability-scoped). */
  keyPageUrl?: string;
  /** Out-of-credits action link (system browser, capability-scoped). */
  billingUrl?: string;
  /** Model listing + test connection path. */
  modelsPath?: string;
  recommendedModels: readonly RecommendedModel[];
  local?: LocalProbe;
}

const GEMINI_MODELS: RecommendedModel[] = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tools: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tools: true },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', tools: true },
];

const ANTHROPIC_MODELS: RecommendedModel[] = [
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', tools: true },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tools: true },
  { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', tools: true },
];

const OPENROUTER_MODELS: RecommendedModel[] = [
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tools: true },
  { id: 'openai/gpt-5', label: 'GPT-5', tools: true },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tools: true },
];

const OPENAI_MODELS: RecommendedModel[] = [
  { id: 'gpt-5', label: 'GPT-5', tools: true },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', tools: true },
  { id: 'gpt-4.1', label: 'GPT-4.1', tools: true },
];

const GROQ_MODELS: RecommendedModel[] = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tools: true },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tools: false },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tools: true },
];

const XAI_MODELS: RecommendedModel[] = [
  { id: 'grok-4', label: 'Grok 4', tools: true },
  { id: 'grok-3', label: 'Grok 3', tools: true },
  { id: 'grok-3-mini', label: 'Grok 3 mini', tools: false },
];

const DEEPSEEK_MODELS: RecommendedModel[] = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', tools: true },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', tools: false },
];

const MISTRAL_MODELS: RecommendedModel[] = [
  { id: 'mistral-large-latest', label: 'Mistral Large', tools: true },
  { id: 'mistral-small-latest', label: 'Mistral Small', tools: true },
];

const OLLAMA_MODELS: RecommendedModel[] = [
  { id: 'qwen2.5:7b', label: 'Qwen 2.5 7B', tools: true },
  { id: 'llama3.1:8b', label: 'Llama 3.1 8B', tools: false },
  { id: 'mistral:7b', label: 'Mistral 7B', tools: false },
];

function deepFreeze<T extends object>(value: T): T {
  for (const entry of Object.values(value)) {
    if (entry && typeof entry === 'object') deepFreeze(entry as object);
  }
  return Object.freeze(value) as T;
}

/**
 * Order matters: specific key prefixes come before the generic `sk-` pattern.
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = deepFreeze([
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    auth: 'x-goog-api-key',
    keyPattern: /^AIza[0-9A-Za-z_-]{10,}/,
    keyPageUrl: 'https://aistudio.google.com/app/apikey',
    modelsPath: '/models',
    recommendedModels: GEMINI_MODELS,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    auth: 'x-api-key',
    keyPattern: /^sk-ant-[0-9A-Za-z_-]{8,}/,
    keyPageUrl: 'https://console.anthropic.com/settings/keys',
    billingUrl: 'https://console.anthropic.com/settings/billing',
    modelsPath: '/models',
    recommendedModels: ANTHROPIC_MODELS,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    protocol: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    auth: 'bearer',
    keyPattern: /^sk-or-[0-9A-Za-z_-]{8,}/,
    keyPageUrl: 'https://openrouter.ai/settings/keys',
    billingUrl: 'https://openrouter.ai/settings/credits',
    modelsPath: '/models',
    recommendedModels: OPENROUTER_MODELS,
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    auth: 'bearer',
    keyPattern: /^gsk_[0-9A-Za-z]{10,}/,
    keyPageUrl: 'https://console.groq.com/keys',
    billingUrl: 'https://console.groq.com/settings/billing',
    modelsPath: '/models',
    recommendedModels: GROQ_MODELS,
  },
  {
    id: 'xai',
    label: 'xAI',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    auth: 'bearer',
    keyPattern: /^xai-[0-9A-Za-z_-]{8,}/,
    keyPageUrl: 'https://console.x.ai',
    billingUrl: 'https://console.x.ai/billing',
    modelsPath: '/models',
    recommendedModels: XAI_MODELS,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'bearer',
    // Generic pattern, deliberately last.
    keyPattern: /^sk-(proj-|svcacct-)?[0-9A-Za-z_-]{16,}/,
    keyPageUrl: 'https://platform.openai.com/api-keys',
    billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
    modelsPath: '/models',
    recommendedModels: OPENAI_MODELS,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    auth: 'bearer',
    keyPageUrl: 'https://platform.deepseek.com/api_keys',
    billingUrl: 'https://platform.deepseek.com/top_up',
    modelsPath: '/models',
    recommendedModels: DEEPSEEK_MODELS,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    auth: 'bearer',
    keyPageUrl: 'https://console.mistral.ai/api-keys',
    billingUrl: 'https://console.mistral.ai/billing',
    modelsPath: '/models',
    recommendedModels: MISTRAL_MODELS,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    protocol: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    auth: 'none',
    modelsPath: '/models',
    recommendedModels: OLLAMA_MODELS,
    local: { probePath: '/models' },
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    protocol: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    auth: 'none',
    modelsPath: '/models',
    recommendedModels: [],
    local: { probePath: '/models' },
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    protocol: 'openai-compatible',
    baseUrl: '',
    auth: 'bearer',
    modelsPath: '/models',
    recommendedModels: [],
  },
]);

export const CUSTOM_PRESET_ID = 'custom';

const BY_ID = new Map(PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

/** Registry order, for tests and settings validation. */
export const PRESET_IDS: readonly string[] = PROVIDER_PRESETS.map((preset) => preset.id);

export function presetById(id: string): ProviderPreset | undefined {
  return BY_ID.get(id);
}

/** A preset the user can pick in the setup flow (everything but Custom). */
export const PASTE_PRESETS: readonly ProviderPreset[] = PROVIDER_PRESETS.filter(
  (preset) => preset.id !== CUSTOM_PRESET_ID && !preset.local,
);

export const LOCAL_PRESETS: readonly ProviderPreset[] = PROVIDER_PRESETS.filter(
  (preset) => preset.local !== undefined,
);

export function isLocalPreset(preset: ProviderPreset): boolean {
  return preset.local !== undefined;
}

/** Presets whose key pages/billing pages must be in the opener capability. */
export function presetUrls(preset: ProviderPreset): string[] {
  return [preset.keyPageUrl, preset.billingUrl].filter((url): url is string => Boolean(url));
}
