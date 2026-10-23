/**
 * Keyboard shortcut help (Task 5.6). Rows are generated from the command
 * registry; `PRD_SHORTCUTS` fixes the order and the PRD coverage test.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRD_SHORTCUTS } from '@/lib/appCommands';
import { getCommand, shortcutLabel } from '@/lib/commands';
import { useUiStore } from '@/state/uiStore';

export function ShortcutsSheet() {
  const open = useUiStore((state) => state.shortcutsOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md" data-testid="shortcuts-sheet">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Every shortcut is available from the command palette.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-xs">
          <tbody>
            {PRD_SHORTCUTS.map((entry) => {
              const command = getCommand(entry.id);
              return (
                <tr key={entry.id} className="border-b last:border-0" data-testid="shortcut-row">
                  <td className="py-1 pr-3">{command?.title ?? entry.label}</td>
                  <td className="py-1 text-right font-mono text-muted-foreground">
                    {shortcutLabel(command?.shortcut) || entry.keys}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
