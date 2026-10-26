/** Glide theme matching the app's Tailwind palette (Task 2.1/2.3). */
import { getDefaultTheme, type Theme } from '@glideapps/glide-data-grid';

export function buildGridTheme(dark: boolean): Theme {
  const base = getDefaultTheme();
  if (dark) {
    return {
      ...base,
      accentColor: '#818cf8',
      accentFg: '#0f172a',
      accentLight: 'rgba(129, 140, 248, 0.22)',
      textDark: '#e2e8f0',
      textMedium: '#cbd5e1',
      textLight: '#94a3b8',
      textBubble: '#e2e8f0',
      bgIconHeader: '#64748b',
      fgIconHeader: '#f8fafc',
      textHeader: '#e2e8f0',
      textHeaderSelected: '#ffffff',
      bgCell: '#0f172a',
      bgCellMedium: '#1e293b',
      bgHeader: '#1e293b',
      bgHeaderHasFocus: '#334155',
      bgHeaderHovered: '#273449',
      bgBubble: '#1e293b',
      bgBubbleSelected: '#312e81',
      bgSearchResult: '#854d0e',
      borderColor: 'rgba(148, 163, 184, 0.24)',
      horizontalBorderColor: 'rgba(148, 163, 184, 0.18)',
      drilldownBorder: 'rgba(148, 163, 184, 0.5)',
      linkColor: '#93c5fd',
      baseFontStyle: '13px Inter, ui-sans-serif, system-ui, sans-serif',
      headerFontStyle: '600 13px Inter, ui-sans-serif, system-ui, sans-serif',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      editorFontSize: '13px',
    };
  }
  return {
    ...base,
    accentColor: '#4f46e5',
    accentFg: '#ffffff',
    accentLight: 'rgba(79, 70, 229, 0.16)',
    textDark: '#0f172a',
    textMedium: '#334155',
    textLight: '#64748b',
    textBubble: '#0f172a',
    bgIconHeader: '#64748b',
    fgIconHeader: '#ffffff',
    textHeader: '#0f172a',
    textHeaderSelected: '#ffffff',
    bgCell: '#ffffff',
    bgCellMedium: '#f8fafc',
    bgHeader: '#f8fafc',
    bgHeaderHasFocus: '#e2e8f0',
    bgHeaderHovered: '#eef2f7',
    bgBubble: '#f1f5f9',
    bgBubbleSelected: '#e0e7ff',
    bgSearchResult: '#fef08a',
    borderColor: 'rgba(100, 116, 139, 0.24)',
    horizontalBorderColor: 'rgba(100, 116, 139, 0.16)',
    drilldownBorder: 'rgba(100, 116, 139, 0.4)',
    linkColor: '#2563eb',
    baseFontStyle: '13px Inter, ui-sans-serif, system-ui, sans-serif',
    headerFontStyle: '600 13px Inter, ui-sans-serif, system-ui, sans-serif',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    editorFontSize: '13px',
  };
}

/** Row tints (Task 2.3). Kept here so light/dark stay in one place. */
export const ROW_TINTS = {
  light: {
    group: 'rgba(241, 245, 249, 1)',
    repeat: 'rgba(238, 242, 255, 1)',
    end: 'rgba(248, 250, 252, 1)',
    /** Split view: target cell empty while the source is filled (Task 5.4). */
    translation: 'rgba(254, 243, 199, 0.55)',
    /** Build Mode staged changes (Task 6.7). */
    inserted: 'rgba(16, 185, 129, 0.16)',
    modifiedCell: 'rgba(245, 158, 11, 0.24)',
    deleted: 'rgba(244, 63, 94, 0.16)',
  },
  dark: {
    group: 'rgba(51, 65, 85, 0.6)',
    repeat: 'rgba(49, 46, 129, 0.45)',
    end: 'rgba(30, 41, 59, 0.45)',
    translation: 'rgba(120, 53, 15, 0.28)',
    inserted: 'rgba(16, 185, 129, 0.22)',
    modifiedCell: 'rgba(245, 158, 11, 0.26)',
    deleted: 'rgba(244, 63, 94, 0.22)',
  },
} as const;

/** Amber cell wash for a modified cell in a staged draft. */
export function stagingCellTheme(dark: boolean): Partial<Theme> {
  const tints = dark ? ROW_TINTS.dark : ROW_TINTS.light;
  return { bgCell: tints.modifiedCell };
}

/** Emerald/rose row wash for inserted/deleted staged rows. */
export function stagingRowTheme(
  theme: Theme,
  dark: boolean,
  kind: 'inserted' | 'deleted',
): Partial<Theme> {
  const tints = dark ? ROW_TINTS.dark : ROW_TINTS.light;
  if (kind === 'inserted') return { bgCell: tints.inserted };
  return {
    bgCell: tints.deleted,
    textDark: dark ? '#fecdd3' : '#9f1239',
    baseFontStyle: `13px ${theme.fontFamily}`,
  };
}
