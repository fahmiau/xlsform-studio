/**
 * Model factory (Task 6.3): four protocol branches, no per-provider code.
 *
 * The key here is a placeholder. Rust replaces it with the stored key while
 * proxying, so the real key never exists in the WebView.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import type { AiProviderPrefs } from '@/state/prefsStore';

import type { ProviderPreset } from './providers';

export const PROXY_PLACEHOLDER_KEY = 'xlsform-studio-proxy-placeholder';

/** Effective base URL: a user override wins over the registry default. */
export function providerBaseUrl(provider: AiProviderPrefs, preset: ProviderPreset): string {
  const override = provider.baseUrlOverride?.trim();
  return (override || preset.baseUrl).replace(/\/+$/, '');
}

export function createModel(
  provider: AiProviderPrefs,
  preset: ProviderPreset,
  fetchImpl: typeof fetch,
): LanguageModel {
  const baseURL = providerBaseUrl(provider, preset);
  const apiKey = PROXY_PLACEHOLDER_KEY;

  switch (preset.protocol) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL, fetch: fetchImpl }).chat(provider.modelId);
    case 'openai-compatible':
      return createOpenAICompatible({
        name: preset.id,
        apiKey,
        baseURL,
        fetch: fetchImpl,
      }).chatModel(provider.modelId);
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL, fetch: fetchImpl })(provider.modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL, fetch: fetchImpl })(provider.modelId);
  }
}
