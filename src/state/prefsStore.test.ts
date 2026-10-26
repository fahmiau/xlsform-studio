import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parsePrefs, usePrefsStore } from './prefsStore';

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const DEFAULTS = {
  theme: 'system' as const,
  layout: { left: 18, center: 64, right: 18 },
  leftPanel: true,
  rightPanel: true,
  autosave: true,
  listNamePattern: '{name}',
  defaultSlugMode: 'snake' as const,
  slugMaxLength: 32,
  formulaFontSize: 12,
  autocompleteOnDollar: true,
  languageViews: {},
  ai: { providers: [], activeInstanceId: null },
};

describe('prefsStore (Task 2.1, Task 5.7)', () => {
  beforeEach(() => {
    localStorage.clear();
    usePrefsStore.setState({ ...DEFAULTS, hydrated: false });
  });

  it('hydrates theme, layout, and panel visibility from localStorage', async () => {
    localStorage.setItem(
      'xlsform-studio.prefs',
      JSON.stringify({
        theme: 'dark',
        layout: { left: 25, center: 55, right: 20 },
        rightPanel: false,
      }),
    );
    await usePrefsStore.getState().hydrate();
    const state = usePrefsStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.layout).toEqual({ left: 25, center: 55, right: 20 });
    expect(state.rightPanel).toBe(false);
    expect(state.leftPanel).toBe(true);
    expect(state.hydrated).toBe(true);
  });

  it('keeps defaults when nothing is stored and only hydrates once', async () => {
    await usePrefsStore.getState().hydrate();
    expect(usePrefsStore.getState().theme).toBe('system');
    usePrefsStore.getState().setTheme('light');
    await usePrefsStore.getState().hydrate();
    expect(usePrefsStore.getState().theme).toBe('light');
  });

  it('hydrates the Stage 5 editing defaults', async () => {
    localStorage.setItem(
      'xlsform-studio.prefs',
      JSON.stringify({
        autosave: false,
        listNamePattern: '{name}_list',
        defaultSlugMode: 'camel',
        slugMaxLength: 24,
        formulaFontSize: 14,
        autocompleteOnDollar: false,
      }),
    );
    await usePrefsStore.getState().hydrate();
    const state = usePrefsStore.getState();
    expect(state.autosave).toBe(false);
    expect(state.listNamePattern).toBe('{name}_list');
    expect(state.defaultSlugMode).toBe('camel');
    expect(state.slugMaxLength).toBe(24);
    expect(state.formulaFontSize).toBe(14);
    expect(state.autocompleteOnDollar).toBe(false);
  });

  it('stores the language view per file path', async () => {
    const view = { mode: 'single' as const, language: 'en', source: null, target: null };
    usePrefsStore.getState().setLanguageViewFor('C:/forms/a.xlsx', view);
    await Promise.resolve();
    expect(usePrefsStore.getState().languageViews['C:/forms/a.xlsx']).toEqual(view);
  });
});

