// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';

import { generateSyntheticFixtures } from '../../../tests/fixtures/generate-fixtures';
import { createEmptyWorkbook } from '../model/factory';
import type { SheetData, WorkbookData } from '../model/types';
import { removeColumn } from '../ops/columns';
import { coerceCell } from './coerce';
import { readWorkbook } from './read';
import { writeWorkbook } from './write';
import { toExcelBuffer } from './io';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const SYNTHETIC_DIR = join(FIXTURES, 'xlsx/synthetic');
const REAL_WORLD_DIR = join(FIXTURES, 'xlsx/real-world');

beforeAll(async () => {
  const exists = await readdir(SYNTHETIC_DIR).then(
    (files) => files.length >= 20,
    () => false,
  );
  if (!exists) await generateSyntheticFixtures();
}, 60_000);

async function corpus(): Promise<Array<{ name: string; path: string }>> {
  const synthetic = (await readdir(SYNTHETIC_DIR))
    .filter((file) => file.endsWith('.xlsx'))
    .map((file) => ({ name: `synthetic/${file}`, path: join(SYNTHETIC_DIR, file) }));
  const realWorld = (await readdir(REAL_WORLD_DIR))
    .filter((file) => file.endsWith('.xlsx'))
    .map((file) => ({ name: `real-world/${file}`, path: join(REAL_WORLD_DIR, file) }));
  return [...synthetic, ...realWorld];
}

function normaliseSheet(sheet: SheetData) {
  return {
    sheetName: sheet.sheetName,
    columns: sheet.columns,
    headerText: sheet.headerText ?? null,
    rows: sheet.rows.map((row) => ({
      cells: Object.fromEntries(Object.entries(row.cells).filter(([, value]) => value !== '')),
      meta: row.meta ?? null,
    })),
  };
}

function normaliseWorkbook(data: WorkbookData) {
  return {
    survey: normaliseSheet(data.survey),
    choices: normaliseSheet(data.choices),
    settings: normaliseSheet(data.settings),
    passthrough: data.passthrough,
    sheetOrder: data.sheetOrder,
  };
}

/** Every sheet, every populated cell, using the same coercion as the editor. */
async function cellMatrix(bytes: Uint8Array): Promise<Map<string, string[][]>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toExcelBuffer(bytes));
  const sheets = new Map<string, string[][]>();
  for (const worksheet of workbook.worksheets) {
    const rows: string[][] = [];
    const byRow = new Map<number, Map<number, string>>();
    let maxColumn = 0;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells = new Map<number, string>();
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        const value = cell.value;
        const text =
          typeof value === 'number' && cell.numFmt
            ? coerceCell(value, { numFmt: cell.numFmt, text: cell.text })
            : coerceCell(value as ExcelJS.CellValue);
        if (text !== '') {
          cells.set(column, text);
          if (column > maxColumn) maxColumn = column;
        }
      });
      if (cells.size > 0) byRow.set(rowNumber, cells);
    });
    const rowNumbers = [...byRow.keys()].sort((a, b) => a - b);
    const maxRow = rowNumbers[rowNumbers.length - 1] ?? 0;
    for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
      const cells = byRow.get(rowNumber);
      const values: string[] = [];
      for (let column = 1; column <= maxColumn; column += 1) {
        values.push(cells?.get(column) ?? '');
      }
      rows.push(values);
    }
    sheets.set(worksheet.name, rows);
  }
  return sheets;
}

