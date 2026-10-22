/** Application top bar (Task 2.1). */
import {
  FilePlus2,
  FolderOpen,
  Languages,
  PanelLeft,
  PanelRight,
  Save,
  SaveAll,
  Settings2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { basename, fileActions } from '@/features/file/fileActions';
import { LintBadge } from '@/features/lint-panel/LintBadge';
import { nextTheme } from '@/lib/theme';
import { usePrefsStore } from '@/state/prefsStore';
import { useIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { UndoRedoButtons } from './UndoRedoButtons';

export function TopBar() {
  const filePath = useWorkbookStore((state) => state.filePath);
  const isDirty = useIsDirty();
  const theme = usePrefsStore((state) => state.theme);
  const setTheme = usePrefsStore((state) => state.setTheme);
  const leftPanel = usePrefsStore((state) => state.leftPanel);
  const rightPanel = usePrefsStore((state) => state.rightPanel);
  const setPanelVisible = usePrefsStore((state) => state.setPanelVisible);

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
        <Button
          variant="ghost"
          size="sm"
          disabled
          title="Language view arrives in Stage 5"
          aria-label="Language view"
        >
          <Languages aria-hidden />
          <span className="text-xs">All</span>
        </Button>
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
          onClick={() => setTheme(nextTheme(theme))}
          title={`Theme: ${theme} (click to change)`}
          data-testid="theme-toggle"
        >
          <Settings2 aria-hidden />
        </Button>
      </div>
    </header>
  );
}
