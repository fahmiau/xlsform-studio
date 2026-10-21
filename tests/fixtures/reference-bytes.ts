import ExcelJS from 'exceljs';

import { buildReferenceForm } from './reference';

/** Builds the 2k-row reference workbook in memory for tests and benches. */
export async function generateReferenceFixtures(): Promise<Uint8Array> {
  const form = buildReferenceForm();
  const workbook = new ExcelJS.Workbook();
  const add = (name: string, headers: string[], rows: string[][]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(headers);
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };
  add('survey', form.surveyHeaders, form.surveyRows);
  add('choices', form.choicesHeaders, form.choicesRows);
  add('settings', form.settingsHeaders, form.settingsRows);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
