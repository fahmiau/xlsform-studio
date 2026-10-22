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
import { AppearanceEditor } from './AppearanceEditor';
import { ChoiceNameEditor } from './ChoiceNameEditor';
import { TypeEditor } from './TypeEditor';

export function useEditorRouting(): ProvideEditorCallback<GridCell> {
  return useCallback((cell: GridCell) => {
    if (cell.kind !== GridCellKind.Custom) return undefined;
    const kind = (cell.data as { kind?: string }).kind;
    if (kind === ENUM_CELL_KIND) {
      const data = (cell as EnumCell).data;
      return {
        editor: (data.column === 'type'
          ? TypeEditor
          : AppearanceEditor) as unknown as ProvideEditorComponent<GridCell>,
        disablePadding: true,
        styleOverride: { minWidth: data.column === 'type' ? 340 : 320 },
      };
    }
    if (kind === CHOICE_NAME_CELL_KIND) {
      return {
        editor: ChoiceNameEditor as unknown as ProvideEditorComponent<GridCell>,
        disablePadding: true,
        styleOverride: { minWidth: 180 },
      };
    }
    return undefined;
  }, []);
}
