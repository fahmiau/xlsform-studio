/** Row-level Glide theme overrides (Task 2.3, PRD §4.1). */
import type { Theme } from '@glideapps/glide-data-grid';

import { ROW_TINTS } from './theme';

export type RowStyleKind = 'group' | 'repeat' | 'end' | 'orphan' | 'choice-boundary' | null;

/** "Needs translation" tint for one target-language cell (Task 5.4). */
export function translationCellTheme(dark: boolean): Partial<Theme> {
  const tints = dark ? ROW_TINTS.dark : ROW_TINTS.light;
  return { bgCell: tints.translation };
}

export function rowThemeOverride(
  theme: Theme,
  dark: boolean,
  kind: RowStyleKind,
): Partial<Theme> | undefined {
  if (kind === null) return undefined;
  const tints = dark ? ROW_TINTS.dark : ROW_TINTS.light;

  switch (kind) {
    case 'group':
    case 'repeat':
      return {
        bgCell: kind === 'group' ? tints.group : tints.repeat,
        baseFontStyle: `600 13px ${theme.fontFamily}`,
      };
    case 'end':
      return {
        bgCell: tints.end,
        textDark: theme.textLight,
        baseFontStyle: `13px ${theme.fontFamily}`,
      };
    case 'orphan':
      // The gutter draws a red dot; tinting the whole row is too loud (PRD §4.1).
      return undefined;
    case 'choice-boundary':
      return { horizontalBorderColor: theme.accentColor };
  }
}
