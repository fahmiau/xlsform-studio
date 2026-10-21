/**
 * Builds the synthetic fixture corpus for `.xlsx` read/write tests.
 *
 * Run with `pnpm fixtures` (which also writes the reference form). Every file
 * lands in tests/fixtures/xlsx/synthetic/ and is described in README.md next to
 * it. Keep this deterministic: no timestamps, no random data.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';

const here = dirname(fileURLToPath(import.meta.url));
const syntheticDir = join(here, 'xlsx', 'synthetic');

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleHeader(sheet: ExcelJS.Worksheet, columnCount: number) {
  const header = sheet.getRow(1);
  for (let index = 1; index <= columnCount; index += 1) {
    const cell = header.getCell(index);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: ExcelJS.CellValue[][],
) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  styleHeader(sheet, headers.length);
  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = Math.max(12, header.length + 4);
  });
  return sheet;
}

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'xlsform-studio fixtures';
  workbook.created = new Date(Date.UTC(2026, 0, 1));
  workbook.modified = new Date(Date.UTC(2026, 0, 1));
  return workbook;
}

const STANDARD_SURVEY_HEADERS = ['type', 'name', 'label', 'hint', 'required', 'relevant'];
const STANDARD_CHOICES_HEADERS = ['list_name', 'name', 'label'];
const STANDARD_SETTINGS_HEADERS = ['form_title', 'form_id', 'version'];

async function write(name: string, workbook: ExcelJS.Workbook) {
  const path = join(syntheticDir, name);
  await workbook.xlsx.writeFile(path);
  return path;
}

export async function generateSyntheticFixtures() {
  await mkdir(syntheticDir, { recursive: true });

  // 01 — minimal, well-formed XLSForm.
  {
    const workbook = newWorkbook();
    addSheet(workbook, 'survey', STANDARD_SURVEY_HEADERS, [
      ['text', 'respondent_name', 'Respondent name', '', '', ''],
      ['integer', 'respondent_age', 'Age', 'In years', 'yes', ''],
      ['select_one yes_no', 'consent', 'Consent given?', '', 'yes', ''],
    ]);
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, [
      ['yes_no', 'yes', 'Yes'],
      ['yes_no', 'no', 'No'],
    ]);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [
      ['Household survey', 'household_survey', '2024010101'],
    ]);
    await write('01-basic.xlsx', workbook);
  }

  // 02 — custom / bind columns that must survive a round trip.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      [
        'type',
        'name',
        'label',
        'media::image',
        'bind::esri:fieldType',
        'bind::odk:length',
        'read_only',
        'trigger',
      ],
      [
        [
          'text',
          'photo_note',
          'Photo note',
          'images/note.png',
          'esriFieldTypeString',
          '255',
          '',
          '',
        ],
        ['select_one crops', 'main_crop', 'Main crop', '', '', '', 'yes', '${respondent_name}'],
      ],
    );
    addSheet(
      workbook,
      'choices',
      ['list_name', 'name', 'label', 'image', 'filter'],
      [
        ['crops', 'maize', 'Maize', 'crops/maize.png', ''],
        ['crops', 'rice', 'Rice', 'crops/rice.png', ''],
      ],
    );
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [
      ['Custom columns', 'custom_columns', '1'],
    ]);
    await write('02-custom-columns.xlsx', workbook);
  }

  // 03 — pyxform aliases and human-friendly header spellings.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label', 'constraint message', 'required message', 'appearance'],
      [
        [
          'select one gender',
          'gender',
          'Gender',
          'Pick a value',
          'Gender is required',
          'horizontal',
        ],
        ['select all that apply reason', 'reasons', 'Reasons', '', '', 'minimal'],
        ['integer', 'years', 'Years lived here', 'Must be positive', '', ''],
      ],
    );
    addSheet(
      workbook,
      'choices',
      ['list name', 'name', 'label', 'image'],
      [
        ['gender', 'female', 'Female', 'gender/f.png'],
        ['gender', 'male', 'Male', 'gender/m.png'],
        ['reason', 'work', 'Work', ''],
      ],
    );
    addSheet(
      workbook,
      'settings',
      ['form title', 'form id', 'version'],
      [['Alias headers', 'alias_headers', '3']],
    );
    await write('03-aliases.xlsx', workbook);
  }

  // 04 — localized headers.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      [
        'type',
        'name',
        'label::English (en)',
        'label::Indonesian (id)',
        'hint::English (en)',
        'constraint_message::Indonesian (id)',
      ],
      [
        ['text', 'full_name', 'Full name', 'Nama lengkap', 'As on ID card', 'Wajib diisi'],
        ['integer', 'age', 'Age', 'Umur', '', ''],
      ],
    );
    addSheet(
      workbook,
      'choices',
      ['list_name', 'name', 'label::English (en)', 'label::Indonesian (id)'],
      [
        ['yes_no', 'yes', 'Yes', 'Ya'],
        ['yes_no', 'no', 'No', 'Tidak'],
      ],
    );
    addSheet(
      workbook,
      'settings',
      ['form_title', 'form_id', 'default_language'],
      [['Localized form', 'localized_form', 'English (en)']],
    );
    await write('04-localized.xlsx', workbook);
  }

  // 05 — mixed header case and stray whitespace.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      [' Type ', 'NAME', 'Label', 'ReLeVaNt'],
      [
        ['text', 'comments', 'Comments', ''],
        ['integer', 'score', 'Score', '${comments} != ""'],
      ],
    );
    addSheet(
      workbook,
      'choices',
      ['List_Name', 'Name', 'LABEL'],
      [
        ['answers', 'one', 'One'],
        ['answers', 'two', 'Two'],
      ],
    );
    addSheet(
      workbook,
      'settings',
      ['FORM_TITLE', 'Form_Id', 'VERSION'],
      [['Mixed case', 'mixed_case', '1']],
    );
    await write('05-mixed-case.xlsx', workbook);
  }

  // 06 — numeric version with a zero-padded display format.
  {
    const workbook = newWorkbook();
    addSheet(workbook, 'survey', STANDARD_SURVEY_HEADERS, [
      ['text', 'q1', 'Question one', '', '', ''],
    ]);
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    const settings = addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, []);
    const row = settings.addRow(['Numeric version', 'numeric_version', 2024010101]);
    row.getCell(3).numFmt = '0';
    const padded = settings.addRow(['', '', 7]);
    padded.getCell(3).numFmt = '0000';
    await write('06-numeric-cells.xlsx', workbook);
  }

  // 07 — booleans for required and friends.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label', 'required', 'read_only'],
      [
        ['text', 'q_true', 'TRUE required', true, false],
        ['text', 'q_false', 'FALSE required', false, true],
      ],
    );
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Booleans', 'booleans', '1']]);
    await write('07-booleans.xlsx', workbook);
  }

  // 08 — date cells, including a date where the month/day are ambiguous.
  {
    const workbook = newWorkbook();
    const survey = addSheet(workbook, 'survey', ['type', 'name', 'label', 'default'], []);
    const row = survey.addRow([
      'date',
      'interview_date',
      'Interview date',
      new Date(Date.UTC(2024, 1, 3)),
    ]);
    row.getCell(4).numFmt = 'yyyy-mm-dd';
    const row2 = survey.addRow([
      'date',
      'check_date',
      'Check date',
      new Date(Date.UTC(2024, 10, 12)),
    ]);
    row2.getCell(4).numFmt = 'dd/mm/yyyy';
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Dates', 'dates', '1']]);
    await write('08-dates.xlsx', workbook);
  }

  // 09 — rich text labels.
  {
    const workbook = newWorkbook();
    const survey = addSheet(workbook, 'survey', ['type', 'name', 'label', 'hint'], []);
    const row = survey.addRow(['text', 'rich_q', '', '']);
    row.getCell(3).value = {
      richText: [
        { font: { bold: true }, text: 'Bold' },
        { font: { italic: true }, text: ' and italic' },
        { text: ' plain' },
      ],
    };
    const hint = survey.addRow(['note', 'rich_note', 'Note', '']);
    hint.getCell(4).value = {
      richText: [
        { text: 'First line\n' },
        { font: { color: { argb: 'FFFF0000' } }, text: 'second line' },
      ],
    };
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Rich text', 'rich_text', '1']]);
    await write('09-rich-text.xlsx', workbook);
  }

  // 10 — formulas on managed and passthrough sheets (cached results only).
  {
    const workbook = newWorkbook();
    const survey = addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label', 'default'],
      [['integer', 'total', 'Total', '']],
    );
    survey.getCell('D2').value = { formula: 'SUM(1,2)', result: 3 };
    const extra = workbook.addWorksheet('calculations');
    extra.addRow(['a', 'b', 'sum']);
    extra.addRow([1, 2, { formula: 'A2+B2', result: 3 }]);
    extra.addRow([4, 5, { formula: 'SUM(A3:B3)', result: 9 }]);
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Formulas', 'formulas', '1']]);
    await write('10-formulas.xlsx', workbook);
  }

  // 11 — interior blank rows are kept, trailing blanks are trimmed.
  {
    const workbook = newWorkbook();
    const survey = addSheet(workbook, 'survey', STANDARD_SURVEY_HEADERS, [
      ['text', 'first', 'First', '', '', ''],
      [],
      ['text', 'third', 'Third', '', '', ''],
      [],
      [],
      [],
    ]);
    survey.getRow(4).commit();
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Blank rows', 'blank_rows', '1']]);
    await write('11-blank-rows.xlsx', workbook);
  }

  // 12 — external_choices sheet and select_one_from_file.
  {
    const workbook = newWorkbook();
    addSheet(workbook, 'survey', STANDARD_SURVEY_HEADERS, [
      ['select_one_from_file species.csv', 'species', 'Species', '', '', ''],
      ['text', 'notes', 'Notes', '', '', ''],
    ]);
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [
      ['External choices', 'external_choices', '1'],
    ]);
    addSheet(
      workbook,
      'external_choices',
      ['list_name', 'name', 'label'],
      [
        ['species', 'dog', 'Dog'],
        ['species', 'cat', 'Cat'],
      ],
    );
    await write('12-external-choices.xlsx', workbook);
  }

  // 13 — styling that must survive on passthrough sheets and headers.
  {
    const workbook = newWorkbook();
    const survey = addSheet(workbook, 'survey', STANDARD_SURVEY_HEADERS, [
      ['text', 'styled', 'Styled row', '', '', ''],
    ]);
    const styledRow = survey.getRow(2);
    styledRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF2CC' },
    };
    styledRow.getCell(1).font = { bold: true, color: { argb: 'FF7F6000' } };
    survey.getColumn(3).width = 42;
    survey.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
    const extra = workbook.addWorksheet('docs');
    extra.addRow(['Notes']);
    extra.getRow(1).font = { bold: true, size: 14 };
    extra.getCell('A2').value = 'This sheet is not managed.';
    extra.getCell('A2').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EAD3' },
    };
    extra.getColumn(1).width = 50;
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Styled', 'styled', '1']]);
    await write('13-styled.xlsx', workbook);
  }

  // 14 — or_other variants.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label', 'choice_filter'],
      [
        ['select_one yes_no or_other', 'has_id', 'Has ID?', ''],
        ['select_multiple languages or_other', 'languages', 'Languages', ''],
        ['select_one region', 'region', 'Region', 'country = ${country}'],
      ],
    );
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, [
      ['yes_no', 'yes', 'Yes'],
      ['yes_no', 'no', 'No'],
      ['languages', 'en', 'English'],
      ['region', 'north', 'North'],
    ]);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Or other', 'or_other', '1']]);
    await write('14-or-other.xlsx', workbook);
  }

  // 15 — unbalanced and mismatched group tags.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label'],
      [
        ['begin_group', 'outer', 'Outer'],
        ['text', 'inside', 'Inside'],
        ['begin_repeat', 'members', 'Members'],
        ['text', 'member_name', 'Member name'],
        ['end_group', '', ''],
        ['end_repeat', '', ''],
        ['text', 'orphan_end', 'After groups'],
        ['end_repeat', '', ''],
        ['begin_group', 'unclosed', 'Unclosed'],
        ['text', 'after_unclosed', 'After unclosed'],
      ],
    );
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Unbalanced', 'unbalanced', '1']]);
    await write('15-unbalanced-groups.xlsx', workbook);
  }

  // 16 — duplicate header names.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label', 'label'],
      [['text', 'dup', 'First label', 'Second label']],
    );
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, [['Duplicates', 'duplicates', '1']]);
    await write('16-duplicate-headers.xlsx', workbook);
  }

  // 17 — no choices/settings sheets at all.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label'],
      [['text', 'only_question', 'Only question']],
    );
    await write('17-missing-sheets.xlsx', workbook);
  }

  // 18 — settings row with custom keys and an empty managed sheet.
  {
    const workbook = newWorkbook();
    addSheet(workbook, 'survey', STANDARD_SURVEY_HEADERS, []);
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(
      workbook,
      'settings',
      ['form_title', 'form_id', 'version', 'allow_choice_duplicates', 'custom_key'],
      [['Settings only', 'settings_only', '1', 'yes', 'custom value']],
    );
    await write('18-settings-custom.xlsx', workbook);
  }

  // 19 — headers only, no data rows at all.
  {
    const workbook = newWorkbook();
    addSheet(workbook, 'survey', STANDARD_SURVEY_HEADERS, []);
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, []);
    addSheet(workbook, 'settings', STANDARD_SETTINGS_HEADERS, []);
    await write('19-empty-form.xlsx', workbook);
  }

  // 20 — unicode, RTL, emoji, and long text.
  {
    const workbook = newWorkbook();
    addSheet(
      workbook,
      'survey',
      ['type', 'name', 'label::English (en)', 'label::Arabic (ar)'],
      [
        ['text', 'name_ar', 'Name', 'الاسم'],
        ['note', 'welcome', 'Welcome 🎉', 'مرحبا 🎉'],
        ['text', 'long_text', 'Long', 'x'.repeat(500)],
      ],
    );
    addSheet(workbook, 'choices', STANDARD_CHOICES_HEADERS, [
      ['yes_no', 'نعم', 'Yes نعم'],
      ['yes_no', 'no', 'No'],
    ]);
    addSheet(
      workbook,
      'settings',
      ['form_title', 'form_id', 'default_language'],
      [['نموذج', 'unicode_form', 'Arabic (ar)']],
    );
    await write('20-unicode.xlsx', workbook);
  }
}
