import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Toaster } from 'sonner';

import { UnsavedDialog } from '@/features/file/UnsavedDialog';
import { useCloseGuard } from '@/features/file/useCloseGuard';
import { CommandPalette } from '@/features/command-palette/CommandPalette';
import { ShortcutsSheet } from '@/features/command-palette/ShortcutsSheet';
import { foldingCommands } from '@/features/grid/useFolding';
import { groupCommands } from '@/features/grid/useGroupCommands';
import { rowCommands } from '@/features/grid/useRowCommands';
import { AppShell } from '@/features/shell/AppShell';
import { isTauriRuntime } from '@/features/shell/StatusBar';
import { appCommands } from '@/lib/appCommands';
import { registerCommands } from '@/lib/commands';
import { installShortcuts } from '@/lib/shortcuts';
import { useIsDirty, useWorkbookStore } from '@/state/workbookStore';
// Installs the data-change subscription that keeps derived indexes fresh (AD-3).
import '@/state/derivedStore';

export default function App() {
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
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}
