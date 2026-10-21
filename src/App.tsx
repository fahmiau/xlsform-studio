import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FilePlus2, FolderOpen, Save, SaveAll } from 'lucide-react';
import { Toaster } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBar, isTauriRuntime } from '@/features/shell/StatusBar';
import { fileActions, basename } from '@/features/file/fileActions';
import { UnsavedDialog } from '@/features/file/UnsavedDialog';
import { useCloseGuard } from '@/features/file/useCloseGuard';
import { WorkbookSummary } from '@/features/file/WorkbookSummary';
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
    const title = `xlsform-studio — ${basename(filePath)}${isDirty ? '*' : ''}`;
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
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold">xlsform-studio</span>
          <span className="text-muted-foreground truncate text-sm" data-testid="document-title">
            — {basename(filePath)}
            {isDirty ? '*' : ''}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void fileActions.newFile()}>
            <FilePlus2 aria-hidden /> New
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void fileActions.openFile()}>
            <FolderOpen aria-hidden /> Open
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void fileActions.saveFile()}>
            <Save aria-hidden /> Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void fileActions.saveFileAs()}>
            <SaveAll aria-hidden /> Save As
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <WorkbookSummary />
      </div>

      <StatusBar />
      <UnsavedDialog />
      <Toaster richColors closeButton position="bottom-right" />
    </main>
  );
}
