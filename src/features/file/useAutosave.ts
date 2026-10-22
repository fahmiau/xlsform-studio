/** Autosave to the crash-recovery directory (Task 2.9). */
import { useEffect } from 'react';
import { toast } from 'sonner';

import { commands } from '@/ipc/bindings';
import { selectIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { serializeSnapshot } from './snapshot';

export const AUTOSAVE_INTERVAL_MS = 30_000;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let appVersion = 'unknown';
let warned = false;

async function resolveVersion(): Promise<string> {
  if (appVersion !== 'unknown') return appVersion;
  try {
    appVersion = (await commands.appInfo()).version;
  } catch {
    // Keep the fallback; the snapshot is still restorable.
  }
  return appVersion;
}

/** Write a snapshot if the document is dirty. Returns false when skipped. */
export async function writeRecoverySnapshot(): Promise<boolean> {
  const state = useWorkbookStore.getState();
  if (!isTauriRuntime() || !selectIsDirty(state)) return false;
  const json = serializeSnapshot(state.data, {
    filePath: state.filePath,
    appVersion: await resolveVersion(),
  });
  await commands.recoveryWrite(json);
  return true;
}

/** Clear the snapshot after save, New, Open, or a clean discard. */
export async function clearRecoverySnapshot(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await commands.recoveryClear();
  } catch {
    // Recovery is best effort; never block file operations.
  }
}

export function useAutosave(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const timer = window.setInterval(() => {
      void writeRecoverySnapshot().catch((error: unknown) => {
        if (warned) return;
        warned = true;
        toast.error('Could not write the recovery snapshot', {
          description: error instanceof Error ? error.message : String(error),
        });
      });
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
}
