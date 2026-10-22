/** Row context menu (Task 2.4). */
import { useEffect, useRef, type ReactNode } from 'react';
import { ClipboardPaste, Copy, CopyPlus, Scissors, Trash2 } from 'lucide-react';

export interface RowContextMenuState {
  x: number;
  y: number;
}

export interface RowContextMenuActions {
  insertAbove: () => void;
  insertBelow: () => void;
  insertMany: () => void;
  duplicate: () => void;
  deleteRows: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
}

export function RowContextMenu({
  state,
  actions,
  onClose,
}: {
  state: RowContextMenuState | null;
  actions: RowContextMenuActions;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  const item = (label: string, run: () => void, icon?: ReactNode) => (
    <button
      type="button"
      className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
      onClick={() => {
        run();
        onClose();
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="row-context-menu"
      className="bg-popover text-popover-foreground fixed z-50 min-w-52 rounded-md border py-1 shadow-lg"
      style={{
        left: Math.min(state.x, window.innerWidth - 220),
        top: Math.min(state.y, window.innerHeight - 300),
      }}
    >
      {item('Insert row above', actions.insertAbove)}
      {item('Insert row below', actions.insertBelow)}
      {item('Insert N rows…', actions.insertMany)}
      {item('Duplicate rows', actions.duplicate, <CopyPlus aria-hidden className="size-4" />)}
      {item('Delete rows', actions.deleteRows, <Trash2 aria-hidden className="size-4" />)}
      <div className="my-1 border-t" />
      {item('Copy', actions.copy, <Copy aria-hidden className="size-4" />)}
      {item('Cut', actions.cut, <Scissors aria-hidden className="size-4" />)}
      {item('Paste', actions.paste, <ClipboardPaste aria-hidden className="size-4" />)}
    </div>
  );
}
