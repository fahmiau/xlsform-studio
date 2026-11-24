/**
 * Single full-width clickable "+ Add row" bar positioned directly below the
 * last data row, replacing Glide's per-cell trailing "+" buttons.
 */
import type React from 'react';
import { Plus } from 'lucide-react';

import { GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT } from './geometry';

export interface AddRowBarProps {
  topInBody: number | null;
  viewportWidth: number;
  bodyHeight: number;
  label: string;
  onAddRow: () => void;
  onWheel: (event: React.WheelEvent<HTMLButtonElement>) => void;
}

export function AddRowBar({
  topInBody,
  viewportWidth,
  bodyHeight,
  label,
  onAddRow,
  onWheel,
}: AddRowBarProps) {
  if (topInBody === null || viewportWidth <= 0 || bodyHeight <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute left-0 z-10 overflow-hidden"
      style={{
        top: GRID_HEADER_HEIGHT,
        width: viewportWidth,
        height: bodyHeight,
      }}
    >
      <button
        type="button"
        data-testid="add-row-button"
        onClick={onAddRow}
        onWheel={onWheel}
        className="border-border/70 text-muted-foreground hover:text-foreground focus-visible:ring-ring pointer-events-auto absolute left-0 flex w-full cursor-pointer items-center gap-1.5 border-y bg-slate-50 px-3 text-left text-xs font-medium transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset dark:bg-slate-900 dark:hover:bg-slate-800"
        style={{
          top: topInBody,
          height: GRID_ROW_HEIGHT,
        }}
      >
        <Plus aria-hidden className="size-3.5 shrink-0" />
        <span>{label}</span>
      </button>
    </div>
  );
}
