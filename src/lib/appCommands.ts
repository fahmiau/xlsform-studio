/**
 * Global command definitions (PRD §6.2, Task 5.6). One registrar so the
 * keyboard handler, the command palette, and the shortcut help sheet all read
 * the same registry. Grid-context commands live next to their features and are
 * composed here for registration and tests.
 */
import { fileActions } from '@/features/file/fileActions';
import { nextProblem } from '@/features/lint-panel/navigate';
import { isTauriRuntime } from '@/features/shell/StatusBar';
import { redoWithReveal, undoWithReveal } from '@/features/shell/UndoRedoButtons';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';

import { useDerivedStore } from '@/state/derivedStore';

import { AUTOCOMPLETE_EVENT, type AppCommand } from './commands';
import { nextZoom } from './zoom';

export { AUTOCOMPLETE_EVENT };

export function appCommands(): AppCommand[] {
  return [
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
    {
      id: 'edit.undo',
      title: 'Undo',
      shortcut: { code: 'KeyZ', ctrlOrMeta: true },
      run: undoWithReveal,
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      shortcut: { code: 'KeyY', ctrlOrMeta: true },
      run: redoWithReveal,
    },
    {
      id: 'edit.redoAlt',
      title: 'Redo',
      shortcut: { code: 'KeyZ', ctrlOrMeta: true, shift: true },
      run: redoWithReveal,
    },
    {
      id: 'drawer.open',
      title: 'Open choices drawer',
      shortcut: { code: 'Enter', ctrlOrMeta: true, shift: true },
      run: () => {
        const ui = useUiStore.getState();
        const rowId = ui.activeCell?.sheet === 'survey' ? ui.activeCell.rowId : null;
        usePrefsStore.getState().setPanelVisible('right', true);
        ui.openChoicesDrawer(rowId);
      },
    },
    {
      id: 'formula.autocomplete',
      title: 'Trigger autocomplete',
      shortcut: { code: 'Space', ctrlOrMeta: true },
      allowInInput: true,
      run: () => window.dispatchEvent(new CustomEvent(AUTOCOMPLETE_EVENT)),
    },
    {
      id: 'ai.toggle',
      title: 'Toggle AI assistant',
      shortcut: { code: 'KeyJ', ctrlOrMeta: true },
      when: () => isTauriRuntime(),
      run: () => {
        const ui = useUiStore.getState();
        const prefs = usePrefsStore.getState();
        if (prefs.rightPanel && ui.rightTab === 'ai') {
          prefs.setPanelVisible('right', false);
          return;
        }
        prefs.setPanelVisible('right', true);
        ui.setRightTab('ai');
        ui.focusAiInput();
      },
    },
    {
      id: 'outline.search',
      title: 'Search outline',
      shortcut: { code: 'KeyF', ctrlOrMeta: true },
      allowInInput: true,
      run: () => {
        usePrefsStore.getState().setPanelVisible('left', true);
        useUiStore.getState().setLeftTab('outline');
        useUiStore.getState().focusOutlineSearch();
      },
    },
    {
      id: 'palette.open',
      title: 'Command palette',
      shortcut: { code: 'KeyK', ctrlOrMeta: true },
      allowInInput: true,
      run: () => useUiStore.getState().setPaletteOpen(true),
    },
    {
      id: 'view.zoomIn',
      title: 'Zoom in',
      shortcut: { code: 'Equal', ctrlOrMeta: true },
      allowInInput: true,
      run: () => {
        const prefs = usePrefsStore.getState();
        prefs.update({ zoom: nextZoom(prefs.zoom, 1) });
      },
    },
    {
      id: 'view.zoomOut',
      title: 'Zoom out',
      shortcut: { code: 'Minus', ctrlOrMeta: true },
      allowInInput: true,
      run: () => {
        const prefs = usePrefsStore.getState();
        prefs.update({ zoom: nextZoom(prefs.zoom, -1) });
      },
    },
    {
      id: 'view.zoomReset',
      title: 'Reset zoom to 100%',
      shortcut: { code: 'Digit0', ctrlOrMeta: true },
      allowInInput: true,
      run: () => usePrefsStore.getState().update({ zoom: 1 }),
    },
    {
      id: 'shortcuts.help',
      title: 'Keyboard shortcuts',
      shortcut: { code: 'Slash', shift: true },
      allowInInput: true,
      run: () => useUiStore.getState().setShortcutsOpen(true),
    },
    {
      id: 'lint.run',
      title: 'Run linter now',
      run: () => useDerivedStore.getState().runLintNow(),
    },
    {
      id: 'languages.add',
      title: 'Add language',
      run: () => useUiStore.getState().setAddLanguageOpen(true),
    },
    {
      id: 'lint.nextProblem',
      title: 'Go to next lint problem',
      shortcut: { code: 'F8' },
      allowInInput: true,
      run: () => nextProblem(1),
    },
    {
      id: 'lint.previousProblem',
      title: 'Go to previous lint problem',
      shortcut: { code: 'F8', shift: true },
      allowInInput: true,
      run: () => nextProblem(-1),
    },
  ];
}

/**
 * Every PRD §6.2 shortcut and the command id that owns it. The help sheet and
 * the registry-completeness test both read this list.
 */
export const PRD_SHORTCUTS: ReadonlyArray<{
  id: string;
  keys: string;
  label: string;
}> = [
  { id: 'file.new', keys: 'Ctrl+N', label: 'New XLSForm' },
  { id: 'file.open', keys: 'Ctrl+O', label: 'Open .xlsx' },
  { id: 'file.save', keys: 'Ctrl+S', label: 'Save .xlsx' },
  { id: 'edit.undo', keys: 'Ctrl+Z', label: 'Undo' },
  { id: 'edit.redo', keys: 'Ctrl+Y', label: 'Redo' },
  { id: 'drawer.open', keys: 'Ctrl+Shift+Enter', label: 'Open/focus Smart Choices Drawer' },
  { id: 'formula.autocomplete', keys: 'Ctrl+Space', label: 'Trigger autocomplete' },
  { id: 'grid.group.wrap', keys: 'Ctrl+G', label: 'Wrap rows in a group' },
  { id: 'grid.group.wrapRepeat', keys: 'Ctrl+Shift+G', label: 'Wrap rows in a repeat' },
  { id: 'grid.group.collapse', keys: 'Ctrl+[', label: 'Collapse active block' },
  { id: 'grid.group.expand', keys: 'Ctrl+]', label: 'Expand active block' },
  { id: 'grid.row.insertBelow', keys: 'Ctrl+Enter', label: 'Insert row below' },
  { id: 'grid.row.insertBelowAlt', keys: 'Ctrl+I', label: 'Insert row below' },
  { id: 'grid.row.insertAbove', keys: 'Ctrl+Shift+I', label: 'Insert row above' },
  { id: 'grid.row.delete', keys: 'Shift+Delete', label: 'Delete selected rows' },
  { id: 'grid.row.deleteCtrl', keys: 'Ctrl+Delete', label: 'Delete selected rows' },
  { id: 'ai.toggle', keys: 'Ctrl+J', label: 'Toggle AI assistant' },
  { id: 'outline.search', keys: 'Ctrl+F', label: 'Search outline' },
  { id: 'palette.open', keys: 'Ctrl+K', label: 'Open command palette' },
  { id: 'view.zoomIn', keys: 'Ctrl+=', label: 'Zoom in' },
  { id: 'view.zoomOut', keys: 'Ctrl+-', label: 'Zoom out' },
  { id: 'view.zoomReset', keys: 'Ctrl+0', label: 'Reset zoom to 100%' },
];
