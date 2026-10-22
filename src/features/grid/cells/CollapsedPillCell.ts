/**
 * Collapsed group summary (Task 3.7): the begin row's label cell becomes a pill
 * with the hidden-question count until the group is expanded.
 */
import {
  GridCellKind,
  drawTextCell,
  roundedRect,
  type CustomCell,
  type CustomRenderer,
  type DrawArgs,
} from '@glideapps/glide-data-grid';

import type { RowId } from '@/core/model/types';
import { useUiStore } from '@/state/uiStore';

export const COLLAPSED_PILL_KIND = 'xlsform-collapsed-pill';

export interface CollapsedPillData {
  kind: typeof COLLAPSED_PILL_KIND;
  label: string;
  count: number;
  rowId: RowId;
}

export type CollapsedPillCell = CustomCell<CollapsedPillData>;

export function makeCollapsedPillCell(data: Omit<CollapsedPillData, 'kind'>): CollapsedPillCell {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: data.label,
    data: { kind: COLLAPSED_PILL_KIND, ...data },
  };
}

function isCollapsedPill(cell: unknown): cell is CollapsedPillCell {
  if (typeof cell !== 'object' || cell === null) return false;
  const candidate = cell as { kind?: string; data?: { kind?: string } };
  return candidate.kind === GridCellKind.Custom && candidate.data?.kind === COLLAPSED_PILL_KIND;
}

function drawPill(args: DrawArgs<CollapsedPillCell>): void {
  const { ctx, rect, theme, cell } = args;
  const text = `${cell.data.count} questions hidden`;
  ctx.save();
  ctx.font = `600 11px ${theme.fontFamily}`;
  const textWidth = ctx.measureText(text).width;
  const pillWidth = Math.min(rect.width - 8, textWidth + 16);

  drawTextCell(
    { ...args, rect: { ...rect, width: Math.max(0, rect.width - pillWidth - 8) } },
    cell.data.label,
    'left',
  );

  const x = rect.x + rect.width - pillWidth - 4;
  const y = rect.y + (rect.height - 18) / 2;
  ctx.fillStyle = theme.bgBubbleSelected;
  roundedRect(ctx, x, y, pillWidth, 18, 9);
  ctx.fill();
  ctx.fillStyle = theme.textDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pillWidth / 2, y + 9);
  ctx.restore();
}

export const collapsedPillRenderer: CustomRenderer<CollapsedPillCell> = {
  kind: GridCellKind.Custom,
  isMatch: isCollapsedPill,
  draw: drawPill,
  onClick: ({ cell, preventDefault }) => {
    preventDefault();
    useUiStore.getState().toggleGroupCollapsed(cell.data.rowId);
    return cell;
  },
};
