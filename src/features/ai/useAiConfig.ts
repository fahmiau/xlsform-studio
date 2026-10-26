/**
 * Active AI provider config for the drawer (Tasks 6.2/6.3).
 *
 * Credentials live only in Rust; this hook just assembles the instance, its
 * preset, the effective base URL, and the proxied fetch.
 */
import { useMemo } from 'react';

import { usePrefsStore, type AiProviderPrefs } from '@/state/prefsStore';

import { tauriProxyTransport } from './aiIpc';
import { createModel, providerBaseUrl } from './createModel';
import { createProxyFetch } from './proxyFetch';
import { presetById, type ProviderPreset } from './providers';

export interface AiConfig {
  provider: AiProviderPrefs;
  preset: ProviderPreset;
  baseUrl: string;
  fetchImpl: typeof fetch;
}

export function configForProvider(provider: AiProviderPrefs): AiConfig | null {
  const preset = presetById(provider.presetId);
  if (!preset) return null;
  const baseUrl = providerBaseUrl(provider, preset);
  return {
    provider,
    preset,
    baseUrl,
    fetchImpl: createProxyFetch(provider.instanceId, baseUrl, tauriProxyTransport),
  };
}

export function useAiConfig(): AiConfig | null {
  const ai = usePrefsStore((state) => state.ai);
  return useMemo(() => {
    const provider = ai.providers.find((entry) => entry.instanceId === ai.activeInstanceId);
    if (!provider) return null;
    return configForProvider(provider);
  }, [ai]);
}

export function modelForConfig(config: AiConfig) {
  return createModel(config.provider, config.preset, config.fetchImpl);
}
