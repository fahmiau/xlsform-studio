/**
 * Live model listing and connection testing (Task 6.2c/d).
 *
 * Every request goes through the provider's bound proxy fetch, so listing a
 * model costs no tokens and reveals the key to nothing.
 */
import type { ProviderPreset, RecommendedModel } from './providers';

export interface ModelOption {
  id: string;
  label: string;
  /** Known tool support from the curated list. */
  tools?: boolean;
  /** Pinned to the top of the picker. */
  recommended?: boolean;
}

export class AiHttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`provider returned HTTP ${status}`);
    this.name = 'AiHttpError';
    this.status = status;
    this.body = body;
  }
}

const cache = new Map<string, ModelOption[]>();

/** Anthropic requires this header on every request, including model listing. */
const ANTHROPIC_VERSION = '2023-06-01';

export function clearModelCache(): void {
  cache.clear();
}

/**
 * API roots to try for a user-entered custom base URL. Gateways are often
 * pasted without their `/v1` prefix, which otherwise only fails on the first
 * request.
 */
export function modelBaseUrlCandidates(baseUrl: string): string[] {
  const base = baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(chat\/completions|messages|models)$/, '');
  if (!base) return [];
  try {
    const path = new URL(base).pathname;
    if (path !== '' && path !== '/') return [base];
  } catch {
    return [base];
  }
  return [base, `${base}/v1`];
}

function cacheKey(presetId: string, baseUrl: string): string {
  return `${presetId}|${baseUrl}`;
}

export function modelsUrl(baseUrl: string, preset: ProviderPreset): string {
  return `${baseUrl.replace(/\/+$/, '')}${preset.modelsPath ?? '/models'}`;
}

interface OpenAiModelEntry {
  id?: string;
}

interface AnthropicModelEntry {
  id?: string;
  display_name?: string;
}

interface GoogleModelEntry {
  name?: string;
  displayName?: string;
}

function parseModels(preset: ProviderPreset, body: unknown): ModelOption[] {
  const recommended = new Map<string, RecommendedModel>(
    preset.recommendedModels.map((model) => [model.id, model]),
  );
  let ids: Array<{ id: string; label?: string }>;

  if (preset.protocol === 'google') {
    const models = (body as { models?: GoogleModelEntry[] }).models ?? [];
    ids = models
      .filter((model) => typeof model.name === 'string')
      .map((model) => ({
        id: (model.name as string).replace(/^models\//, ''),
        ...(model.displayName ? { label: model.displayName } : {}),
      }));
  } else if (preset.protocol === 'anthropic') {
    const models = (body as { data?: AnthropicModelEntry[] }).data ?? [];
    ids = models
      .filter((model) => typeof model.id === 'string')
      .map((model) => ({
        id: model.id as string,
        ...(model.display_name ? { label: model.display_name } : {}),
      }));
  } else {
    const models = (body as { data?: OpenAiModelEntry[] }).data ?? [];
    ids = models
      .filter((model) => typeof model.id === 'string')
      .map((model) => ({ id: model.id as string }));
  }

  const seen = new Set<string>();
  const options: ModelOption[] = [];
  for (const entry of ids) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const curated = recommended.get(entry.id);
    options.push({
      id: entry.id,
      label: curated?.label ?? entry.label ?? entry.id,
      ...(curated ? { tools: curated.tools, recommended: true } : {}),
    });
  }

  // Curated models stay at the top even when the live list omits them.
  for (const model of preset.recommendedModels) {
    if (!seen.has(model.id)) {
      options.push({ id: model.id, label: model.label, tools: model.tools, recommended: true });
    }
  }
  return options;
}

export async function listModels(
  fetchImpl: typeof fetch,
  preset: ProviderPreset,
  baseUrl: string,
  options: { refresh?: boolean } = {},
): Promise<ModelOption[]> {
  const key = cacheKey(preset.id, baseUrl);
  if (!options.refresh) {
    const cached = cache.get(key);
    if (cached) return cached;
  }
  const response = await fetchImpl(modelsUrl(baseUrl, preset), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(preset.protocol === 'anthropic' ? { 'anthropic-version': ANTHROPIC_VERSION } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new AiHttpError(response.status, text);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AiHttpError(response.status, text);
  }
  const models = parseModels(preset, body);
  cache.set(key, models);
  return models;
}

export interface TestConnectionResult {
  ok: boolean;
  modelCount?: number;
}

/**
 * Test connection prefers the free model listing. Only a provider without a
 * listing path falls back to a 1-token completion.
 */
export async function testConnection(
  fetchImpl: typeof fetch,
  preset: ProviderPreset,
  baseUrl: string,
  modelId?: string,
): Promise<TestConnectionResult> {
  if (preset.modelsPath) {
    const models = await listModels(fetchImpl, preset, baseUrl, { refresh: true });
    return { ok: true, modelCount: models.length };
  }
  if (!modelId) return { ok: false };
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new AiHttpError(response.status, text);
  return { ok: true };
}

export interface LocalProbeResult {
  preset: ProviderPreset;
  running: boolean;
  models: ModelOption[];
  error?: string;
}

/** Probe a loopback server. Only called while the setup card is visible. */
export async function probeLocal(
  fetchImpl: typeof fetch,
  preset: ProviderPreset,
  baseUrl = preset.baseUrl,
): Promise<LocalProbeResult> {
  try {
    const models = await listModels(fetchImpl, preset, baseUrl, { refresh: true });
    return { preset, running: true, models };
  } catch (error) {
    return {
      preset,
      running: false,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Pick the default model: first curated model with tools, else first. */
export function defaultModel(preset: ProviderPreset, models: ModelOption[] = []): string {
  const liveTools = models.find((model) => model.tools);
  if (liveTools) return liveTools.id;
  const curatedTools = preset.recommendedModels.find((model) => model.tools);
  if (curatedTools) return curatedTools.id;
  return models[0]?.id ?? preset.recommendedModels[0]?.id ?? '';
}
