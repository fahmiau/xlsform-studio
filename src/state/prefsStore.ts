/**
 * User preferences (AD-3): theme, pane layout, panel visibility, and the
 * Stage 5 editing defaults. Persisted with `tauri-plugin-store`; browser
 * previews (and Playwright) fall back to localStorage. Non-secret values only.
 *
 * Persisted values are validated with zod on load (Task 5.7): a corrupt or
 * partial store falls back to defaults and warns instead of crashing.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import { z } from 'zod';

import type { LanguageViewState, LanguageViewMode } from '@/core/languages/viewModes';
import type { SlugStyle } from '@/core/slug/slugify';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface PaneLayout {
  [panelId: string]: number;
}

export interface PrefsValues {
  theme: ThemeMode;
  layout: PaneLayout;
  leftPanel: boolean;
  rightPanel: boolean;
  /** Autosave on/off; the interval is fixed at 30 s (PRD). */
  autosave: boolean;
  /** `{name}` token pattern for generated choice-list names. */
  listNamePattern: string;
  /** Naming style for brand-new lists. */
  defaultSlugMode: SlugStyle;
  /** Choice-name length cap. */
  slugMaxLength: number;
  formulaFontSize: number;
  autocompleteOnDollar: boolean;
  /** Language view per file path (empty string for untitled workbooks). */
  languageViews: Record<string, LanguageViewState>;
  /** Configured AI providers (Task 6.2c). Never contains a key. */
  ai: AiPrefs;
}

/** One saved provider instance. `instanceId` is also the keyring provider id. */
export interface AiProviderPrefs {
  instanceId: string;
  presetId: string;
  label: string;
  modelId: string;
  temperature?: number;
  baseUrlOverride?: string;
}

export interface AiPrefs {
  providers: AiProviderPrefs[];
  activeInstanceId: string | null;
}

export interface PrefsState extends PrefsValues {
  hydrated: boolean;
  setTheme: (theme: ThemeMode) => void;
  setLayout: (layout: PaneLayout) => void;
  setPanelVisible: (panel: 'left' | 'right', visible: boolean) => void;
  update: (patch: Partial<PrefsValues>) => void;
  setLanguageViewFor: (fileKey: string, view: LanguageViewState) => void;
  upsertAiProvider: (provider: AiProviderPrefs, makeActive?: boolean) => void;
  updateAiProvider: (instanceId: string, patch: Partial<AiProviderPrefs>) => void;
  removeAiProvider: (instanceId: string) => void;
  setActiveAiProvider: (instanceId: string) => void;
  hydrate: () => Promise<void>;
}

const STORE_FILE = 'prefs.json';
const STORE_KEY = 'prefs';
const LOCAL_KEY = 'xlsform-studio.prefs';

/** Stable, keyring-safe provider instance id (`p_` + 16 hex chars). */
export function newProviderInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `p_${Math.random().toString(16).slice(2, 18)}`;
}

const DEFAULT_VALUES: PrefsValues = {
  theme: 'system',
  layout: { left: 18, center: 64, right: 18 },
  leftPanel: true,
  rightPanel: true,
  autosave: true,
  listNamePattern: '{name}',
  defaultSlugMode: 'snake',
  slugMaxLength: 32,
  formulaFontSize: 12,
  autocompleteOnDollar: true,
  languageViews: {},
  ai: { providers: [], activeInstanceId: null },
};

const THEMES = ['light', 'dark', 'system'] as const;
const SLUG_STYLES = ['snake', 'camel', 'passthrough'] as const;
const VIEW_MODES = ['all', 'single', 'split'] as const;

const languageViewSchema = z.object({
  mode: z.enum(VIEW_MODES).catch('all'),
  language: z.string().nullable().catch(null),
  source: z.string().nullable().catch(null),
  target: z.string().nullable().catch(null),
});

/**
 * No `apiKey` field on purpose: zod strips unknown keys, so even a hand-edited
 * preferences file cannot smuggle a key into persisted state.
 */
const aiProviderSchema = z.object({
  instanceId: z.string().min(1).max(128),
  presetId: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  modelId: z.string().min(1).max(160),
  temperature: z.number().min(0).max(2).optional(),
  baseUrlOverride: z.string().max(2048).optional(),
});

const emptyAiPrefs: AiPrefs = { providers: [], activeInstanceId: null };

const aiSchema = z
  .object({
    providers: z.array(aiProviderSchema).catch([]),
    activeInstanceId: z.string().nullable().catch(null),
  })
  .catch(emptyAiPrefs);

