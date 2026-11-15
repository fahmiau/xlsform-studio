import { describe, expect, it } from 'vitest';

import { computeDiagnosticTooltipLayout } from './diagnosticTooltip';

const host = { left: 100, top: 80, width: 1000, height: 500 };

describe('computeDiagnosticTooltipLayout', () => {
  it('places the tooltip directly above a mid-grid cell using host-relative coordinates', () => {
    const layout = computeDiagnosticTooltipLayout(
      { x: 420, y: 380, width: 200, height: 32 },
      host,
      34,
    );
    expect(layout.placement).toBe('above');
    expect(layout.style.left).toBe(320);
    expect(layout.style.bottom).toBe(500 - 300 + 4);
    expect(layout.style.top).toBeUndefined();
    expect(layout.style.maxWidth).toBe(448);
  });

  it('flips the tooltip below row 0 when space above is constrained by the header', () => {
    const layout = computeDiagnosticTooltipLayout(
      { x: 300, y: 80 + 34, width: 180, height: 32 },
      host,
      34,
    );
    expect(layout.placement).toBe('below');
    expect(layout.style.left).toBe(200);
    expect(layout.style.top).toBe(34 + 32 + 4);
    expect(layout.style.bottom).toBeUndefined();
  });

  it('right-aligns the tooltip when hovering near the right edge of the grid', () => {
    const layout = computeDiagnosticTooltipLayout(
      { x: 950, y: 340, width: 120, height: 32 },
      host,
      34,
    );
    expect(layout.placement).toBe('above');
    expect(layout.style.left).toBeUndefined();
    expect(layout.style.right).toBe(30);
    expect(layout.style.maxWidth).toBe(448);
  });

  it('clamps left and maxWidth inside narrow hosts', () => {
    const narrowHost = { left: 0, top: 0, width: 220, height: 300 };
    const layout = computeDiagnosticTooltipLayout(
      { x: -10, y: 200, width: 140, height: 32 },
      narrowHost,
      34,
    );
    expect(layout.placement).toBe('above');
    expect(layout.style.left).toBe(8);
    expect(layout.style.maxWidth).toBe(204);
  });
});
