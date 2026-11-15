/** Pure layout math for anchoring cell lint diagnostic tooltips inside the grid host. */
export interface CellBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DiagnosticTooltipLayout {
  placement: 'above' | 'below';
  style: {
    maxWidth: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
}

const EDGE_MARGIN = 8;
const CELL_GAP = 4;
const PREFERRED_MAX_WIDTH = 448;
const MIN_SPACE_ABOVE = 56;
const MIN_ANCHOR_LEFT_SPACE = 320;

export function computeDiagnosticTooltipLayout(
  bounds: CellBounds,
  host: HostRect,
  headerHeight: number,
): DiagnosticTooltipLayout {
  const cellLeft = bounds.x - host.left;
  const cellTop = bounds.y - host.top;
  const cellRight = cellLeft + bounds.width;
  const cellBottom = cellTop + bounds.height;

  const spaceAbove = cellTop - headerHeight;
  const spaceBelow = host.height - cellBottom;
  const placement: 'above' | 'below' =
    spaceAbove >= MIN_SPACE_ABOVE || spaceAbove >= spaceBelow ? 'above' : 'below';

  const hostMaxWidth = Math.max(160, Math.min(PREFERRED_MAX_WIDTH, host.width - EDGE_MARGIN * 2));
  const clampedCellLeft = Math.max(EDGE_MARGIN, cellLeft);
  const rightRoom = host.width - clampedCellLeft - EDGE_MARGIN;

  const horizontalStyle: { left?: number; right?: number; maxWidth: number } =
    rightRoom >= Math.min(hostMaxWidth, MIN_ANCHOR_LEFT_SPACE)
      ? {
          left: clampedCellLeft,
          maxWidth: Math.min(hostMaxWidth, rightRoom),
        }
      : {
          right: Math.max(EDGE_MARGIN, host.width - Math.min(host.width - EDGE_MARGIN, cellRight)),
          maxWidth: Math.min(
            hostMaxWidth,
            Math.max(160, Math.min(host.width - EDGE_MARGIN, cellRight) - EDGE_MARGIN),
          ),
        };

  if (placement === 'above') {
    return {
      placement,
      style: {
        ...horizontalStyle,
        bottom: Math.max(EDGE_MARGIN, host.height - cellTop + CELL_GAP),
      },
    };
  }

  return {
    placement,
    style: {
      ...horizontalStyle,
      top: Math.max(EDGE_MARGIN, Math.min(host.height - EDGE_MARGIN, cellBottom + CELL_GAP)),
    },
  };
}