describe('round-trip golden suite', () => {
  it('read → write → read deep-equals for every fixture', async () => {
    for (const fixture of await corpus()) {
      const original = await readWorkbook(new Uint8Array(await readFile(fixture.path)));
      const written = await writeWorkbook(original.data, {
        sourceHandle: original.sourceHandle,
      });
      const reread = await readWorkbook(written);
      expect(normaliseWorkbook(reread.data), fixture.name).toEqual(
        normaliseWorkbook(original.data),
      );
    }
  }, 120_000);

  it('keeps every displayed cell value of every sheet', async () => {
    for (const fixture of await corpus()) {
      const bytes = new Uint8Array(await readFile(fixture.path));
      const original = await readWorkbook(bytes);
      const written = await writeWorkbook(original.data, {
        sourceHandle: original.sourceHandle,
      });
      const before = await cellMatrix(bytes);
      const after = await cellMatrix(written);
      for (const [sheet, rows] of before) {
        expect(after.get(sheet), `${fixture.name} / ${sheet}`).toEqual(rows);
      }
      // Sheets defaulted by the reader (missing choices/settings) are created
      // empty: header row only.
      for (const [sheet, rows] of after) {
        if (before.has(sheet)) continue;
        expect(rows, `${fixture.name} / new sheet ${sheet}`).toHaveLength(1);
      }
    }
  }, 120_000);

  it('keeps sheet order and passthrough sheets', async () => {
    const bytes = new Uint8Array(await readFile(join(SYNTHETIC_DIR, '12-external-choices.xlsx')));
    const read = await readWorkbook(bytes);
    const written = await writeWorkbook(read.data, { sourceHandle: read.sourceHandle });
    const reread = await readWorkbook(written);
    expect(reread.data.sheetOrder).toEqual(['survey', 'choices', 'settings', 'external_choices']);
    expect(reread.data.passthrough).toEqual([{ sheetName: 'external_choices' }]);
  });

  it('preserves duplicate and headerless column text instead of writing model keys', async () => {
    const bytes = new Uint8Array(await readFile(join(SYNTHETIC_DIR, '16-duplicate-headers.xlsx')));
    const read = await readWorkbook(bytes);
    expect(read.data.survey.headerText).toEqual({ 'label#2': 'label' });
    const written = await writeWorkbook(read.data, { sourceHandle: read.sourceHandle });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(written));
    const header = workbook.getWorksheet('survey')?.getRow(1);
    expect([1, 2, 3, 4].map((column) => header?.getCell(column).text)).toEqual([
      'type',
      'name',
      'label',
      'label',
    ]);
  });

  it('keeps data in a headerless column in place instead of duplicating it', async () => {
    const bytes = new Uint8Array(await readFile(join(SYNTHETIC_DIR, '21-headerless-column.xlsx')));
    const read = await readWorkbook(bytes);
    expect(read.data.survey.columns).toContain('column_4');
    expect(read.data.survey.headerText).toEqual({ column_4: '' });

    const written = await writeWorkbook(read.data, { sourceHandle: read.sourceHandle });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(written));
    const survey = workbook.getWorksheet('survey');
    expect(survey?.columnCount).toBe(5);
    expect(survey?.getRow(1).getCell(4).text).toBe('');
    expect(survey?.getRow(2).getCell(4).text).toBe('unlabelled note');

    const reread = await readWorkbook(written);
    expect(reread.data.survey.columns).toEqual(read.data.survey.columns);
    expect(normaliseSheet(reread.data.survey)).toEqual(normaliseSheet(read.data.survey));
  });

  it('clears a deleted column so its header and data do not linger', async () => {
    const bytes = new Uint8Array(await readFile(join(SYNTHETIC_DIR, '02-custom-columns.xlsx')));
    const read = await readWorkbook(bytes);
    const data = removeColumn(read.data, 'survey', 'media::image');
    expect(data.survey.columns).not.toContain('media::image');
    expect(data.survey.rows[0]?.cells['media::image']).toBeUndefined();

    const written = await writeWorkbook(data, { sourceHandle: read.sourceHandle });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(written));
    const survey = workbook.getWorksheet('survey');
    const headerTexts = (survey?.getRow(1).values as ExcelJS.CellValue[] | undefined) ?? [];
    expect(headerTexts).not.toContain('media::image');
    expect(survey?.getRow(2).values).not.toContain('images/note.png');

    const reread = await readWorkbook(written);
    expect(reread.data.survey.columns).not.toContain('media::image');
  });
});