const prefsSchema = z.object({
  theme: z.enum(THEMES).catch(DEFAULT_VALUES.theme),
  layout: z.record(z.string(), z.number()).catch(DEFAULT_VALUES.layout),
  leftPanel: z.boolean().catch(DEFAULT_VALUES.leftPanel),
  rightPanel: z.boolean().catch(DEFAULT_VALUES.rightPanel),
  autosave: z.boolean().catch(DEFAULT_VALUES.autosave),
  listNamePattern: z.string().min(1).max(64).catch(DEFAULT_VALUES.listNamePattern),
  defaultSlugMode: z.enum(SLUG_STYLES).catch(DEFAULT_VALUES.defaultSlugMode),
  slugMaxLength: z.number().int().min(1).max(64).catch(DEFAULT_VALUES.slugMaxLength),
  formulaFontSize: z.number().int().min(9).max(24).catch(DEFAULT_VALUES.formulaFontSize),
  autocompleteOnDollar: z.boolean().catch(DEFAULT_VALUES.autocompleteOnDollar),
  languageViews: z.record(z.string(), languageViewSchema).catch({}),
  ai: aiSchema,
});

/** Validate one persisted blob; never throws. */
export function parsePrefs(raw: unknown): PrefsValues {
  const result = prefsSchema.safeParse(raw);
  return result.success ? result.data : { ...DEFAULT_VALUES };
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface ReadResult {
  prefs: PrefsValues | null;
  corrupt: boolean;
}

async function readPersisted(): Promise<ReadResult> {
  try {
    let raw: unknown = null;
    if (isTauriRuntime()) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: true });
      raw = (await store.get(STORE_KEY)) ?? null;
    } else {
      const text = localStorage.getItem(LOCAL_KEY);
      raw = text ? JSON.parse(text) : null;
    }
    if (raw === null) return { prefs: null, corrupt: false };
    return { prefs: parsePrefs(raw), corrupt: false };
  } catch {
    // Unparseable JSON (or a missing store) is treated as corrupt storage.
    return { prefs: null, corrupt: true };
  }
}

async function writePersisted(prefs: PrefsValues): Promise<void> {
  try {
    if (isTauriRuntime()) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: true });
      await store.set(STORE_KEY, prefs);
      return;
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are best effort; a read-only store must not break editing.
  }
}

function valuesOf(state: PrefsState): PrefsValues {
  const {
    theme,
    layout,
    leftPanel,
    rightPanel,
    autosave,
    listNamePattern,
    defaultSlugMode,
    slugMaxLength,
    formulaFontSize,
    autocompleteOnDollar,
    languageViews,
    ai,
  } = state;
  return {
    theme,
    layout,
    leftPanel,
    rightPanel,
    autosave,
    listNamePattern,
    defaultSlugMode,
    slugMaxLength,
    formulaFontSize,
    autocompleteOnDollar,
    languageViews,
    ai,
  };
}

function persist(state: PrefsState): void {
  void writePersisted(valuesOf(state));
}

export const usePrefsStore = create<PrefsState>()((set, get) => ({
  ...DEFAULT_VALUES,
  hydrated: false,

  setTheme: (theme) => {
    set({ theme });
    persist(get());
  },
  setLayout: (layout) => {
    set({ layout });
    persist(get());
  },
  setPanelVisible: (panel, visible) => {
    set(panel === 'left' ? { leftPanel: visible } : { rightPanel: visible });
    persist(get());
  },
  update: (patch) => {
    set(patch);
    persist(get());
  },
  setLanguageViewFor: (fileKey, view) => {
    set((state) => ({ languageViews: { ...state.languageViews, [fileKey]: view } }));
    persist(get());
  },
  upsertAiProvider: (provider, makeActive = true) => {
    set((state) => {
      const providers = [
        ...state.ai.providers.filter((entry) => entry.instanceId !== provider.instanceId),
        provider,
      ];
      return {
        ai: {
          providers,
          activeInstanceId: makeActive ? provider.instanceId : state.ai.activeInstanceId,
        },
      };
    });
    persist(get());
  },
  updateAiProvider: (instanceId, patch) => {
    set((state) => ({
      ai: {
        ...state.ai,
        providers: state.ai.providers.map((entry) =>
          entry.instanceId === instanceId ? { ...entry, ...patch, instanceId } : entry,
        ),
      },
    }));
    persist(get());
  },
  removeAiProvider: (instanceId) => {
    set((state) => {
      const providers = state.ai.providers.filter((entry) => entry.instanceId !== instanceId);
      const activeInstanceId =
        state.ai.activeInstanceId === instanceId
          ? (providers[0]?.instanceId ?? null)
          : state.ai.activeInstanceId;
      return { ai: { providers, activeInstanceId } };
    });
    persist(get());
  },
  setActiveAiProvider: (instanceId) => {
    if (!get().ai.providers.some((entry) => entry.instanceId === instanceId)) return;
    set((state) => ({ ai: { ...state.ai, activeInstanceId: instanceId } }));
    persist(get());
  },
  hydrate: async () => {
    if (get().hydrated) return;
    const { prefs, corrupt } = await readPersisted();
    if (prefs) set({ ...prefs, hydrated: true });
    else set({ hydrated: true });
    if (corrupt) {
      toast.warning('Preferences were reset', {
        description: 'The saved preferences could not be read, so defaults were used.',
      });
    }
  },
}));

export type { LanguageViewMode };
