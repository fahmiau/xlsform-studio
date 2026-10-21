import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkbookStore } from '@/state/workbookStore';
import { basename } from './fileActions';
import { useUnsavedGuard } from './unsavedGuard';

/** Save / Don't Save / Cancel guard for New, Open, and window close. */
export function UnsavedDialog() {
  const open = useUnsavedGuard((state) => state.open);
  const answer = useUnsavedGuard((state) => state.answer);
  const filePath = useWorkbookStore((state) => state.filePath);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) answer('cancel');
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save changes?</DialogTitle>
          <DialogDescription>
            {basename(filePath)} has unsaved changes. Save them before continuing?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer('cancel')}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => answer('discard')}>
            Don&apos;t Save
          </Button>
          <Button onClick={() => answer('save')}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
