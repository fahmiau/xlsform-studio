/** Application top bar (Task 2.1). */
import {
  FilePlus2,
  FolderOpen,
  PanelLeft,
  PanelRight,
  Save,
  SaveAll,
  Settings2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { basename, fileActions } from '@/features/file/fileActions';
import { LanguageSelector } from '@/features/languages/LanguageSelector';
import { LintBadge } from '@/features/lint-panel/LintBadge';
import { PreferencesDialog } from '@/features/preferences/PreferencesDialog';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { UndoRedoButtons } from './UndoRedoButtons';

export function TopBar() {
  const filePath = useWorkbookStore((state) => state.filePath);
  const isDirty = useIsDirty();
  const leftPanel = usePrefsStore((state) => state.leftPanel);
  const rightPanel = usePrefsStore((state) => state.rightPanel);
  const setPanelVisible = usePrefsStore((state) => state.setPanelVisible);
  const preferencesOpen = useUiStore((state) => state.preferencesOpen);
  const setPreferencesOpen = useUiStore((state) => state.setPreferencesOpen);

  return (
    <header className="flex items-center gap-2 border-b px-3 py-1.5" data-testid="top-bar">
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-semibold">xlsform-studio</span>
        <span className="text-muted-foreground truncate text-xs" data-testid="document-title">
          — {basename(filePath)}
          {isDirty ? '*' : ''}
        </span>
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="New"
          title="New XLSForm (Ctrl+N)"
          onClick={() => void fileActions.newFile()}
        >
          <FilePlus2 aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Open"
          title="Open workbook (Ctrl+O)"
          onClick={() => void fileActions.openFile()}
        >
          <FolderOpen aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Save"
          title="Save (Ctrl+S)"
          onClick={() => void fileActions.saveFile()}
        >
          <Save aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Save As"
          title="Save As (Ctrl+Shift+S)"
          onClick={() => void fileActions.saveFileAs()}
        >
          <SaveAll aria-hidden />
        </Button>
        <span className="bg-border mx-1 h-4 w-px" />
        <UndoRedoButtons />
        <LanguageSelector />
        <LintBadge />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanelVisible('left', !leftPanel)}
          aria-pressed={leftPanel}
          title={leftPanel ? 'Hide outline panel' : 'Show outline panel'}
          data-testid="toggle-left-panel"
        >
          <PanelLeft aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPanelVisible('right', !rightPanel)}
          aria-pressed={rightPanel}
          title={rightPanel ? 'Hide right panel' : 'Show right panel'}
          data-testid="toggle-right-panel"
        >
          <PanelRight aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPreferencesOpen(true)}
          title="Preferences"
          aria-label="Preferences"
          data-testid="open-preferences"
        >
          <Settings2 aria-hidden />
        </Button>
      </div>
      <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </header>
  );
}
