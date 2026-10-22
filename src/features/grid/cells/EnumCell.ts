/**
 * Enum cell for the `type` and `appearance` columns (Task 3.1). It renders
 * plain text, optionally with a select choice-count badge that opens the
 * drawer, and routes editing through the overlay enum editors.
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

export const ENUM_CELL_KIND = 'xlsform-enum';

export interface EnumCellData {
  kind: typeof ENUM_CELL_KIND;
  column: 'type' | 'appearance';
  value: string;
  rowId: RowId;
  /** Base type for appearance filtering. */
  baseType?: string;
  /** Present on select questions whose list exists. */
  choiceCount?: number;
}

export type EnumCell = CustomCell<EnumCellData>;

export function makeEnumCell(data: Omit<EnumCellData, 'kind'>): EnumCell {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: true,
    copyData: data.value,
    readonly: false,
    data: { kind: ENUM_CELL_KIND, ...data },
  };
}

function isEnumCell(cell: unknown): cell is EnumCell {
  if (typeof cell !== 'object' || cell === null) return false;
  const candidate = cell as { kind?: string; data?: { kind?: string } };
  return candidate.kind === GridCellKind.Custom && candidate.data?.kind === ENUM_CELL_KIND;
}

const BADGE_WIDTH = 38;

function drawEnum(args: DrawArgs<EnumCell>): void {
  const { ctx, rect, theme, cell, highlighted } = args;
  const badge = cell.data.choiceCount !== undefined && rect.width > BADGE_WIDTH + 20;
  const textRect = badge ? { ...rect, width: rect.width - BADGE_WIDTH } : rect;
  drawTextCell({ ...args, rect: textRect }, cell.data.value, 'left');

  if (!badge) return;
  const width = 28;
  const x = rect.x + rect.width - width - 6;
  const y = rect.y + (rect.height - 16) / 2;
  ctx.save();
  ctx.fillStyle = highlighted ? theme.accentColor : theme.bgBubble;
  roundedRect(ctx, x, y, width, 16, 8);
  ctx.fill();
  ctx.fillStyle = theme.textDark;
  ctx.font = `600 10px ${theme.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(cell.data.choiceCount), x + width / 2, y + 8);
  ctx.restore();
}

export const enumRenderer: CustomRenderer<EnumCell> = {
  kind: GridCellKind.Custom,
  isMatch: isEnumCell,
  draw: drawEnum,
  onClick: ({ cell, posX, bounds, preventDefault }) => {
    if (cell.data.choiceCount === undefined) return undefined;
    if (posX < bounds.width - BADGE_WIDTH) return undefined;
    preventDefault();
    useUiStore.getState().openChoicesDrawer(cell.data.rowId);
    return cell;
  },
  onPaste: (value, data) => ({ ...data, value }),
};
