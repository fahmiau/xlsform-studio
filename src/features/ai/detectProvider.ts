/**
 * Paste auto-detection (Task 6.2b).
 *
 * Keys are often pasted from chat or a password manager with stray whitespace
 * and line breaks; strip all whitespace before matching. Patterns are tested in
 * `PROVIDER_PRESETS` order, so specific prefixes (`sk-ant-`, `sk-or-`) win over
 * the generic `sk-`.
 */
import { PROVIDER_PRESETS, type ProviderPreset } from './providers';

export interface DetectedProvider {
  preset: ProviderPreset;
  key: string;
}

export function normalizePastedKey(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function detectProvider(raw: string): DetectedProvider | null {
  const key = normalizePastedKey(raw);
  if (!key) return null;
  for (const preset of PROVIDER_PRESETS) {
    if (preset.keyPattern?.test(key)) return { preset, key };
  }
  return null;
}
