/**
 * Custom gutter cell (Task 2.2, R2 proof): indent guides, `[G]`/`[R]` badge,
 * collapse chevron slot, and an orphan marker. Folding is wired in Stage 3.
 */
import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type DrawArgs,
} from '@glideapps/glide-data-grid';

export const GUTTER_CELL_KIND = 'xlsform-gutter';

export type GutterRowKind = 'group' | 'repeat' | 'end_group' | 'end_repeat' | null;

export interface GutterCellData {
  kind: typeof GUTTER_CELL_KIND;
  depth: number;
  rowKind: GutterRowKind;
  orphan: boolean;
  collapsed: boolean;
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

function drawGutter(args: DrawArgs<GutterCell>): void {
  const { ctx, rect, theme, cell } = args;
  const { depth, rowKind, orphan, collapsed } = cell.data;
  if (depth <= 0 && rowKind === null && !orphan) return;

  ctx.save();
  ctx.lineWidth = 1;

  // Indent guides: one vertical line per open nesting level.
  ctx.strokeStyle = theme.borderColor;
  for (let level = 0; level < depth; level += 1) {
    const x = rect.x + 7 + level * 10;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, rect.y + 2);
    ctx.lineTo(x + 0.5, rect.y + rect.height - 2);
    ctx.stroke();
  }

  const badgeX = rect.x + 7 + depth * 10;
  ctx.font = `600 9px ${theme.fontFamily}`;
  ctx.textBaseline = 'middle';
  const centerY = rect.y + rect.height / 2;
  if (rowKind === 'group' || rowKind === 'end_group') {
    ctx.fillStyle = theme.textLight;
    ctx.fillText('[G]', badgeX, centerY);
  } else if (rowKind === 'repeat' || rowKind === 'end_repeat') {
    ctx.fillStyle = theme.textLight;
    ctx.fillText('[R]', badgeX, centerY);
  }

  if (rowKind === 'group' || rowKind === 'repeat') {
    ctx.fillStyle = theme.textMedium;
    drawChevron(ctx, rect.x + rect.width - 8, centerY, collapsed);
  }

  if (orphan) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(rect.x + 4, centerY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const gutterRenderer: CustomRenderer<GutterCell> = {
  kind: GridCellKind.Custom,
  isMatch: isGutterCell,
  draw: drawGutter,
  // Gutter cells are never edited or pasted into.
  onPaste: () => undefined,
};
