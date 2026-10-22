/** Drop-zone visual for outline drag-and-drop (Task 3.10). */
import { useDroppable } from '@dnd-kit/core';

export type DropPlacement = 'before' | 'inside' | 'after';

export function DropIndicator({
  rowId,
  placement,
  valid,
}: {
  rowId: string;
  placement: DropPlacement;
  valid: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${placement}:${rowId}` });
  const active = isOver;
  return (
    <div
      ref={setNodeRef}
      className={
        placement === 'inside'
          ? `pointer-events-none absolute inset-x-2 top-1/2 h-4 -translate-y-1/2 rounded border ${
              active
                ? valid
                  ? 'border-sky-500 bg-sky-500/20'
                  : 'border-red-500 bg-red-500/20'
                : 'border-transparent'
            }`
          : `pointer-events-none absolute inset-x-0 h-1 ${
              placement === 'before' ? 'top-0' : 'bottom-0'
            } ${active ? (valid ? 'bg-sky-500' : 'bg-red-500') : ''}`
      }
      data-testid={active ? `drop-${placement}-${valid ? 'valid' : 'invalid'}` : undefined}
    />
  );
}
