/**
 * Reference form used by benchmarks and performance tests (master plan §5):
 * 2,000 survey rows x 40 columns (3 languages), 40 nested groups/repeats up to
 * depth 5, 300 choice lists / 5,000 choices, and ~1,500 XPath expressions.
 *
 * The workbook is generated on demand instead of committed: it keeps the repo
 * small and guarantees the shape stays in sync with the generator.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';

export const REFERENCE_ROW_COUNT = 2000;
export const REFERENCE_LIST_COUNT = 300;
export const REFERENCE_CHOICE_COUNT = 5000;

export const REFERENCE_SURVEY_HEADERS = [
  'type',
  'name',
  'label::English (en)',
  'label::Indonesian (id)',
  'label::French (fr)',
  'label::Spanish (es)',
  'hint::English (en)',
  'hint::Indonesian (id)',
  'hint::French (fr)',
  'hint::Spanish (es)',
  'constraint_message::English (en)',
  'constraint_message::Indonesian (id)',
  'constraint_message::French (fr)',
  'constraint_message::Spanish (es)',
  'required',
  'relevant',
  'constraint',
  'calculation',
  'appearance',
  'default',
  'choice_filter',
  'repeat_count',
  'trigger',
  'read_only',
  'parameter',
  'note',
  'media::image',
  'media::audio',
  'media::video',
  'bind::esri:fieldType',
  'bind::esri:fieldTypeNull',
  'bind::odk:length',
  'bind::odk:requiredMessage',
  'bind::odk:constraintMessage',
  'bind::odk:readonly',
  'body::accuracyThreshold',
  'body::intent',
  'custom_1',
  'custom_2',
  'custom_3',
] as const;

export const REFERENCE_CHOICES_HEADERS = [
  'list_name',
  'name',
  'label::English (en)',
  'label::Indonesian (id)',
  'label::French (fr)',
  'list_name_filter',
] as const;

export const REFERENCE_SETTINGS_HEADERS = [
  'form_title',
  'form_id',
  'version',
  'default_language',
  'instance_name',
] as const;

const QUESTION_TYPES = [
  'text',
  'integer',
  'decimal',
  'date',
  'select_one',
  'select_multiple',
  'geopoint',
  'note',
  'calculate',
  'time',
] as const;

function listName(index: number) {
  return `list_${(index % REFERENCE_LIST_COUNT) + 1}`;
}

function variableName(index: number) {
  return `q_${index + 1}`;
}

export interface ReferenceForm {
  surveyHeaders: string[];
  surveyRows: string[][];
  choicesHeaders: string[];
  choicesRows: string[][];
  settingsHeaders: string[];
  settingsRows: string[][];
}

export function buildReferenceForm(): ReferenceForm {
  const surveyRows: string[][] = [];
  const groupStack: Array<{ name: string; kind: 'group' | 'repeat' }> = [];
  let questionCount = 0;

  for (let rowIndex = 0; rowIndex < REFERENCE_ROW_COUNT; rowIndex += 1) {
    const row = new Array<string>(REFERENCE_SURVEY_HEADERS.length).fill('');
    const position = rowIndex % 40;
    const depthTarget = Math.min(5, 1 + ((rowIndex / 40) % 5));

    if (position === 0 && groupStack.length < depthTarget && groupStack.length < 5) {
      const kind = groupStack.length % 3 === 2 ? 'repeat' : 'group';
      const name = `grp_${Math.floor(rowIndex / 40)}_${groupStack.length}`;
      groupStack.push({ name, kind });
      row[0] = `begin_${kind}`;
      row[1] = name;
      row[2] = `Group ${name}`;
      row[3] = `Grup ${name}`;
      row[4] = `Groupe ${name}`;
      surveyRows.push(row);
      continue;
    }

    if (position === 39 && groupStack.length > 0) {
      const innermost = groupStack.pop();
      row[0] = `end_${innermost?.kind ?? 'group'}`;
      surveyRows.push(row);
      continue;
    }

    // Close deeper groups when the target depth shrinks.
    if (position === 20 && groupStack.length > depthTarget) {
      const innermost = groupStack.pop();
      row[0] = `end_${innermost?.kind ?? 'group'}`;
      surveyRows.push(row);
      continue;
    }

    questionCount += 1;
    const type = QUESTION_TYPES[questionCount % QUESTION_TYPES.length] ?? 'text';
    row[0] =
      type === 'select_one' || type === 'select_multiple'
        ? `${type} ${listName(questionCount)}`
        : type;
    row[1] = variableName(questionCount);
    row[2] = `Question ${questionCount} (English)`;
    row[3] = `Pertanyaan ${questionCount} (Indonesian)`;
    row[4] = `Question ${questionCount} (French)`;
    row[5] = `Pregunta ${questionCount} (Spanish)`;
    row[6] = questionCount % 5 === 0 ? `Hint ${questionCount}` : '';
    row[7] = questionCount % 7 === 0 ? `Petunjuk ${questionCount}` : '';
    row[8] = '';
    row[9] = '';
    row[10] = questionCount % 6 === 0 ? 'Value is required' : '';
    row[11] = questionCount % 9 === 0 ? 'Nilai wajib diisi' : '';
    row[12] = '';
    row[13] = '';
    row[14] = questionCount % 4 === 0 ? 'yes' : '';
    row[15] =
      questionCount % 3 === 0 ? `\${${variableName(Math.max(0, questionCount - 2))}} != ''` : '';
    row[16] = questionCount % 5 === 0 ? `. >= 0 and . <= 120` : '';
    row[17] =
      type === 'calculate'
        ? `coalesce(\${${variableName(Math.max(0, questionCount - 3))}}, 0) + 1`
        : '';
    row[18] = questionCount % 11 === 0 ? 'horizontal-compact' : '';
    row[19] = '';
    row[20] = '';
    row[21] = '';
    row[22] = questionCount % 13 === 0 ? `\${${variableName(Math.max(0, questionCount - 5))}}` : '';
    row[23] = '';
    row[24] = '';
    row[25] = '';
    row[26] = questionCount % 17 === 0 ? `images/q${questionCount}.png` : '';
    row[27] = '';
    row[28] = '';
    row[29] = type === 'select_one' ? 'esriFieldTypeString' : '';
    row[30] = '';
    row[31] = type === 'text' ? '255' : '';
    row[32] = '';
    row[33] = '';
    row[34] = '';
    row[35] = '';
    row[36] = '';
    row[37] = `custom ${questionCount}`;
    row[38] = '';
    row[39] = '';
    surveyRows.push(row);
  }

  while (groupStack.length > 0) {
    const innermost = groupStack.pop();
    const row = new Array<string>(REFERENCE_SURVEY_HEADERS.length).fill('');
    row[0] = `end_${innermost?.kind ?? 'group'}`;
    surveyRows.push(row);
  }

  const choicesRows: string[][] = [];
  const perList = Math.floor(REFERENCE_CHOICE_COUNT / REFERENCE_LIST_COUNT);
  for (let listIndex = 0; listIndex < REFERENCE_LIST_COUNT; listIndex += 1) {
    const name = `list_${listIndex + 1}`;
    for (let choiceIndex = 0; choiceIndex < perList; choiceIndex += 1) {
      choicesRows.push([
        name,
        `choice_${choiceIndex + 1}`,
        `Choice ${choiceIndex + 1} (English)`,
        `Pilihan ${choiceIndex + 1}`,
        `Choix ${choiceIndex + 1}`,
        choiceIndex % 4 === 0 ? 'parent_list' : '',
      ]);
    }
  }
  // Top the corpus up to exactly 5,000 choices; the first lists get one extra.
  let extra = REFERENCE_CHOICE_COUNT - choicesRows.length;
  let listIndex = 0;
  while (extra > 0) {
    const name = `list_${(listIndex % REFERENCE_LIST_COUNT) + 1}`;
    const choiceIndex = perList + Math.floor(listIndex / REFERENCE_LIST_COUNT) + 1;
    choicesRows.push([
      name,
      `choice_${choiceIndex}`,
      `Choice ${choiceIndex} (English)`,
      `Pilihan ${choiceIndex}`,
      `Choix ${choiceIndex}`,
      '',
    ]);
    extra -= 1;
    listIndex += 1;
  }

  return {
    surveyHeaders: [...REFERENCE_SURVEY_HEADERS],
    surveyRows,
    choicesHeaders: [...REFERENCE_CHOICES_HEADERS],
    choicesRows,
    settingsHeaders: [...REFERENCE_SETTINGS_HEADERS],
    settingsRows: [['Reference form', 'reference_form', '2024010101', 'English (en)', '${q_1}']],
  };
}

export async function writeReferenceWorkbook(path: string): Promise<string> {
  const form = buildReferenceForm();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'xlsform-studio reference generator';
  workbook.created = new Date(Date.UTC(2026, 0, 1));
  workbook.modified = new Date(Date.UTC(2026, 0, 1));

  const add = (name: string, headers: string[], rows: string[][]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(row);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };

  add('survey', form.surveyHeaders, form.surveyRows);
  add('choices', form.choicesHeaders, form.choicesRows);
  add('settings', form.settingsHeaders, form.settingsRows);

  await mkdir(dirname(path), { recursive: true });
  await workbook.xlsx.writeFile(path);
  return path;
}

const here = dirname(fileURLToPath(import.meta.url));

export function referenceWorkbookPath() {
  return process.env.XLSFORM_REFERENCE_PATH ?? join(here, 'generated', 'reference-form.xlsx');
}

/** Generates the reference workbook unless a cached copy with the same shape exists. */
export async function ensureReferenceWorkbook(): Promise<string> {
  const path = referenceWorkbookPath();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([REFERENCE_ROW_COUNT, REFERENCE_LIST_COUNT, REFERENCE_CHOICE_COUNT]))
    .digest('hex')
    .slice(0, 16);
  const stampPath = `${path}.sha256`;
  try {
    const stamp = await readFile(stampPath, 'utf8');
    if (stamp.trim() === fingerprint) {
      return path;
    }
  } catch {
    // No cached copy yet.
  }
  await writeReferenceWorkbook(path);
  await writeFile(stampPath, fingerprint, 'utf8');
  return path;
}
