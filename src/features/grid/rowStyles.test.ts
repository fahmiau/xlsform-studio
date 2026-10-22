import { describe, expect, it } from 'vitest';

import { buildGridTheme, ROW_TINTS } from './theme';
import { rowThemeOverride } from './rowStyles';

describe('row theme overrides (Task 2.3)', () => {
  const light = buildGridTheme(false);
  const dark = buildGridTheme(true);

  it('returns nothing for ordinary rows', () => {
    expect(rowThemeOverride(light, false, null)).toBeUndefined();
  });

  it('tints and bolds group rows', () => {
    expect(rowThemeOverride(light, false, 'group')).toMatchObject({
      bgCell: ROW_TINTS.light.group,
      baseFontStyle: expect.stringContaining('600'),
    });
    expect(rowThemeOverride(dark, true, 'repeat')).toMatchObject({
      bgCell: ROW_TINTS.dark.repeat,
    });
  });

  it('mutes end rows', () => {
    expect(rowThemeOverride(light, false, 'end')).toMatchObject({
      bgCell: ROW_TINTS.light.end,
      textDark: light.textLight,
    });
  });

  it('leaves orphan tinting to the gutter marker', () => {
    expect(rowThemeOverride(dark, true, 'orphan')).toBeUndefined();
  });

  it('uses a stronger border for choice list boundaries', () => {
    expect(rowThemeOverride(light, false, 'choice-boundary')).toMatchObject({
      horizontalBorderColor: light.accentColor,
    });
  });

  it('builds distinct light and dark themes', () => {
    expect(light.bgCell).not.toBe(dark.bgCell);
    expect(dark.textDark).not.toBe(light.textDark);
  });
});