describe('parsePrefs (Task 5.7)', () => {
  it('returns defaults for a missing blob', () => {
    expect(parsePrefs(null)).toMatchObject(DEFAULTS);
  });

  it('returns defaults for a non-object blob', () => {
    expect(parsePrefs('nope')).toMatchObject(DEFAULTS);
  });

  it('keeps valid values and fills missing ones', () => {
    const prefs = parsePrefs({ theme: 'dark', autosave: false });
    expect(prefs.theme).toBe('dark');
    expect(prefs.autosave).toBe(false);
    expect(prefs.listNamePattern).toBe('{name}');
    expect(prefs.slugMaxLength).toBe(32);
  });

  it('falls back per field instead of discarding the whole blob', () => {
    const prefs = parsePrefs({
      theme: 'neon',
      listNamePattern: '',
      slugMaxLength: 0,
      formulaFontSize: 99,
      defaultSlugMode: 'kebab',
      autosave: 'yes',
    });
    expect(prefs.theme).toBe('system');
    expect(prefs.listNamePattern).toBe('{name}');
    expect(prefs.slugMaxLength).toBe(32);
    expect(prefs.formulaFontSize).toBe(12);
    expect(prefs.defaultSlugMode).toBe('snake');
    expect(prefs.autosave).toBe(true);
  });

  it('validates stored language views', () => {
    const prefs = parsePrefs({
      languageViews: {
        'a.xlsx': { mode: 'split', language: null, source: 'en', target: 'id' },
        'b.xlsx': { mode: 'sideways' },
      },
    });
    expect(prefs.languageViews['a.xlsx']).toEqual({
      mode: 'split',
      language: null,
      source: 'en',
      target: 'id',
    });
    expect(prefs.languageViews['b.xlsx']?.mode).toBe('all');
  });

  it('accepts both supported slug styles and the passthrough mode', () => {
    expect(parsePrefs({ defaultSlugMode: 'camel' }).defaultSlugMode).toBe('camel');
    expect(parsePrefs({ defaultSlugMode: 'passthrough' }).defaultSlugMode).toBe('passthrough');
  });
});

describe('corrupt pref storage (Task 5.7)', () => {
  it('does not crash on unparseable JSON and warns', async () => {
    localStorage.setItem('xlsform-studio.prefs', '{not json');
    await usePrefsStore.getState().hydrate();
    const state = usePrefsStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.theme).toBe('system');
  });
});

describe('AI preferences (Task 6.2c)', () => {
  it('defaults to no providers', () => {
    const prefs = parsePrefs({});
    expect(prefs.ai).toEqual({ providers: [], activeInstanceId: null });
  });

  it('strips any apiKey smuggled into persisted state', () => {
    const prefs = parsePrefs({
      ai: {
        providers: [
          {
            instanceId: 'p_1',
            presetId: 'anthropic',
            label: 'Anthropic',
            modelId: 'claude-sonnet-4-5',
            apiKey: 'sk-ant-secret',
          },
        ],
        activeInstanceId: 'p_1',
      },
    });
    expect(prefs.ai.providers).toHaveLength(1);
    expect(JSON.stringify(prefs.ai)).not.toContain('sk-ant-secret');
    expect(prefs.ai.providers[0]).not.toHaveProperty('apiKey');
  });

  it('adds, activates, updates, and removes providers', () => {
    const store = usePrefsStore.getState();
    store.upsertAiProvider({
      instanceId: 'p_one',
      presetId: 'openai',
      label: 'OpenAI',
      modelId: 'gpt-5',
    });
    store.upsertAiProvider({
      instanceId: 'p_two',
      presetId: 'ollama',
      label: 'Ollama',
      modelId: 'qwen2.5:7b',
    });
    expect(usePrefsStore.getState().ai.activeInstanceId).toBe('p_two');

    usePrefsStore.getState().setActiveAiProvider('p_one');
    expect(usePrefsStore.getState().ai.activeInstanceId).toBe('p_one');

    usePrefsStore.getState().updateAiProvider('p_one', { modelId: 'gpt-5-mini' });
    expect(usePrefsStore.getState().ai.providers[0]?.modelId).toBe('gpt-5-mini');

    usePrefsStore.getState().removeAiProvider('p_one');
    expect(usePrefsStore.getState().ai.providers.map((p) => p.instanceId)).toEqual(['p_two']);
    expect(usePrefsStore.getState().ai.activeInstanceId).toBe('p_two');
  });

  it('persists providers without keys', () => {
    usePrefsStore.getState().upsertAiProvider({
      instanceId: 'p_persist',
      presetId: 'groq',
      label: 'Groq',
      modelId: 'llama-3.3-70b-versatile',
    });
    const stored = localStorage.getItem('xlsform-studio.prefs') ?? '';
    expect(stored).toContain('p_persist');
    expect(stored).not.toContain('apiKey');
    expect(stored).not.toContain('sk-');
  });
});
