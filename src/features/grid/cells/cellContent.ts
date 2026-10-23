/** Grid cell construction and edit decoding (Task 2.2). */
import {
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type Theme,
} from '@glideapps/glide-data-grid';

import type { Row, SheetData } from '@/core/model/types';

export interface TextCellOptions {
  readonly?: boolean;
  faded?: boolean;
  align?: 'left' | 'right' | 'center';
  themeOverride?: Partial<Theme>;
}

export function textCell(value: string, options: TextCellOptions = {}): GridCell {
  return {
    kind: GridCellKind.Text,
    data: value,
    displayData: value,
    allowOverlay: options.readonly !== true,
    readonly: options.readonly === true,
    ...(options.faded === true ? { style: 'faded' as const } : {}),
    ...(options.align !== undefined ? { contentAlign: options.align } : {}),
    ...(options.themeOverride !== undefined ? { themeOverride: options.themeOverride } : {}),
  };
}

export function cellValue(sheet: SheetData, rowIndex: number, column: string): string {
  return sheet.rows[rowIndex]?.cells[column] ?? '';
}

export function rowValue(row: Row | undefined, column: string): string {
  return row?.cells[column] ?? '';
}

/** Text content of a Glide edit, used to update the string-based model. */
export function editValueText(value: EditableGridCell): string {
  switch (value.kind) {
    case GridCellKind.Text:
    case GridCellKind.Markdown:
    case GridCellKind.Uri:
      return value.data;
    case GridCellKind.Number:
      return value.data === undefined ? '' : String(value.data);
    case GridCellKind.Boolean:
      if (value.data === true) return 'TRUE';
      if (value.data === false) return 'FALSE';
      return '';
    case GridCellKind.Custom:
      return value.copyData ?? '';
    default:
      return '';
  }
}
