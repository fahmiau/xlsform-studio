import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '@/state/uiStore';

import { enumRenderer, makeEnumCell } from './EnumCell';

function clickArgs(choiceCount?: number, posX = 100) {
  const cell = makeEnumCell({
    column: 'type',
    value: 'select_one yes_no',
    rowId: 'row1',
    ...(choiceCount === undefined ? {} : { choiceCount }),
  });
  return {
    cell,
    posX,
    posY: 10,
    bounds: { x: 0, y: 0, width: 130, height: 34 },
    preventDefault: vi.fn(),
  };
}

beforeEach(() => {
  useUiStore.setState({ choiceDrawer: { open: false, rowId: null } });
});

describe('choice badge (Task 3.1)', () => {
  it('opens the drawer when the badge is clicked', () => {
    const args = clickArgs(2, 110);
    enumRenderer.onClick?.(args as never);
    expect(args.preventDefault).toHaveBeenCalled();
    expect(useUiStore.getState().choiceDrawer).toEqual({ open: true, rowId: 'row1' });
  });

  it('ignores clicks elsewhere and cells without a list', () => {
    const left = clickArgs(2, 40);
    enumRenderer.onClick?.(left as never);
    expect(left.preventDefault).not.toHaveBeenCalled();
    expect(useUiStore.getState().choiceDrawer.open).toBe(false);

    const noBadge = clickArgs(undefined, 120);
    enumRenderer.onClick?.(noBadge as never);
    expect(noBadge.preventDefault).not.toHaveBeenCalled();
  });
});
