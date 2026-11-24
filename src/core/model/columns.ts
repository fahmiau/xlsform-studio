/**
 * Column semantics (master plan AD-5). Headers are stored verbatim; this module
 * turns them into meaning without rewriting them.
 */
import type { ColumnKey } from './types';

export type ColumnBase =
  | 'type'
  | 'name'
  | 'label'
  | 'hint'
  | 'required'
  | 'relevant'
  | 'constraint'
  | 'constraint_message'
  | 'required_message'
  | 'calculation'
  | 'appearance'
  | 'default'
  | 'choice_filter'
  | 'repeat_count'
  | 'trigger'
  | 'read_only'
  | 'list_name'
  | 'image'
  | 'audio'
  | 'video'
  | 'note'
  | 'parameter'
  | 'style'
  | 'form_title'
  | 'form_id'
  | 'version'
  | 'default_language'
  | 'instance_name'
  | 'allow_choice_duplicates'
  | 'custom';

export type ColumnRole =
  'identity' | 'structural' | 'content' | 'logic' | 'presentation' | 'custom';

export interface LanguageTag {
  /** Display name, e.g. `Indonesian`. */
  name: string;
  /** ISO subtag, e.g. `id`. Absent when the header has no `(xx)` part. */
  code?: string;
}

export interface ResolvedColumn {
  /** Semantic base name after alias and case normalization. */
  base: ColumnBase;
  /** Canonical header without a language suffix, e.g. `media::image`. */
  canonical: string;
  /** Header exactly as stored on the sheet. */
  header: ColumnKey;
  language?: LanguageTag;
  isXPath: boolean;
  isLocalizable: boolean;
  role: ColumnRole;
}

/** Columns whose cells hold XPath (PRD §4.2). */
export const XPATH_COLUMNS = [
  'relevant',
  'calculation',
  'constraint',
  'choice_filter',
  'default',
  'repeat_count',
  // Expression-capable, though often booleans/literals:
  'required',
  'trigger',
] as const;

const XPATH_SET = new Set<string>(XPATH_COLUMNS);

/** Columns that can carry a `::Language (code)` suffix. */
export const LOCALIZABLE_COLUMNS = [
  'label',
  'hint',
  'constraint_message',
  'required_message',
  'image',
  'audio',
  'video',
] as const;

const LOCALIZABLE_SET = new Set<string>(LOCALIZABLE_COLUMNS);

/** pyxform header aliases, normalized to our base names (AD-5). */
const BASE_ALIASES: Record<string, ColumnBase> = {
  'list name': 'list_name',
  list_name: 'list_name',
  'constraint message': 'constraint_message',
  constraint_message: 'constraint_message',
  'required message': 'required_message',
  required_message: 'required_message',
  image: 'image',
  'media::image': 'image',
  audio: 'audio',
  'media::audio': 'audio',
  video: 'video',
  'media::video': 'video',
  'choice filter': 'choice_filter',
  choice_filter: 'choice_filter',
  'repeat count': 'repeat_count',
  repeat_count: 'repeat_count',
  readonly: 'read_only',
  read_only: 'read_only',
  'form title': 'form_title',
  form_title: 'form_title',
  'form id': 'form_id',
  form_id: 'form_id',
  'default language': 'default_language',
  default_language: 'default_language',
  'instance name': 'instance_name',
  instance_name: 'instance_name',
  'allow choice duplicates': 'allow_choice_duplicates',
  allow_choice_duplicates: 'allow_choice_duplicates',
  default: 'default',
  type: 'type',
  name: 'name',
  label: 'label',
  hint: 'hint',
  required: 'required',
  relevant: 'relevant',
  constraint: 'constraint',
  calculation: 'calculation',
  appearance: 'appearance',
  trigger: 'trigger',
  note: 'note',
  parameter: 'parameter',
  parameters: 'parameter',
  style: 'style',
  version: 'version',
};

/** Canonical header written for a base when a new file is created. */
const CANONICAL_HEADERS: Record<ColumnBase, string> = {
  type: 'type',
  name: 'name',
  label: 'label',
  hint: 'hint',
  required: 'required',
  relevant: 'relevant',
  constraint: 'constraint',
  constraint_message: 'constraint_message',
  required_message: 'required_message',
  calculation: 'calculation',
  appearance: 'appearance',
  default: 'default',
  choice_filter: 'choice_filter',
  repeat_count: 'repeat_count',
  trigger: 'trigger',
  read_only: 'read_only',
  list_name: 'list_name',
  image: 'media::image',
  audio: 'media::audio',
  video: 'media::video',
  note: 'note',
  parameter: 'parameters',
  style: 'style',
  form_title: 'form_title',
  form_id: 'form_id',
  version: 'version',
  default_language: 'default_language',
  instance_name: 'instance_name',
  allow_choice_duplicates: 'allow_choice_duplicates',
  custom: 'custom',
};

