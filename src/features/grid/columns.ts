/**
 * Display-column projection for the Glide grid (Task 2.2).
 *
 * Glide requires frozen columns to be leftmost, so the display order pulls the
 * configured frozen set to the front. File order is untouched and still governs
 * export (master plan AD-6). A session-only `order` (Category C4) reorders the
 * display keys only; hidden/new columns fall back to file order.
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
   * Session display order (Category C4). Keys missing from it keep file order
   * after the listed ones (hidden columns that are shown again, new columns).
   */
  order?: readonly ColumnKey[];
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

/** Apply the session order, then append keys it does not mention in file order. */
function applyOrder(
  columns: readonly ColumnKey[],
  order: readonly ColumnKey[] | undefined,
): ColumnKey[] {
  if (!order || order.length === 0) return [...columns];
  const present = new Set(columns);
  const listed = new Set<ColumnKey>();
  for (const key of order) {
    if (present.has(key)) listed.add(key);
  }
  return [...listed, ...columns.filter((key) => !listed.has(key))];
}

export function buildDisplayColumns(
  sheet: SheetData,
  config: SheetGridConfig,
  options: BuildDisplayColumnsOptions = {},
): DisplayColumns {
  const widths = options.widths ?? {};
  const hidden = options.hidden ?? new Set<ColumnKey>();
  const available = applyOrder(options.keys ?? sheet.columns, options.order).filter(
    (key) => !hidden.has(key),
  );

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

  // A session order may move columns inside the frozen block (e.g. name before
  // type) but never past it; keys the order omits keep the config order.
  if (options.order) {
    const position = new Map(options.order.map((key, index) => [key, index]));
    const at = (key: ColumnKey) => position.get(key) ?? Number.MAX_SAFE_INTEGER;
    frozen.sort((a, b) => at(a) - at(b));
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

/**
 * Display keys after dropping `startIndex` onto `endIndex` (both include the
 * gutter, matching Glide's `onColumnMoved`). Returns `undefined` when the move
 * touches the gutter or crosses the frozen/scrollable boundary; the frozen set
 * and its leftmost position never change.
 */
export function moveDisplayColumn(
  display: Pick<DisplayColumns, 'keys' | 'frozenCount'>,
  startIndex: number,
  endIndex: number,
): ColumnKey[] | undefined {
  const { keys } = display;
  if (startIndex <= 0 || endIndex <= 0) return undefined;
  if (startIndex > keys.length || endIndex > keys.length) return undefined;
  if (startIndex === endIndex) return undefined;

  const frozenKeys = display.frozenCount - 1;
  const startFrozen = startIndex - 1 < frozenKeys;
  const endFrozen = endIndex - 1 < frozenKeys;
  if (startFrozen !== endFrozen) return undefined;

  const next = [...keys];
  const [moved] = next.splice(startIndex - 1, 1);
  if (moved === undefined) return undefined;
  next.splice(endIndex - 1, 0, moved);
  return next;
}
