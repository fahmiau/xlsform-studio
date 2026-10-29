/**
 * Custom gutter cell (Task 2.2, Category C5): real sheet row number, indent
 * guides, `[G]`/`[R]` badge, collapse chevron, and an orphan marker. The number
 * is the projected real row, so folding never renumbers (C5).
 */
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type DrawArgs,
} from '@glideapps/glide-data-grid';
import { toast } from 'sonner';

import type { RowId } from '@/core/model/types';
import { useUiStore } from '@/state/uiStore';

import type { StructuralRowKind } from '../editability';
import type { GutterRail } from '../groupRails';

export const GUTTER_CELL_KIND = 'xlsform-gutter';

/** Fixed left slot for the row number; decorations live to its right. */
// shortcut: 26 px fits 4 digits, widen if a sheet exceeds 9999 data rows.
const NUMBER_WIDTH = 26;
const NUMBER_RIGHT = NUMBER_WIDTH - 4;
const ORPHAN_X = NUMBER_WIDTH + 3;
const INDENT_X = NUMBER_WIDTH + 8;
const INDENT_STEP = 8;
const RAIL_WIDTH = 2;
const NUMBER_FONT = '500 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export type GutterRowKind = 'group' | 'repeat' | 'end_group' | 'end_repeat' | null;

/** Begin/end structural rows share one gutter badge: `[G]` or `[R]`. */
export function structuralToGutterKind(kind: StructuralRowKind): GutterRowKind {
  if (kind === 'begin_group') return 'group';
  if (kind === 'begin_repeat') return 'repeat';
  return kind;
}

export interface GutterCellData {
  kind: typeof GUTTER_CELL_KIND;
  /**
   * Real 1-based sheet row; stays put when rows above it are hidden (C5).
   * Omitted in the drawer, where Glide's own marker column shows the number.
   */
  rowNumber?: number;
  depth: number;
  rowKind: GutterRowKind;
  orphan: boolean;
  collapsed: boolean;
  /** False for unclosed groups; the chevron is disabled (XLS-003). */
  canCollapse: boolean;
  /** Begin row id, for toggling. */
  rowId?: RowId;
  /** Worst diagnostic in the row, for the gutter dot (XLS-001…011). */
  diagnosticSeverity?: 'error' | 'warning';
  /** Per-group color rails at the far-left edge; outermost first. */
  rails?: readonly GutterRail[];
}

export type GutterCell = CustomCell<GutterCellData>;

export function makeGutterCell(data: Omit<GutterCellData, 'kind'>): GutterCell {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: '',
    data: { kind: GUTTER_CELL_KIND, ...data },
  };
}

function isGutterCell(cell: unknown): cell is GutterCell {
  if (typeof cell !== 'object' || cell === null) return false;
  const candidate = cell as { kind?: string; data?: { kind?: string } };
  return candidate.kind === GridCellKind.Custom && candidate.data?.kind === GUTTER_CELL_KIND;
}

function drawChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  collapsed: boolean,
): void {
  ctx.beginPath();
  if (collapsed) {
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 4);
  } else {
    ctx.moveTo(x - 3, y - 2);
    ctx.lineTo(x + 3, y - 2);
    ctx.lineTo(x, y + 3);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawGutter(args: DrawArgs<GutterCell>): void {
  const { ctx, rect, theme, cell } = args;
  const { depth, rowKind, orphan, collapsed, canCollapse, diagnosticSeverity, rowNumber, rails } =
    cell.data;

  ctx.save();
  ctx.lineWidth = 1;
  const centerY = rect.y + rect.height / 2;

  // Group rails first so a deep rail never sits on top of the row number text.
  for (const rail of rails ?? []) {
    ctx.fillStyle = rail.color;
    ctx.fillRect(rect.x + rail.offset, rect.y, RAIL_WIDTH, rect.height);
  }

  // Real sheet row number, in its own left slot. Drawn for every row so a
  // collapsed group shows 10 then 20 instead of renumbering to 11 (C5).
  if (rowNumber !== undefined) {
    ctx.font = NUMBER_FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    // buildGridTheme keeps textMedium light (#cbd5e1) in dark, so one color works.
    ctx.fillStyle = theme.textMedium;
    ctx.fillText(String(rowNumber), rect.x + NUMBER_RIGHT, centerY);
  }

  // Indent guides: one vertical line per open nesting level.
  ctx.textAlign = 'left';
  ctx.strokeStyle = theme.borderColor;
  for (let level = 0; level < depth; level += 1) {
    const x = rect.x + INDENT_X + level * INDENT_STEP;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, rect.y + 2);
    ctx.lineTo(x + 0.5, rect.y + rect.height - 2);
    ctx.stroke();
  }

  const badgeX = rect.x + INDENT_X + depth * INDENT_STEP;
  ctx.font = `600 9px ${theme.fontFamily}`;
  ctx.textBaseline = 'middle';
  if (rowKind === 'group' || rowKind === 'end_group') {
    ctx.fillStyle = theme.textLight;
    ctx.fillText('[G]', badgeX, centerY);
  } else if (rowKind === 'repeat' || rowKind === 'end_repeat') {
    ctx.fillStyle = theme.textLight;
    ctx.fillText('[R]', badgeX, centerY);
  }

  if (rowKind === 'group' || rowKind === 'repeat') {
    ctx.fillStyle = canCollapse ? theme.textMedium : theme.textLight;
    if (canCollapse) drawChevron(ctx, rect.x + rect.width - 8, centerY, collapsed);
    else {
      // Unclosed group: show a muted chevron so the affordance is discoverable.
      ctx.globalAlpha = 0.35;
      drawChevron(ctx, rect.x + rect.width - 8, centerY, false);
      ctx.globalAlpha = 1;
    }
  }

  if (orphan) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(rect.x + ORPHAN_X, centerY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (diagnosticSeverity) {
    ctx.fillStyle = diagnosticSeverity === 'error' ? '#dc2626' : '#d97706';
    ctx.beginPath();
    ctx.arc(rect.x + rect.width - 5, rect.y + 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const gutterRenderer: CustomRenderer<GutterCell> = {
  kind: GridCellKind.Custom,
  isMatch: isGutterCell,
  draw: drawGutter,
  onClick: ({ cell, posX, bounds, preventDefault }) => {
    const rowKind = cell.data.rowKind;
    if (rowKind !== 'group' && rowKind !== 'repeat') return undefined;
    if (posX < bounds.width - 14) return undefined;
    preventDefault();
    if (!cell.data.canCollapse || !cell.data.rowId) {
      toast.info('This group is never closed', {
        description: 'Add its matching end row first (lint rule XLS-003).',
      });
      return cell;
    }
    useUiStore.getState().toggleGroupCollapsed(cell.data.rowId);
    return cell;
  },
  // Gutter cells are never edited or pasted into.
  onPaste: () => undefined,
};
