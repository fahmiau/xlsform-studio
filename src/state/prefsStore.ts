/**
 * User preferences (AD-3): theme, pane layout, and panel visibility. Persisted
 * with `tauri-plugin-store`; browser previews (and Playwright) fall back to
 * localStorage. Non-secret values only.
 */
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface PaneLayout {
  [panelId: string]: number;
}

export interface PrefsState {
  theme: ThemeMode;
  layout: PaneLayout;
  leftPanel: boolean;
  rightPanel: boolean;
  hydrated: boolean;
  setTheme: (theme: ThemeMode) => void;
  setLayout: (layout: PaneLayout) => void;
  setPanelVisible: (panel: 'left' | 'right', visible: boolean) => void;
  hydrate: () => Promise<void>;
}

const STORE_FILE = 'prefs.json';
const STORE_KEY = 'prefs';
const LOCAL_KEY = 'xlsform-studio.prefs';

const DEFAULTS = {
  theme: 'system' as ThemeMode,
  layout: { left: 18, center: 64, right: 18 } as PaneLayout,
  leftPanel: true,
  rightPanel: true,
};

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface PersistedPrefs {
  theme?: ThemeMode;
  layout?: PaneLayout;
  leftPanel?: boolean;
  rightPanel?: boolean;
}

async function readPersisted(): Promise<PersistedPrefs | null> {
  try {
    if (isTauriRuntime()) {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(STORE_FILE, { autoSave: true });
      return (await store.get<PersistedPrefs>(STORE_KEY)) ?? null;
    }
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as PersistedPrefs) : null;
  } catch {
    return null;
  }
}

async function writePersisted(prefs: PersistedPrefs): Promise<void> {
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

function persist(state: PrefsState): void {
  void writePersisted({
    theme: state.theme,
    layout: state.layout,
    leftPanel: state.leftPanel,
    rightPanel: state.rightPanel,
  });
}

export const usePrefsStore = create<PrefsState>()((set, get) => ({
  ...DEFAULTS,
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
  hydrate: async () => {
    if (get().hydrated) return;
    const persisted = await readPersisted();
    set({ ...DEFAULTS, ...persisted, hydrated: true });
  },
}));
