// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';

import { generateSyntheticFixtures } from '../../../tests/fixtures/generate-fixtures';
import { generateReferenceFixtures } from '../../../tests/fixtures/reference-bytes';
import { WorkbookReadError, readWorkbook, type ReadResult } from './read';

const FIXTURES = join(process.cwd(), 'tests/fixtures');
const SYNTHETIC_DIR = join(FIXTURES, 'xlsx/synthetic');
const REAL_WORLD_DIR = join(FIXTURES, 'xlsx/real-world');

async function readFixture(path: string): Promise<ReadResult> {
  return readWorkbook(new Uint8Array(await readFile(path)));
}

async function readSynthetic(name: string): Promise<ReadResult> {
  return readFixture(join(SYNTHETIC_DIR, name));
}

beforeAll(async () => {
  // The corpus is committed, but regenerate when checked out without binaries.
  const syntheticExists = await readdir(SYNTHETIC_DIR).then(
    (files) => files.length >= 20,
    () => false,
  );
  if (!syntheticExists) await generateSyntheticFixtures();
}, 60_000);

describe('readWorkbook: corpus', () => {
  it('loads every synthetic fixture without throwing', async () => {
    const files = (await readdir(SYNTHETIC_DIR)).filter((file) => file.endsWith('.xlsx'));
    expect(files.length).toBeGreaterThanOrEqual(15);
    for (const file of files) {
      const result = await readSynthetic(file);
      expect(result.sourceHandle, file).toBeInstanceOf(ExcelJS.Workbook);
      expect(result.data.survey.sheetName, file).toBeTruthy();
    }
  });

  it('loads every real-world fixture without throwing', async () => {
    const files = (await readdir(REAL_WORLD_DIR)).filter((file) => file.endsWith('.xlsx'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const result = await readFixture(join(REAL_WORLD_DIR, file));
      expect(result.data.survey.rows.length, file).toBeGreaterThan(0);
    }
  });

  it('keeps sheet order and passthrough tabs', async () => {
    const result = await readSynthetic('12-external-choices.xlsx');
    expect(result.data.sheetOrder).toEqual(['survey', 'choices', 'settings', 'external_choices']);
    expect(result.data.passthrough).toEqual([{ sheetName: 'external_choices' }]);
    expect(result.warnings).toEqual([]);
  });

  it('reports missing choices and settings sheets and creates defaults', async () => {
    const result = await readSynthetic('17-missing-sheets.xlsx');
    expect(result.data.choices.sheetName).toBe('choices');
    expect(result.data.choices.columns).toEqual(['list_name', 'name', 'label']);
    expect(result.data.choices.rows).toEqual([]);
    expect(result.data.settings.columns).toContain('form_title');
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(' ')).toContain('"choices"');
    expect(result.warnings.join(' ')).toContain('"settings"');
  });

  it('renames duplicate headers with a #2 suffix and warns', async () => {
    const result = await readSynthetic('16-duplicate-headers.xlsx');
    expect(result.data.survey.columns).toEqual(['type', 'name', 'label', 'label#2']);
    expect(result.data.survey.rows[0]?.cells['label#2']).toBe('Second label');
    expect(result.warnings.join(' ')).toContain('[duplicate-header]');
  });
});

describe('readWorkbook: headers', () => {
  it('stores custom headers verbatim', async () => {
    const result = await readSynthetic('02-custom-columns.xlsx');
    expect(result.data.survey.columns).toEqual([
      'type',
      'name',
      'label',
      'media::image',
      'bind::esri:fieldType',
      'bind::odk:length',
      'read_only',
      'trigger',
    ]);
    expect(result.data.survey.rows[0]?.cells['bind::odk:length']).toBe('255');
  });

  it('preserves case and whitespace exactly as written', async () => {
    const result = await readSynthetic('05-mixed-case.xlsx');
    expect(result.data.survey.columns).toEqual([' Type ', 'NAME', 'Label', 'ReLeVaNt']);
    expect(result.data.survey.rows[0]?.cells['ReLeVaNt'] ?? '').toBe('');
    expect(result.data.survey.rows[1]?.cells['ReLeVaNt']).toBe('${comments} != ""');
  });

  it('preserves localized headers and their order', async () => {
    const result = await readSynthetic('04-localized.xlsx');
    expect(result.data.survey.columns).toEqual([
      'type',
      'name',
      'label::English (en)',
      'label::Indonesian (id)',
      'hint::English (en)',
      'constraint_message::Indonesian (id)',
    ]);
    expect(result.data.survey.rows[1]?.cells['label::Indonesian (id)']).toBe('Umur');
  });

  it('keeps alias headers verbatim instead of canonicalising them', async () => {
    const result = await readSynthetic('03-aliases.xlsx');
    expect(result.data.survey.columns).toContain('constraint message');
    expect(result.data.survey.columns).toContain('required message');
    expect(result.data.choices.columns).toContain('list name');
  });
});