const ROLES: Record<ColumnBase, ColumnRole> = {
  type: 'structural',
  name: 'identity',
  label: 'content',
  hint: 'content',
  required: 'logic',
  relevant: 'logic',
  constraint: 'logic',
  constraint_message: 'content',
  required_message: 'content',
  calculation: 'logic',
  appearance: 'presentation',
  default: 'logic',
  choice_filter: 'logic',
  repeat_count: 'logic',
  trigger: 'logic',
  read_only: 'logic',
  list_name: 'identity',
  image: 'content',
  audio: 'content',
  video: 'content',
  note: 'content',
  parameter: 'logic',
  style: 'presentation',
  form_title: 'content',
  form_id: 'identity',
  version: 'content',
  default_language: 'content',
  instance_name: 'logic',
  allow_choice_duplicates: 'content',
  custom: 'custom',
};

/** Normalize case and whitespace without touching the stored header. */
export function normalizeHeader(header: string): string {
  return header.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Parse a localized suffix such as `Indonesian (id)`. Returns `undefined` when
 * the header has no `::` part or the suffix is empty.
 */
export function parseLanguageTag(header: string): LanguageTag | undefined {
  if (!header.includes('::')) return undefined;
  const segments = header.split('::');
  const suffix = (segments[segments.length - 1] ?? '').trim();
  if (!suffix) return undefined;

  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(suffix);
  if (match) {
    const name = (match[1] ?? '').trim() || suffix;
    const code = (match[2] ?? '').trim();
    return code ? { name, code } : { name };
  }

  // Unqualified language (`label::English`) is only a language tag when the
  // header is a single localizable column, not a namespaced one
  // (`media::image`).
  const first = (segments[0] ?? '').trim().toLowerCase();
  if (segments.length === 2 && LOCALIZABLE_SET.has(first)) {
    return { name: suffix };
  }
  return undefined;
}

function baseBeforeLanguage(header: string): string {
  const normalized = normalizeHeader(header);
  const separator = normalized.indexOf('::');
  if (separator === -1) return normalized;
  const firstSegment = normalized.slice(0, separator);
  if (LOCALIZABLE_SET.has(firstSegment)) return firstSegment;
  const media = /^(media::(?:image|audio|video))(?:$|::)/.exec(normalized);
  if (media?.[1]) return media[1];
  // Custom localized columns (`notes::English (en)`) keep everything before the
  // trailing language tag.
  const match = /^(.*?)::([^:]*\([^)]*\))$/.exec(normalized);
  if (match?.[1]) return match[1].trim();
  return normalized;
}

function resolveBase(normalizedBase: string): ColumnBase {
  return BASE_ALIASES[normalizedBase] ?? 'custom';
}

export function resolveColumn(header: ColumnKey): ResolvedColumn {
  const basePart = baseBeforeLanguage(header);
  const base = resolveBase(basePart);
  const isLocalizable = LOCALIZABLE_SET.has(base);
  const language = isLocalizable ? parseLanguageTag(header) : undefined;
  const canonical = CANONICAL_HEADERS[base];
  const isXPath = XPATH_SET.has(base);

  const resolved: ResolvedColumn = {
    base,
    canonical: base === 'custom' ? header.trim() : canonical,
    header,
    isXPath,
    isLocalizable,
    role: ROLES[base],
  };
  if (language) resolved.language = language;
  return resolved;
}

/** Build a language-qualified header, e.g. `label` + `Indonesian (id)`. */
export function localizedHeader(base: ColumnBase, language: LanguageTag): string {
  const label = language.code ? `${language.name} (${language.code})` : language.name;
  return `${CANONICAL_HEADERS[base]}::${label}`;
}

export const DEFAULT_SURVEY_COLUMNS: readonly ColumnKey[] = ['type', 'name', 'label'];

export const DEFAULT_CHOICES_COLUMNS: readonly ColumnKey[] = ['list_name', 'name', 'label'];

export const DEFAULT_SETTINGS_COLUMNS: readonly ColumnKey[] = [
  'form_title',
  'form_id',
  'version',
  'default_language',
  'style',
  'instance_name',
];

/**
 * Headers offered by the Add-column dialog (Task 2.6). This is a UX list only;
 * any header the user types is accepted.
 */
export const KNOWN_XLSFORM_COLUMNS: readonly ColumnKey[] = [
  'hint',
  'required',
  'relevant',
  'constraint',
  'constraint_message',
  'calculation',
  'appearance',
  'default',
  'choice_filter',
  'repeat_count',
  'parameters',
  'required_message',
  'read_only',
  'trigger',
  'note',
  'style',
  'media::image',
  'media::audio',
  'media::video',
  'bind::esri:fieldType',
  'bind::esri:fieldLength',
  'bind::odk:length',
  'bind::odk:required',
  'bind::odk:relevant',
  'label::English (en)',
  'label::French (fr)',
  'allow_choice_duplicates',
];
