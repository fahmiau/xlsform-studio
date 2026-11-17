/** Startup prompt to restore an unsaved session (Task 2.9). */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { readWorkbook } from '@/core/xlsx/read';
import { isTauriRuntime } from '@/features/shell/StatusBar';
import { commands } from '@/ipc/bindings';
import { base64ToBytes } from '@/lib/base64';
import { useWorkbookStore } from '@/state/workbookStore';

import { basename } from './fileActions';
import { describeSnapshot, parseSnapshot, type RecoverySnapshot } from './snapshot';
import { WEB_RECOVERY_KEY, clearRecoverySnapshot } from './useAutosave';

export function RecoveryDialog() {
  const [snapshot, setSnapshot] = useState<RecoverySnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const readRaw = async (): Promise<string | null> =>
      isTauriRuntime()
        ? ((await commands.recoveryRead())?.json ?? null)
        : localStorage.getItem(WEB_RECOVERY_KEY);

    void readRaw()
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          setSnapshot(parseSnapshot(raw));
        } catch {
          setSnapshot(null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async () => {
    if (!snapshot) return;
    setBusy(true);
    const warnings: string[] = [];
    let sourceHandle: Awaited<ReturnType<typeof readWorkbook>>['sourceHandle'] | undefined;
    if (snapshot.filePath && isTauriRuntime()) {
      try {
        const encoded = await commands.readWorkbook(snapshot.filePath);
        const reread = await readWorkbook(base64ToBytes(encoded));
        sourceHandle = reread.sourceHandle;
      } catch {
        warnings.push(
          `Could not re-open ${basename(snapshot.filePath)}; passthrough sheets may be lost if you save.`,
        );
      }
    }
    useWorkbookStore.getState().restore(snapshot.data, {
      filePath: snapshot.filePath,
      sourceHandle,
      warnings,
    });
    if (warnings.length > 0) toast.warning(warnings[0] ?? 'Restored with warnings');
    else toast.success('Unsaved session restored');
    setSnapshot(null);
    setBusy(false);
  };

  const discard = async () => {
    setSnapshot(null);
    await clearRecoverySnapshot();
  };

  return (
    <Dialog open={snapshot !== null} onOpenChange={(open) => (!open ? void discard() : undefined)}>
      <DialogContent showCloseButton={false} data-testid="recovery-dialog">
        <DialogHeader>
          <DialogTitle>Restore unsaved session?</DialogTitle>
          <DialogDescription>
            {snapshot
              ? `Found changes from ${describeSnapshot(snapshot)} for ${basename(snapshot.filePath)}.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">
          Restoring marks the document as unsaved. Saving overwrites the file you choose.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => void discard()} disabled={busy}>
            Discard
          </Button>
          <Button onClick={() => void restore()} disabled={busy} data-testid="recovery-restore">
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
