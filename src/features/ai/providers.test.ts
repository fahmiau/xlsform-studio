import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { detectProvider, normalizePastedKey } from './detectProvider';
import {
  CUSTOM_PRESET_ID,
  LOCAL_PRESETS,
  PRESET_IDS,
  PROVIDER_PRESETS,
  isLocalPreset,
  presetUrls,
} from './providers';

function sampleKey(presetId: string): string {
  switch (presetId) {
    case 'gemini':
      return `AIza${'x'.repeat(35)}`;
    case 'anthropic':
      return `sk-ant-api03-${'x'.repeat(40)}`;
    case 'openrouter':
      return `sk-or-v1-${'x'.repeat(40)}`;
    case 'groq':
      return `gsk_${'x'.repeat(40)}`;
    case 'xai':
      return `xai-${'x'.repeat(40)}`;
    case 'openai':
      return `sk-proj-${'x'.repeat(40)}`;
    default:
      return '';
  }
}

describe('provider registry', () => {
  it('has unique ids', () => {
    const ids = PROVIDER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses https for every non-local preset', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (isLocalPreset(preset) || preset.id === CUSTOM_PRESET_ID) continue;
      expect(preset.baseUrl.startsWith('https://'), preset.id).toBe(true);
    }
  });

  it('uses loopback http for local presets', () => {
    for (const preset of LOCAL_PRESETS) {
      expect(preset.baseUrl).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+\/v1$/);
      expect(preset.auth).toBe('none');
      expect(preset.local?.probePath.startsWith('/')).toBe(true);
    }
  });

  it('keeps specific key patterns before the generic sk- pattern', () => {
    const order = PROVIDER_PRESETS.map((preset) => preset.id);
    const openai = order.indexOf('openai');
    for (const specific of ['anthropic', 'openrouter']) {
      expect(order.indexOf(specific)).toBeLessThan(openai);
    }
  });

  it('has a recommended model for every cloud preset', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (isLocalPreset(preset) || preset.id === CUSTOM_PRESET_ID) continue;
      expect(preset.recommendedModels.length, preset.id).toBeGreaterThan(0);
    }
  });

  it('marks at least one recommended model as tool-capable', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (preset.recommendedModels.length === 0) continue;
      expect(
        preset.recommendedModels.some((model) => model.tools),
        preset.id,
      ).toBe(true);
    }
  });

  it('exposes the preset id list used by tests and settings', () => {
    expect(PRESET_IDS).toEqual(PROVIDER_PRESETS.map((preset) => preset.id));
  });
});

describe('detectProvider', () => {
  it.each([
    ['gemini', 'AIza'],
    ['anthropic', 'sk-ant-'],
    ['openrouter', 'sk-or-'],
    ['groq', 'gsk_'],
    ['xai', 'xai-'],
    ['openai', 'sk-'],
  ])('detects %s keys', (presetId, _prefix) => {
    const detected = detectProvider(sampleKey(presetId));
    expect(detected?.preset.id).toBe(presetId);
  });

  it('prefers sk-ant- over the generic sk- pattern', () => {
    expect(detectProvider(`sk-ant-${'x'.repeat(30)}`)?.preset.id).toBe('anthropic');
  });

  it('prefers sk-or- over the generic sk- pattern', () => {
    expect(detectProvider(`sk-or-${'x'.repeat(30)}`)?.preset.id).toBe('openrouter');
  });

  it('strips whitespace and newlines from pasted keys', () => {
    const pasted = `  sk-ant-${'x'.repeat(30)}\n`;
    expect(normalizePastedKey(pasted)).toBe(`sk-ant-${'x'.repeat(30)}`);
    expect(detectProvider(pasted)).toEqual({
      preset: expect.objectContaining({ id: 'anthropic' }),
      key: `sk-ant-${'x'.repeat(30)}`,
    });
  });

  it('returns null for an unknown key', () => {
    expect(detectProvider('totally-unknown-key')).toBeNull();
    expect(detectProvider('')).toBeNull();
    expect(detectProvider('   \n ')).toBeNull();
  });

  it('falls back to a manual pick when the prefix is too short', () => {
    expect(detectProvider('sk-')).toBeNull();
  });
});

describe('opener capability coverage (Task 6.2b)', () => {
  const capability = JSON.parse(
    readFileSync(join(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
  ) as {
    permissions: Array<string | { identifier: string; allow?: Array<{ url?: string } | string> }>;
  };

  const opener = capability.permissions.find(
    (permission) =>
      typeof permission !== 'string' && permission.identifier === 'opener:allow-open-url',
  );
  const allowed =
    opener && typeof opener !== 'string'
      ? (opener.allow ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.url))
      : [];

  it('grants open-url with an explicit URL allow-list', () => {
    expect(opener).toBeTruthy();
    expect(allowed.length).toBeGreaterThan(0);
  });

  it('covers every preset key page and billing page', () => {
    for (const preset of PROVIDER_PRESETS) {
      for (const url of presetUrls(preset)) {
        expect(allowed, `${preset.id} ${url}`).toContain(url);
      }
    }
  });

  it('contains only https URLs, no wildcards and no path opening', () => {
    for (const url of allowed) {
      expect(url).toMatch(/^https:\/\/[^\s*]+$/);
      expect(url).not.toContain('*');
    }
    const identifiers = capability.permissions
      .filter((permission) => typeof permission !== 'string')
      .map((permission) => (permission as { identifier: string }).identifier);
    expect(identifiers).not.toContain('opener:allow-open-path');
    expect(identifiers).not.toContain('opener:allow-reveal-item-in-dir');
  });
});
