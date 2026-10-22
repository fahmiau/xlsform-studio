/**
 * Drawer name cell (Task 3.4): shows the generated/manual code and a lock
 * glyph. Clicking the glyph unlocks the row and regenerates its slug.
 */
import {
  GridCellKind,
  drawTextCell,
  type CustomCell,
  type CustomRenderer,
  type DrawArgs,
} from '@glideapps/glide-data-grid';

import type { RowId } from '@/core/model/types';
import { unlockChoiceName } from '@/core/ops/choices';
import { useWorkbookStore } from '@/state/workbookStore';

export const CHOICE_NAME_CELL_KIND = 'xlsform-choice-name';
const LOCK_WIDTH = 22;

export interface ChoiceNameCellData {
  kind: typeof CHOICE_NAME_CELL_KIND;
  value: string;
  locked: boolean;
  rowId: RowId;
}

export type ChoiceNameCell = CustomCell<ChoiceNameCellData>;

export function makeChoiceNameCell(data: Omit<ChoiceNameCellData, 'kind'>): ChoiceNameCell {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: true,
    copyData: data.value,
    data: { kind: CHOICE_NAME_CELL_KIND, ...data },
  };
}

function isChoiceNameCell(cell: unknown): cell is ChoiceNameCell {
  if (typeof cell !== 'object' || cell === null) return false;
  const candidate = cell as { kind?: string; data?: { kind?: string } };
  return candidate.kind === GridCellKind.Custom && candidate.data?.kind === CHOICE_NAME_CELL_KIND;
}

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillRect(x + 1, y, 6, 5);
  ctx.strokeRect(x + 1, y, 6, 5);
  ctx.beginPath();
  ctx.arc(x + 4, y, 3, Math.PI, 0);
  ctx.stroke();
}

function drawChoiceName(args: DrawArgs<ChoiceNameCell>): void {
  const { ctx, rect, theme, cell, highlighted } = args;
  const locked = cell.data.locked;
  const textRect = locked ? { ...rect, width: Math.max(0, rect.width - LOCK_WIDTH) } : rect;
  drawTextCell({ ...args, rect: textRect }, cell.data.value, 'left');
  if (!locked) return;
  ctx.save();
  ctx.strokeStyle = highlighted ? theme.accentColor : theme.textMedium;
  ctx.fillStyle = highlighted ? theme.accentColor : theme.textMedium;
  drawLock(ctx, rect.x + rect.width - 14, rect.y + rect.height / 2 - 3);
  ctx.restore();
}

export const choiceNameRenderer: CustomRenderer<ChoiceNameCell> = {
  kind: GridCellKind.Custom,
  isMatch: isChoiceNameCell,
  draw: drawChoiceName,
  onClick: ({ cell, posX, bounds, preventDefault }) => {
    if (!cell.data.locked || posX < bounds.width - LOCK_WIDTH) return undefined;
    preventDefault();
    useWorkbookStore
      .getState()
      .apply('Unlock choice name', (data) => unlockChoiceName(data, cell.data.rowId), {
        sheet: 'choices',
        rowIds: [cell.data.rowId],
      });
    return cell;
  },
  onPaste: (value, data) => ({ ...data, value }),
};