describe('round-trip styles', () => {
  it('keeps header styling, widths, frozen panes, and passthrough styling', async () => {
    const bytes = new Uint8Array(await readFile(join(SYNTHETIC_DIR, '13-styled.xlsx')));
    const read = await readWorkbook(bytes);
    const written = await writeWorkbook(read.data, { sourceHandle: read.sourceHandle });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(written));
    const survey = workbook.getWorksheet('survey');
    const docs = workbook.getWorksheet('docs');
    expect(
      (survey?.getRow(1).getCell(1).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb,
    ).toBe('FF1F2937');
    expect(survey?.getColumn(3).width).toBe(42);
    expect(survey?.views?.[0]).toMatchObject({ state: 'frozen', xSplit: 2, ySplit: 1 });
    expect((docs?.getCell('A2').fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).toBe(
      'FFD9EAD3',
    );
    expect(docs?.getColumn(1).width).toBe(50);
    expect(docs?.getCell('A2').text).toBe('This sheet is not managed.');
  });

  it('keeps row styling on managed sheets', async () => {
    const bytes = new Uint8Array(await readFile(join(SYNTHETIC_DIR, '13-styled.xlsx')));
    const read = await readWorkbook(bytes);
    const written = await writeWorkbook(read.data, { sourceHandle: read.sourceHandle });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(written));
    expect(
      (
        workbook.getWorksheet('survey')?.getRow(2).getCell(1).fill as
          ExcelJS.FillPattern | undefined
      )?.fgColor?.argb,
    ).toBe('FFFFF2CC');
  });
});

describe('new workbooks', () => {
  it('writes a fresh, valid workbook that reads back identically', async () => {
    const data = createEmptyWorkbook();
    const bytes = await writeWorkbook(data);
    const reread = await readWorkbook(bytes);
    expect(normaliseWorkbook(reread.data)).toEqual(normaliseWorkbook(data));
  });

  it('uses a bold, frozen header row and readable widths', async () => {
    const bytes = await writeWorkbook(createEmptyWorkbook());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelBuffer(bytes));
    const survey = workbook.getWorksheet('survey');
    expect(survey?.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(survey?.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(survey?.getColumn(1).width).toBeGreaterThanOrEqual(10);
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([
      'survey',
      'choices',
      'settings',
    ]);
  });

  it('writes edited values and clears removed rows', async () => {
    const data = createEmptyWorkbook();
    data.survey.rows.push(
      { id: 'row1', cells: { type: 'text', name: 'q1', label: 'One' } },
      { id: 'row2', cells: { type: 'text', name: 'q2', label: 'Two' } },
      { id: 'row3', cells: { type: 'text', name: 'q3', label: 'Three' } },
    );
    const first = await writeWorkbook(data);
    const reread = await readWorkbook(first);
    expect(reread.data.survey.rows).toHaveLength(3);

    reread.data.survey.rows = reread.data.survey.rows.slice(0, 1);
    reread.data.survey.rows[0]!.cells.label = 'One (edited)';
    const second = await writeWorkbook(reread.data, { sourceHandle: reread.sourceHandle });
    const final = await readWorkbook(second);
    expect(final.data.survey.rows).toHaveLength(1);
    expect(final.data.survey.rows[0]?.cells).toMatchObject({ name: 'q1', label: 'One (edited)' });
  });

  it('appends new columns after existing ones', async () => {
    const data = createEmptyWorkbook();
    data.survey.rows.push({ id: 'row1', cells: { type: 'text', name: 'q1', label: 'One' } });
    const first = await writeWorkbook(data);
    const read = await readWorkbook(first);
    read.data.survey.columns.push('new_custom');
    read.data.survey.rows[0]!.cells.new_custom = 'value';
    const second = await writeWorkbook(read.data, { sourceHandle: read.sourceHandle });
    const reread = await readWorkbook(second);
    expect(reread.data.survey.columns.at(-1)).toBe('new_custom');
    expect(reread.data.survey.rows[0]?.cells.new_custom).toBe('value');
  });
});
