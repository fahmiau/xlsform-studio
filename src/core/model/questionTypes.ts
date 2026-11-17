/**
 * XLSForm question type catalog (PRD §4.2) with the metadata the linter and
 * factory need later.
 */

export type QuestionCategory = 'structural' | 'metadata' | 'input' | 'select';

export interface QuestionType {
  /** Base type token, e.g. `select_one` or `begin_group`. */
  name: string;
  category: QuestionCategory;
  /** A visible question needs a label (XLS-010). */
  hasLabel: boolean;
  /** The row declares a variable and needs a `name` (XLS-001). */
  requiresName: boolean;
  /** Rendered to the respondent (affects label checks and grid styling). */
  isVisible: boolean;
}

const STRUCTURAL = ['begin_group', 'end_group', 'begin_repeat', 'end_repeat'] as const;
const SELECTS = ['select_one', 'select_multiple', 'select_one_from_file', 'rank'] as const;
const METADATA = [
  'start',
  'end',
  'today',
  'deviceid',
  'phonenumber',
  'username',
  'email',
  'audit',
  'calculate',
  'hidden',
] as const;

function entry(
  name: string,
  category: QuestionCategory,
  flags: Pick<QuestionType, 'hasLabel' | 'requiresName' | 'isVisible'>,
): QuestionType {
  return { name, category, ...flags };
}

export const QUESTION_TYPES: readonly QuestionType[] = [
  entry('integer', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('decimal', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('range', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('text', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('select_one', 'select', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('select_multiple', 'select', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('select_one_from_file', 'select', {
    hasLabel: true,
    requiresName: true,
    isVisible: true,
  }),
  entry('rank', 'select', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('note', 'input', { hasLabel: true, requiresName: false, isVisible: true }),
  entry('geopoint', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('geotrace', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('geoshape', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('date', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('time', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('dateTime', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('image', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('audio', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('video', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('file', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('barcode', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('acknowledge', 'input', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('calculate', 'metadata', { hasLabel: false, requiresName: true, isVisible: false }),
  entry('hidden', 'metadata', { hasLabel: false, requiresName: true, isVisible: false }),
  entry('begin_group', 'structural', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('end_group', 'structural', { hasLabel: false, requiresName: false, isVisible: false }),
  entry('begin_repeat', 'structural', { hasLabel: true, requiresName: true, isVisible: true }),
  entry('end_repeat', 'structural', { hasLabel: false, requiresName: false, isVisible: false }),
  entry('start', 'metadata', { hasLabel: false, requiresName: false, isVisible: false }),
  entry('end', 'metadata', { hasLabel: false, requiresName: false, isVisible: false }),
  entry('today', 'metadata', { hasLabel: false, requiresName: true, isVisible: false }),
  entry('deviceid', 'metadata', { hasLabel: false, requiresName: true, isVisible: false }),
  entry('phonenumber', 'metadata', { hasLabel: false, requiresName: true, isVisible: false }),
  entry('username', 'metadata', { hasLabel: false, requiresName: true, isVisible: false }),
  entry('email', 'metadata', { hasLabel: false, requiresName: true, isVisible: false }),
  entry('audit', 'metadata', { hasLabel: false, requiresName: false, isVisible: false }),
];

export const QUESTION_TYPE_MAP: ReadonlyMap<string, QuestionType> = new Map(
  QUESTION_TYPES.map((type) => [type.name, type]),
);

/** Types accepted by pyxform but not in the PRD list. */
const EXTRA_ALIASES: Record<string, string> = {
  'select one': 'select_one',
  'select multiple': 'select_multiple',
  'select all that apply': 'select_multiple',
  select_one_external: 'select_one_from_file',
  datetime: 'dateTime',
  'begin group': 'begin_group',
  'end group': 'end_group',
  'begin repeat': 'begin_repeat',
  'end repeat': 'end_repeat',
};

const MULTI_WORD_ALIASES: ReadonlyArray<readonly [string, string]> = Object.entries(EXTRA_ALIASES)
  .filter(([alias]) => alias.includes(' '))
  .map(([alias, base]) => [`${alias} `, base] as const);

export function normalizeQuestionTypeName(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return '';
  const direct = EXTRA_ALIASES[normalized];
  if (direct) return direct;
  for (const [alias, base] of MULTI_WORD_ALIASES) {
    if (normalized.startsWith(alias)) return base;
  }
  const token = normalized.split(' ')[0] ?? '';
  return EXTRA_ALIASES[token] ?? token;
}

export function getQuestionType(raw: string): QuestionType | undefined {
  return QUESTION_TYPE_MAP.get(normalizeQuestionTypeName(raw));
}

export function isStructuralType(raw: string): boolean {
  return STRUCTURAL.includes(normalizeQuestionTypeName(raw) as (typeof STRUCTURAL)[number]);
}

export function isSelectType(raw: string): boolean {
  return SELECTS.includes(normalizeQuestionTypeName(raw) as (typeof SELECTS)[number]);
}

export function isMetadataType(raw: string): boolean {
  const name = normalizeQuestionTypeName(raw);
  return METADATA.includes(name as (typeof METADATA)[number]);
}
