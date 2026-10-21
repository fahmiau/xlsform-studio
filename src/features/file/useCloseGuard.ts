import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { isTauriRuntime } from '@/features/shell/StatusBar';
import { selectIsDirty, useWorkbookStore } from '@/state/workbookStore';
import { requestUnsavedChoice } from './unsavedGuard';
import { fileActions } from './fileActions';

/**
 * Native window close guard (Task 1.10). Cancelling keeps the window open;
 * saving first aborts the close when the save fails or is cancelled.
 */
export function useCloseGuard(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    let closing = false;

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (closing) return;
        if (!selectIsDirty(useWorkbookStore.getState())) return;
        event.preventDefault();
        const choice = await requestUnsavedChoice();
        if (choice === 'cancel') return;
        if (choice === 'save' && !(await fileActions.saveFile())) return;
        closing = true;
        await getCurrentWindow().close();
      })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        // Browser preview or a closed window: no guard available.
      });

    return () => unlisten?.();
  }, []);
}
