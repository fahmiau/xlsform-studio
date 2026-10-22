import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Toaster } from 'sonner';

import { fileActions } from '@/features/file/fileActions';
import { UnsavedDialog } from '@/features/file/UnsavedDialog';
import { useCloseGuard } from '@/features/file/useCloseGuard';
import { AppShell } from '@/features/shell/AppShell';
import { isTauriRuntime } from '@/features/shell/StatusBar';
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
      {
        id: 'file.new',
        title: 'New XLSForm',
        shortcut: { code: 'KeyN', ctrlOrMeta: true },
        run: () => {
          void fileActions.newFile();
        },
      },
      {
        id: 'file.open',
        title: 'Open workbook…',
        shortcut: { code: 'KeyO', ctrlOrMeta: true },
        run: () => {
          void fileActions.openFile();
        },
      },
      {
        id: 'file.save',
        title: 'Save',
        shortcut: { code: 'KeyS', ctrlOrMeta: true },
        run: () => {
          void fileActions.saveFile();
        },
      },
      {
        id: 'file.saveAs',
        title: 'Save As…',
        shortcut: { code: 'KeyS', ctrlOrMeta: true, shift: true },
        run: () => {
          void fileActions.saveFileAs();
        },
      },
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
      <UnsavedDialog />
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}
