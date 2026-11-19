import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Toaster } from 'sonner';

import { UnsavedDialog } from '@/features/file/UnsavedDialog';
import { useCloseGuard } from '@/features/file/useCloseGuard';
import { CommandPalette } from '@/features/command-palette/CommandPalette';
import { ShortcutsSheet } from '@/features/command-palette/ShortcutsSheet';
import { foldingCommands } from '@/features/grid/useFolding';
import { groupCommands } from '@/features/grid/useGroupCommands';
import { rowCommands } from '@/features/grid/useRowCommands';
import { LandingPage } from '@/features/landing/LandingPage';
import { AppShell } from '@/features/shell/AppShell';
import { isTauriRuntime } from '@/features/shell/StatusBar';
import { appCommands } from '@/lib/appCommands';
import { registerCommands } from '@/lib/commands';
import { installShortcuts } from '@/lib/shortcuts';
import { applyTheme, useIsDark } from '@/lib/theme';
import { usePrefsStore } from '@/state/prefsStore';
import { useIsDirty, useWorkbookStore } from '@/state/workbookStore';
// Installs the data-change subscription that keeps derived indexes fresh (AD-3).
import '@/state/derivedStore';

function getRoute(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

function isEditorRoute(route: string): boolean {
  const [pathname = '/', search = ''] = route.split('?');
  return pathname.startsWith('/app') || new URLSearchParams(search).has('app');
}

function EditorApp() {
  const filePath = useWorkbookStore((state) => state.filePath);
  const isDirty = useIsDirty();

  useCloseGuard();

  useEffect(() => {
    const title = `xlsform-studio — ${filePath ? filePath.split(/[\\/]/).at(-1) : 'Untitled form'}${isDirty ? '*' : ''}`;
    document.title = title;
    if (isTauriRuntime()) {
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => undefined);
    }
  }, [filePath, isDirty]);

  useEffect(() => {
    const unregister = registerCommands([
      ...appCommands(),
      ...rowCommands(),
      ...groupCommands(),
      ...foldingCommands(),
    ]);
    const uninstallShortcuts = installShortcuts();
    return () => {
      unregister();
      uninstallShortcuts();
    };
  }, []);

  return (
    <>
      <AppShell />
      <CommandPalette />
      <ShortcutsSheet />
      <UnsavedDialog />
    </>
  );
}

export default function App() {
  const tauri = isTauriRuntime();
  const [route, setRoute] = useState(getRoute);
  const theme = usePrefsStore((state) => state.theme);
  const isDark = useIsDark(theme);

  useEffect(() => {
    void usePrefsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, isDark]);

  useEffect(() => {
    if (tauri) return;
    const onPopState = () => setRoute(getRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [tauri]);

  const showEditor = tauri || isEditorRoute(route);

  useEffect(() => {
    if (!showEditor) {
      document.title = 'xlsform-studio — Offline-First XLSForm IDE & Validator';
    }
  }, [showEditor]);

  const launchApp = () => {
    window.history.pushState({}, '', '/app');
    setRoute('/app');
  };

  return (
    <>
      {showEditor ? <EditorApp /> : <LandingPage onLaunchApp={launchApp} />}
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}
