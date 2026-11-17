/** Autosave to the crash-recovery directory (Task 2.9). */
import { useEffect } from 'react';
import { toast } from 'sonner';

import { isTauriRuntime } from '@/features/shell/StatusBar';
import { commands } from '@/ipc/bindings';
import { usePrefsStore } from '@/state/prefsStore';
import { selectIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { serializeSnapshot } from './snapshot';

export const AUTOSAVE_INTERVAL_MS = 30_000;
export const WEB_RECOVERY_KEY = 'xlsform-studio:recovery:v1';

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
  if (!selectIsDirty(state)) return false;
  const tauri = isTauriRuntime();
  const json = serializeSnapshot(state.data, {
    filePath: state.filePath,
    appVersion: tauri ? await resolveVersion() : 'web',
  });
  if (tauri) {
    await commands.recoveryWrite(json);
  } else {
    localStorage.setItem(WEB_RECOVERY_KEY, json);
  }
  return true;
}

/** Clear the snapshot after save, New, Open, or a clean discard. */
export async function clearRecoverySnapshot(): Promise<void> {
  try {
    if (isTauriRuntime()) {
      await commands.recoveryClear();
    } else {
      localStorage.removeItem(WEB_RECOVERY_KEY);
    }
  } catch {
    // Recovery is best effort; never block file operations.
  }
}

export function useAutosave(): void {
  const autosave = usePrefsStore((state) => state.autosave);
  useEffect(() => {
    if (!autosave) return;
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
  }, [autosave]);
}
