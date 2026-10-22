/**
 * In-memory `WorkbookData` for the reference form. Benchmarks avoid reading
 * `.xlsx` so the measured work is the linter/tokenizer, not ExcelJS.
 */
import type { SheetData, WorkbookData } from '../../src/core/model/types';

import { buildReferenceForm } from './reference';

function sheet(name: string, headers: string[], rows: string[][], prefix: string): SheetData {
  return {
    sheetName: name,
    columns: [...headers],
    rows: rows.map((cells, index) => ({
      id: `${prefix}${index}`,
      cells: Object.fromEntries(
        headers.map((header, column) => [header, cells[column] ?? '']).filter(([, value]) => value),
      ),
    })),
  };
}

export function buildReferenceWorkbookData(): WorkbookData {
  const form = buildReferenceForm();
  return {
    survey: sheet('survey', form.surveyHeaders, form.surveyRows, 's'),
    choices: sheet('choices', form.choicesHeaders, form.choicesRows, 'c'),
    settings: sheet('settings', form.settingsHeaders, form.settingsRows, 't'),
    passthrough: [],
    sheetOrder: ['survey', 'choices', 'settings'],
  };
}