describe('readWorkbook: cell types', () => {
  it('keeps numeric version and zero-padded codes', async () => {
    const result = await readSynthetic('06-numeric-cells.xlsx');
    expect(result.data.settings.rows).toHaveLength(2);
    expect(result.data.settings.rows[0]?.cells.version).toBe('2024010101');
    expect(result.data.settings.rows[1]?.cells.version).toBe('0007');
  });

  it('renders booleans as TRUE/FALSE', async () => {
    const result = await readSynthetic('07-booleans.xlsx');
    expect(result.data.survey.rows[0]?.cells.required).toBe('TRUE');
    expect(result.data.survey.rows[0]?.cells.read_only).toBe('FALSE');
    expect(result.data.survey.rows[1]?.cells.required).toBe('FALSE');
  });

  it('renders dates as ISO dates independent of the display format', async () => {
    const result = await readSynthetic('08-dates.xlsx');
    expect(result.data.survey.rows[0]?.cells.default).toBe('2024-02-03');
    expect(result.data.survey.rows[1]?.cells.default).toBe('2024-11-12');
  });

  it('concatenates rich text', async () => {
    const result = await readSynthetic('09-rich-text.xlsx');
    expect(result.data.survey.rows[0]?.cells.label).toBe('Bold and italic plain');
    expect(result.data.survey.rows[1]?.cells.hint).toBe('First line\nsecond line');
  });

  it('uses cached formula results', async () => {
    const result = await readSynthetic('10-formulas.xlsx');
    expect(result.data.survey.rows[0]?.cells.default).toBe('3');
  });

  it('keeps unicode text intact', async () => {
    const result = await readSynthetic('20-unicode.xlsx');
    expect(result.data.survey.rows[0]?.cells['label::Arabic (ar)']).toBe('الاسم');
    expect(result.data.survey.rows[1]?.cells['label::English (en)']).toBe('Welcome 🎉');
    expect(result.data.survey.rows[2]?.cells['label::Arabic (ar)']).toHaveLength(500);
  });
});

describe('readWorkbook: rows', () => {
  it('keeps interior blank rows and trims trailing ones', async () => {
    const result = await readSynthetic('11-blank-rows.xlsx');
    expect(result.data.survey.rows).toHaveLength(3);
    expect(result.data.survey.rows[0]?.cells.name).toBe('first');
    expect(result.data.survey.rows[1]?.cells).toEqual({});
    expect(result.data.survey.rows[2]?.cells.name).toBe('third');
  });

  it('handles an empty form', async () => {
    const result = await readSynthetic('19-empty-form.xlsx');
    expect(result.data.survey.rows).toEqual([]);
    expect(result.data.choices.rows).toEqual([]);
    expect(result.data.settings.rows).toEqual([]);
  });

  it('keeps unbalanced group rows as ordinary rows', async () => {
    const result = await readSynthetic('15-unbalanced-groups.xlsx');
    expect(result.data.survey.rows).toHaveLength(10);
    expect(result.data.survey.rows[8]?.cells.type).toBe('begin_group');
  });

  it('assigns unique internal row ids that never come from the file', async () => {
    const result = await readSynthetic('01-basic.xlsx');
    const ids = result.data.survey.rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of result.data.survey.rows) {
      expect(row.cells.id).toBeUndefined();
      expect(row.id).toMatch(/^[0-9a-z]{12}$/);
    }
  });
});

describe('readWorkbook: errors', () => {
  it('rejects a workbook without a survey sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('choices').addRow(['list_name', 'name', 'label']);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    await expect(readWorkbook(bytes)).rejects.toBeInstanceOf(WorkbookReadError);
    await expect(readWorkbook(bytes)).rejects.toMatchObject({ code: 'missing-survey' });
  });

  it('rejects bytes that are not a workbook', async () => {
    await expect(readWorkbook(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({
      code: 'invalid-workbook',
    });
  });

  it('can be generated fresh from the reference builder', async () => {
    const bytes = await generateReferenceFixtures();
    const result = await readWorkbook(bytes);
    expect(result.data.survey.rows.length).toBeGreaterThan(1900);
    expect(result.data.choices.rows).toHaveLength(5000);
    expect(result.warnings).toEqual([]);
  }, 60_000);
});
