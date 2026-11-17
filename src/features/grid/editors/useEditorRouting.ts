/** Maps custom grid cells to their overlay editors (Task 3.1). */
import { useCallback } from 'react';
import {
  GridCellKind,
  type GridCell,
  type ProvideEditorCallback,
  type ProvideEditorComponent,
} from '@glideapps/glide-data-grid';

import { CHOICE_NAME_CELL_KIND } from '../cells/ChoiceNameCell';
import { ENUM_CELL_KIND, type EnumCell } from '../cells/EnumCell';
import { XPATH_CELL_KIND } from '../cells/XPathCell';
import { AppearanceEditor } from './AppearanceEditor';
import { CellFormulaEditor } from './CellFormulaEditor';
import { ChoiceNameEditor } from './ChoiceNameEditor';
import { FilterValueEditor } from './FilterValueEditor';
import { TextCellEditor } from './TextCellEditor';
import { TypeEditor } from './TypeEditor';

export function useEditorRouting(): ProvideEditorCallback<GridCell> {
  return useCallback((cell: GridCell) => {
    if (cell.kind === GridCellKind.Text) {
      if (cell.readonly) return undefined;
      return {
        editor: TextCellEditor as unknown as ProvideEditorComponent<GridCell>,
        disablePadding: true,
      };
    }
    if (cell.kind !== GridCellKind.Custom) return undefined;
    const kind = (cell.data as { kind?: string }).kind;
    if (kind === ENUM_CELL_KIND) {
      const data = (cell as EnumCell).data;
      const editor =
        data.column === 'type'
          ? TypeEditor
          : data.column === 'filter'
            ? FilterValueEditor
            : AppearanceEditor;
      const minWidth = data.column === 'type' ? 340 : data.column === 'filter' ? 280 : 320;
      return {
        editor: editor as unknown as ProvideEditorComponent<GridCell>,
        disablePadding: true,
        styleOverride: { minWidth },
      };
    }
    if (kind === CHOICE_NAME_CELL_KIND) {
      return {
        editor: ChoiceNameEditor as unknown as ProvideEditorComponent<GridCell>,
        disablePadding: true,
        styleOverride: { minWidth: 180 },
      };
    }
    if (kind === XPATH_CELL_KIND) {
      return {
        editor: CellFormulaEditor as unknown as ProvideEditorComponent<GridCell>,
        disablePadding: true,
        styleOverride: { minWidth: 420, minHeight: 96 },
      };
    }
    return undefined;
  }, []);
}
