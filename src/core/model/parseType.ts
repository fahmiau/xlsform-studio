/**
 * `parseType` splits an XLSForm `type` cell into its parts. It never throws
 * (malformed input becomes an empty base plus the original raw text).
 */
import { normalizeQuestionTypeName } from './questionTypes';

export interface ParsedType {
  /** Normalized base type, e.g. `select_one`. Empty for malformed input. */
  base: string;
  /** Choice list name for selects (and `rank`). */
  listName?: string;
  /** `or_other` modifier: the selector may add an "Other" choice. */
  orOther?: boolean;
  /** CSV file for `select_one_from_file` / `select_multiple_from_file`. */
  fileName?: string;
  /** Trimmed original cell text. */
  raw: string;
}

const SELECT_BASES = new Set([
  'select_one',
  'select_multiple',
  'select_one_from_file',
  'select_multiple_from_file',
  'rank',
]);

const FILE_BASES = new Set(['select_one_from_file', 'select_multiple_from_file']);

/**
 * `type` cells repeat heavily across a form (and the indexes parse every row
 * three times), so memoize by trimmed text. Callers must treat results as
 * read-only.
 */
const cache = new Map<string, ParsedType>();
const CACHE_LIMIT = 2000;

/** Multi-word type spellings accepted by pyxform. Longest first. */
const MULTI_WORD_TYPES = [
  'select all that apply',
  'select multiple',
  'begin repeat',
  'select one',
  'end repeat',
  'begin group',
  'end group',
] as const;

function splitBase(trimmed: string): { base: string; rest: string } {
  const lower = trimmed.toLowerCase();
  for (const multi of MULTI_WORD_TYPES) {
    if (lower === multi) return { base: normalizeQuestionTypeName(multi), rest: '' };
    if (lower.startsWith(`${multi} `)) {
      return {
        base: normalizeQuestionTypeName(multi),
        rest: trimmed.slice(multi.length).trim(),
      };
    }
  }
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) {
    return { base: normalizeQuestionTypeName(trimmed), rest: '' };
  }
  return {
    base: normalizeQuestionTypeName(trimmed.slice(0, firstSpace)),
    rest: trimmed.slice(firstSpace + 1).trim(),
  };
}

export function parseType(raw: string): ParsedType {
  const key = (raw ?? '').trim();
  const cached = cache.get(key);
  if (cached) return cached;

  const trimmed = key.replace(/\s+/g, ' ');
  if (!trimmed) {
    const empty: ParsedType = { base: '', raw: '' };
    cache.set(key, empty);
    return empty;
  }

  const { base, rest } = splitBase(trimmed);
  const tokens = rest.split(' ').filter(Boolean);
  const result: ParsedType = { base, raw: trimmed };

  if (!SELECT_BASES.has(base)) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, result);
    return result;
  }

  const orOther = tokens.length > 1 && tokens[tokens.length - 1] === 'or_other';
  const argument = tokens[0];
  if (orOther) result.orOther = true;

  if (argument) {
    if (FILE_BASES.has(base)) {
      result.fileName = argument;
    } else {
      result.listName = argument;
    }
  }

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, result);
  return result;
}

/** Render a parsed type back to cell text (round-trip helper for the UI). */
export function formatType(
  parsed: Pick<ParsedType, 'base' | 'listName' | 'fileName' | 'orOther'>,
): string {
  const parts = [parsed.base];
  const argument = parsed.fileName ?? parsed.listName;
  if (argument) parts.push(argument);
  if (parsed.orOther) parts.push('or_other');
  return parts.filter(Boolean).join(' ');
}
