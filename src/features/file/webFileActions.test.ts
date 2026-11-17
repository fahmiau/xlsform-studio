import { createElement } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import { insertRows } from '@/core/ops/rows';
import { writeWorkbook } from '@/core/xlsx/write';
import { ShortcutsSheet } from '@/features/command-palette/ShortcutsSheet';
import { appCommands } from '@/lib/appCommands';
import { __clearCommandsForTests, registerCommands } from '@/lib/commands';
import { foldingCommands } from '@/features/grid/useFolding';
import { groupCommands } from '@/features/grid/useGroupCommands';
import { rowCommands } from '@/features/grid/useRowCommands';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { selectIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { RecoveryDialog } from './RecoveryDialog';
import { fileActions } from './fileActions';
import { parseSnapshot, serializeSnapshot } from './snapshot';
import {
  AUTOSAVE_INTERVAL_MS,
  WEB_RECOVERY_KEY,
  clearRecoverySnapshot,
  useAutosave,
  writeRecoverySnapshot,
} from './useAutosave';
import { useCloseGuard } from './useCloseGuard';

function dirtyWorkbook(title = 'Household Survey') {
  useWorkbookStore.getState().newWorkbook();
  useWorkbookStore.getState().apply('Edit survey', (data) => {
    const withRow = insertRows(data, 'survey', 0, [
      createRow({ type: 'text', name: 'q1', label: 'Question 1' }),
    ]);
    return {
      ...withRow,
      settings: {
        ...withRow.settings,
        rows: withRow.settings.rows.map((row) => ({
          ...row,
          cells: { ...row.cells, form_title: title },
        })),
      },
    };
  });
}

function AutosaveHarness() {
  useAutosave();
  return null;
}

function CloseGuardHarness() {
  useCloseGuard();
  return null;
}

describe('web runtime file & AI gates', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    localStorage.clear();
    useWorkbookStore.getState().newWorkbook();
    usePrefsStore.setState({ autosave: true });
    useUiStore.setState({ shortcutsOpen: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __clearCommandsForTests();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    localStorage.clear();
  });

  it('writes and clears WEB_RECOVERY_KEY in localStorage when outside Tauri', async () => {
    expect(await writeRecoverySnapshot()).toBe(false);
    expect(localStorage.getItem(WEB_RECOVERY_KEY)).toBeNull();

    dirtyWorkbook();
    expect(await writeRecoverySnapshot()).toBe(true);

    const raw = localStorage.getItem(WEB_RECOVERY_KEY);
    expect(raw).not.toBeNull();
    const parsed = parseSnapshot(raw!);
    expect(parsed.data.survey.rows[0]?.cells.name).toBe('q1');

    await clearRecoverySnapshot();
    expect(localStorage.getItem(WEB_RECOVERY_KEY)).toBeNull();
  });

  it('runs useAutosave on an interval on web', async () => {
    vi.useFakeTimers();
    dirtyWorkbook();
    render(createElement(AutosaveHarness));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS);
    });

    expect(localStorage.getItem(WEB_RECOVERY_KEY)).not.toBeNull();
  });

  it('web saveFile downloads slugified filename, marks saved, and clears WEB_RECOVERY_KEY', async () => {
    dirtyWorkbook('Water Quality Form');
    localStorage.setItem(WEB_RECOVERY_KEY, 'stale-snapshot');

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    let downloadedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });

    const saved = await fileActions.saveFile();
    expect(saved).toBe(true);
    expect(downloadedName).toBe('water_quality_form.xlsx');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(false);
    expect(useWorkbookStore.getState().filePath).toBe('water_quality_form.xlsx');
    expect(localStorage.getItem(WEB_RECOVERY_KEY)).toBeNull();
  });

  it('web saveFileAs preserves basename of existing filePath', async () => {
    dirtyWorkbook('Ignored Title');
    useWorkbookStore.setState({ filePath: 'C:/forms/existing_survey.xlsx' });
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    let downloadedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });

    expect(await fileActions.saveFileAs()).toBe(true);
    expect(downloadedName).toBe('existing_survey.xlsx');
    expect(useWorkbookStore.getState().filePath).toBe('existing_survey.xlsx');
  });

  it('web openFile loads a picked xlsx file and handles cancel', async () => {
    let clickHandler: (() => void) | null = null;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      clickHandler?.();
      if (!clickHandler) {
        this.dispatchEvent(new Event('cancel'));
      }
    });

    expect(await fileActions.openFile()).toBe(false);

    const wb = createEmptyWorkbook();
    wb.survey.rows.push(createRow({ type: 'integer', name: 'age', label: 'Age' }));
    const bytes = await writeWorkbook(wb);
    const copy = new Uint8Array(bytes);
    const file = new File([copy], 'picked.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (!file.arrayBuffer) {
      file.arrayBuffer = async () => copy.buffer;
    }

    clickHandler = () => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
      if (!input) return;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
    };

    expect(await fileActions.openFile()).toBe(true);
    expect(useWorkbookStore.getState().filePath).toBe('picked.xlsx');
    expect(useWorkbookStore.getState().data.survey.rows[0]?.cells.name).toBe('age');
  });

  it('gates ai.toggle (Ctrl+J) and ShortcutsSheet row by Tauri runtime', () => {
    const toggleAi = appCommands().find((cmd) => cmd.id === 'ai.toggle');
    expect(toggleAi).toBeDefined();
    expect(toggleAi?.when?.()).toBe(false);

    registerCommands([
      ...appCommands(),
      ...rowCommands(),
      ...groupCommands(),
      ...foldingCommands(),
    ]);
    useUiStore.setState({ shortcutsOpen: true });
    const { rerender } = render(createElement(ShortcutsSheet));
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(20);
    expect(screen.queryByText('Toggle AI assistant')).not.toBeInTheDocument();

    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    expect(toggleAi?.when?.()).toBe(true);
    rerender(createElement(ShortcutsSheet));
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(21);
    expect(screen.getByText('Toggle AI assistant')).toBeInTheDocument();
  });

  it('restores web recovery snapshot from localStorage without IPC', async () => {
    const wb = createEmptyWorkbook();
    wb.survey.rows.push(createRow({ type: 'text', name: 'recovered_q', label: 'Recovered' }));
    localStorage.setItem(
      WEB_RECOVERY_KEY,
      serializeSnapshot(wb, { filePath: 'recovered.xlsx', appVersion: 'web' }),
    );

    render(createElement(RecoveryDialog));
    const restoreBtn = await screen.findByTestId('recovery-restore');
    await userEvent.setup().click(restoreBtn);

    await waitFor(() => {
      expect(useWorkbookStore.getState().data.survey.rows[0]?.cells.name).toBe('recovered_q');
    });
    expect(useWorkbookStore.getState().filePath).toBe('recovered.xlsx');
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(true);
  });

  it('blocks browser unload only when workbook is dirty', () => {
    render(createElement(CloseGuardHarness));

    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    dirtyWorkbook();
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });
});
