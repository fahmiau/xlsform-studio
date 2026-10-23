/**
 * Display-column projection for the Glide grid (Task 2.2).
 *
 * Glide requires frozen columns to be leftmost, so the display order pulls the
 * configured frozen set to the front. File order is untouched and still governs
 * export (master plan AD-6).
 */
import type { GridColumn } from '@glideapps/glide-data-grid';

import { resolveColumn } from '@/core/model/columns';
import type { ColumnBase } from '@/core/model/columns';
import type { ColumnKey, ManagedSheetName, SheetData } from '@/core/model/types';

export const GUTTER_COLUMN_ID = '__gutter__';

export interface SheetGridConfig {
  sheet: ManagedSheetName;
  /** Canonical bases kept pinned, in this order. */
  frozenBases: readonly ColumnBase[];
  /** Header text is hidden for these columns. */
  defaultWidthByBase?: Partial<Record<ColumnBase, number>>;
  /** Settings has no structural rows or group indent. */
  structural: boolean;
}

export const SURVEY_GRID_CONFIG: SheetGridConfig = {
  sheet: 'survey',
  frozenBases: ['type', 'name', 'label'],
  defaultWidthByBase: { type: 130, name: 150, label: 240, hint: 200, required: 80 },
  structural: true,
};

export const CHOICES_GRID_CONFIG: SheetGridConfig = {
  sheet: 'choices',
  frozenBases: ['list_name', 'name', 'label'],
  defaultWidthByBase: { list_name: 140, name: 150, label: 260 },
  structural: false,
};

export const SETTINGS_GRID_CONFIG: SheetGridConfig = {
  sheet: 'settings',
  frozenBases: [],
  defaultWidthByBase: { form_title: 260, form_id: 180, version: 120 },
  structural: false,
};

const FALLBACK_WIDTH = 160;
const GUTTER_WIDTH = 48;

export interface DisplayColumns {
  /** Data columns in display order, excluding the gutter. */
  keys: ColumnKey[];
  columns: GridColumn[];
  /** Gutter + frozen data columns. */
  frozenCount: number;
  gutterIndex: 0;
}

export interface BuildDisplayColumnsOptions {
  /** Session column widths keyed by header. */
  widths?: Record<ColumnKey, number>;
  /** View-only hidden headers. */
  hidden?: ReadonlySet<ColumnKey>;
  /**
   * Display keys when a language view restricts the sheet (Task 5.4). File
   * order is ignored; the provided order wins.
   */
  keys?: readonly ColumnKey[];
  /** Frozen subset of `keys`, leftmost in this order. */
  frozen?: readonly ColumnKey[];
}

function columnWidth(
  key: ColumnKey,
  base: ColumnBase,
  config: SheetGridConfig,
  widths: Record<ColumnKey, number>,
): number {
  const explicit = widths[key];
  if (explicit !== undefined) return Math.max(50, Math.round(explicit));
  const configured = config.defaultWidthByBase?.[base];
  if (configured !== undefined) return configured;
  return FALLBACK_WIDTH;
}

export function buildDisplayColumns(
  sheet: SheetData,
  config: SheetGridConfig,
  options: BuildDisplayColumnsOptions = {},
): DisplayColumns {
  const widths = options.widths ?? {};
  const hidden = options.hidden ?? new Set<ColumnKey>();
  const available = (options.keys ?? sheet.columns).filter((key) => !hidden.has(key));

  const frozen: ColumnKey[] = [];
  if (options.frozen) {
    for (const key of options.frozen) {
      if (available.includes(key) && !frozen.includes(key)) frozen.push(key);
    }
  } else {
    for (const base of config.frozenBases) {
      const key = available.find(
        (candidate) => resolveColumn(candidate).base === base && !frozen.includes(candidate),
      );
      if (key !== undefined) frozen.push(key);
    }
  }

  const keys = [...frozen, ...available.filter((key) => !frozen.includes(key))];

  const columns: GridColumn[] = [
    {
      id: GUTTER_COLUMN_ID,
      title: '',
      width: GUTTER_WIDTH,
    },
    ...keys.map((key): GridColumn => {
      const resolved = resolveColumn(key);
      return {
        id: key,
        title: sheet.headerText?.[key] ?? key,
        width: columnWidth(key, resolved.base, config, widths),
      };
    }),
  ];

  return { keys, columns, frozenCount: 1 + frozen.length, gutterIndex: 0 };
}

/** Header key for a display column, or `undefined` for the gutter. */
export function columnKeyAt(display: DisplayColumns, columnIndex: number): ColumnKey | undefined {
  if (columnIndex <= 0) return undefined;
  return display.keys[columnIndex - 1];
}
