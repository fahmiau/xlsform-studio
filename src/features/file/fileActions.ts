import { open, save } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

import { commands } from '@/ipc/bindings';
import { base64ToBytes, bytesToBase64 } from '@/lib/base64';
import { appErrorMessage } from '@/lib/errors';
import { readWorkbook } from '@/core/xlsx/read';
import { writeWorkbook } from '@/core/xlsx/write';
import { selectIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { requestUnsavedChoice } from './unsavedGuard';
import { clearRecoverySnapshot } from './useAutosave';

const XLSX_FILTER = [{ name: 'XLSForm workbook', extensions: ['xlsx'] }];

function ensureXlsxExtension(path: string): string {
  return path.toLowerCase().endsWith('.xlsx') ? path : `${path}.xlsx`;
}

export function basename(path: string | null): string {
  if (!path) return 'Untitled form';
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

async function writeTo(path: string): Promise<boolean> {
  const state = useWorkbookStore.getState();
  try {
    const bytes = await writeWorkbook(state.data, {
      sourceHandle: state.sourceHandle ?? undefined,
    });
    await commands.saveWorkbook(path, bytesToBase64(bytes));
    useWorkbookStore.getState().markSaved(path);
    await clearRecoverySnapshot();
    toast.success(`Saved ${basename(path)}`);
    return true;
  } catch (error) {
    toast.error('Could not save the workbook', {
      description: appErrorMessage(error),
    });
    return false;
  }
}

async function saveFileAs(): Promise<boolean> {
  const state = useWorkbookStore.getState();
  try {
    const selected = await save({
      title: 'Save XLSForm workbook',
      defaultPath: state.filePath ?? 'untitled.xlsx',
      filters: XLSX_FILTER,
    });
    if (!selected) return false;
    return await writeTo(ensureXlsxExtension(selected));
  } catch (error) {
    toast.error('Could not open the Save As dialog', { description: appErrorMessage(error) });
    return false;
  }
}

async function saveFile(): Promise<boolean> {
  const path = useWorkbookStore.getState().filePath;
  if (!path) return saveFileAs();
  return writeTo(path);
}

/** Resolve the unsaved-changes guard; false means the action was cancelled. */
async function confirmDiscard(): Promise<boolean> {
  if (!selectIsDirty(useWorkbookStore.getState())) return true;
  const choice = await requestUnsavedChoice();
  if (choice === 'cancel') return false;
  if (choice === 'save') return saveFile();
  await clearRecoverySnapshot();
  return true;
}

async function openFile(): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    const selected = await open({
      title: 'Open XLSForm workbook',
      multiple: false,
      directory: false,
      filters: XLSX_FILTER,
    });
    if (!selected || Array.isArray(selected)) return;
    const encoded = await commands.readWorkbook(selected);
    const result = await readWorkbook(base64ToBytes(encoded));
    useWorkbookStore.getState().load(result.data, {
      filePath: selected,
      sourceHandle: result.sourceHandle,
      warnings: result.warnings,
    });
    await clearRecoverySnapshot();
    if (result.warnings.length > 0) {
      toast.warning(`${result.warnings.length} reader warning(s)`, {
        description: result.warnings[0],
      });
    } else {
      toast.success(`Opened ${basename(selected)}`);
    }
  } catch (error) {
    toast.error('Could not open the workbook', { description: appErrorMessage(error) });
  }
}

async function newFile(): Promise<void> {
  if (!(await confirmDiscard())) return;
  useWorkbookStore.getState().newWorkbook();
  await clearRecoverySnapshot();
}

export const fileActions = {
  newFile,
  openFile,
  saveFile,
  saveFileAs,
};
