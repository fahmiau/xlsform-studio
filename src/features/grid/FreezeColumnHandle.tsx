/**
 * Google Sheets-style draggable freeze column divider + accessible slider.
 *
 * When 0 data columns are frozen, a grip pill sits on the right edge of the
 * row-number gutter header (which is non-resizable). When >= 1 data columns are
 * frozen, dragging works both from the top header grip tab (leaving the lower
 * header border free for Glide's column resize) and anywhere along the vertical
 * freeze divider line down the body rows.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { GRID_HEADER_HEIGHT } from './geometry';
import {
  computeFreezeBoundaries,
  frozenEdgeX,
  snapFreezeBoundary,
  type FreezeBoundary,
} from './freezeHandle';

export interface FreezeColumnHandleProps {
  columnWidths: readonly number[];
  frozenCount: number;
  maxDataColumns: number;
  viewportWidth: number;
  bodyHeight: number;
  dataBottomInBody: number;
  getHostRect: () => DOMRect | null;
  getScrollLeft: () => number;
  onCommit: (nextDataCount: number) => void;
}

export function FreezeColumnHandle({
  columnWidths,
  frozenCount,
  maxDataColumns,
  viewportWidth,
  bodyHeight,
  dataBottomInBody,
  getHostRect,
  getScrollLeft,
  onCommit,
}: FreezeColumnHandleProps) {
  const [hovered, setHovered] = useState(false);
  const [dragSnap, setDragSnap] = useState<FreezeBoundary | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const frozenDataCount = Math.max(0, frozenCount - 1);
  const edgeX = frozenEdgeX(columnWidths, frozenCount);

  const startDrag = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      const hostRect = getHostRect();
      if (!hostRect) return;
      const boundaries = computeFreezeBoundaries(
        columnWidths,
        frozenCount,
        getScrollLeft(),
        viewportWidth,
      );
      if (boundaries.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      let currentSnap =
        snapFreezeBoundary(event.clientX - hostRect.left, boundaries) ?? boundaries[0];
      if (!currentSnap) return;
      setDragSnap(currentSnap);

      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        window.removeEventListener('keydown', onKeyDown, true);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        cleanupRef.current = null;
        const target = currentSnap;
        setDragSnap(null);
        if (commit && target && target.dataCount !== frozenDataCount) {
          onCommit(target.dataCount);
        }
      };

      const onMove = (moveEvent: PointerEvent) => {
        const next = snapFreezeBoundary(moveEvent.clientX - hostRect.left, boundaries);
        if (next && (next.dataCount !== currentSnap?.dataCount || next.x !== currentSnap?.x)) {
          currentSnap = next;
          setDragSnap(next);
        }
      };

      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          finish(false);
        }
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
      window.addEventListener('keydown', onKeyDown, true);
      cleanupRef.current = () => finish(false);
    },
    [
      columnWidths,
      frozenCount,
      frozenDataCount,
      getHostRect,
      getScrollLeft,
      onCommit,
      viewportWidth,
    ],
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, frozenDataCount - 1);
    else if (event.key === 'ArrowRight') next = Math.min(maxDataColumns, frozenDataCount + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = maxDataColumns;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (next !== frozenDataCount) onCommit(next);
  };

  if (viewportWidth <= 0 || maxDataColumns <= 0 || edgeX <= 0) return null;

  const clampedEdgeX = Math.min(edgeX, viewportWidth - 2);
  const dividerBodyHeight = Math.max(0, Math.min(bodyHeight, dataBottomInBody));
  const active = hovered || dragSnap !== null;
  const tooltip =
    frozenDataCount === 0
      ? 'Drag right to freeze columns'
      : `Drag to adjust frozen columns (${frozenDataCount} frozen)`;

  return (
    <>
      {/* Full-height subtle freeze divider line when >= 1 data column is frozen */}
      {frozenDataCount > 0 ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute top-0 z-20 w-[2px] -translate-x-1/2 transition-colors ${
            active ? 'bg-primary' : 'bg-slate-400/75 dark:bg-slate-500/75'
          }`}
          style={{
            left: clampedEdgeX,
            height: GRID_HEADER_HEIGHT + dividerBodyHeight,
          }}
        />
      ) : null}

      {/* Header grip handle (focusable slider for keyboard + screen readers) */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Freeze columns"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={maxDataColumns}
        aria-valuenow={frozenDataCount}
        aria-valuetext={
          frozenDataCount === 0
            ? 'No frozen columns'
            : `${frozenDataCount} frozen column${frozenDataCount === 1 ? '' : 's'}`
        }
        title={tooltip}
        data-testid="freeze-column-handle"
        data-frozen-count={frozenDataCount}
        className="focus-visible:ring-ring absolute top-0 z-30 flex cursor-grab items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
        style={{
          left: clampedEdgeX - 5,
          width: 11,
          // Leave the lower header edge clear for Glide column resize when columns are frozen.
          height: frozenDataCount === 0 ? GRID_HEADER_HEIGHT : 14,
        }}
        onPointerDown={startDrag}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onKeyDown={handleKeyDown}
      >
        <span
          aria-hidden
          className={`rounded-sm transition-colors ${
            frozenDataCount === 0 ? 'h-6 w-[5px]' : 'mt-0.5 h-2.5 w-[7px]'
          } ${active ? 'bg-primary' : 'bg-slate-400/85 dark:bg-slate-500/85'}`}
        />
      </div>

      {/* Grabbable vertical freeze divider strip along the body rows */}
      {frozenDataCount > 0 && dividerBodyHeight > 0 ? (
        <div
          aria-hidden
          title={tooltip}
          data-testid="freeze-column-divider"
          className="absolute z-20 cursor-grab active:cursor-grabbing"
          style={{
            left: clampedEdgeX - 4,
            top: GRID_HEADER_HEIGHT,
            width: 8,
            height: dividerBodyHeight,
          }}
          onPointerDown={startDrag}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        />
      ) : null}

      {/* Live drag snap preview line + badge */}
      {dragSnap ? (
        <>
          <div
            aria-hidden
            data-testid="freeze-drag-guide"
            className="bg-primary pointer-events-none absolute top-0 z-40 w-[2px] -translate-x-1/2"
            style={{
              left: Math.min(dragSnap.x, viewportWidth - 1),
              height: GRID_HEADER_HEIGHT + bodyHeight,
            }}
          />
          <div
            aria-hidden
            className="bg-primary text-primary-foreground pointer-events-none absolute z-40 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm"
            style={{
              left: Math.min(Math.max(8, dragSnap.x + 6), Math.max(8, viewportWidth - 110)),
              top: 6,
            }}
          >
            {dragSnap.dataCount === 0
              ? 'Unfreeze'
              : `Freeze ${dragSnap.dataCount} col${dragSnap.dataCount === 1 ? '' : 's'}`}
          </div>
        </>
      ) : null}
    </>
  );
}
