/** XPath cell used by the grid so double-click mounts CodeMirror (Task 4.6). */
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type DrawArgs,
} from '@glideapps/glide-data-grid';

import type { ColumnKey, RowId } from '@/core/model/types';

export const XPATH_CELL_KIND = 'xlsform-xpath';

export interface XPathCellData {
  kind: typeof XPATH_CELL_KIND;
  value: string;
  rowId: RowId;
  column: ColumnKey;
  readonly?: boolean;
  faded?: boolean;
}

export type XPathCell = CustomCell<XPathCellData>;

export function makeXPathCell(data: Omit<XPathCellData, 'kind'>): XPathCell {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: data.readonly !== true,
    copyData: data.value,
    data: { kind: XPATH_CELL_KIND, ...data },
  };
}

function isXPathCell(cell: unknown): cell is XPathCell {
  if (typeof cell !== 'object' || cell === null) return false;
  const candidate = cell as { kind?: string; data?: { kind?: string } };
  return candidate.kind === GridCellKind.Custom && candidate.data?.kind === XPATH_CELL_KIND;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return end > 0 ? `${text.slice(0, end)}…` : '…';
}

function drawXPath(args: DrawArgs<XPathCell>): void {
  const { ctx, rect, theme, cell } = args;
  const { value, readonly, faded } = cell.data;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.font = theme.baseFontStyle;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = faded ? theme.textLight : readonly ? theme.textMedium : theme.textDark;
  const padding = 6;
  const text = truncate(ctx, value, rect.width - padding * 2);
  ctx.fillText(text, rect.x + padding, rect.y + rect.height / 2);
  ctx.restore();
}

export const xpathRenderer: CustomRenderer<XPathCell> = {
  kind: GridCellKind.Custom,
  isMatch: isXPathCell,
  draw: drawXPath,
  // Editing is handled by the CodeMirror overlay; paste goes through the grid's
  // batch pipeline and never calls this.
  onPaste: () => undefined,
};
