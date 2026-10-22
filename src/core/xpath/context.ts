/**
 * Cursor context analysis for the formula IDE (Task 4.3, PRD §4.2).
 *
 * Built on the shared tokenizer (AD-9). The same structural scanners that find
 * choice-value positions at the cursor feed lint rule XLS-011, so completion
 * and validation cannot drift apart.
 */
import type { VariableMap } from '../indexes/variables';
import type { Token } from './tokenize';
import { tokenize } from './tokenize';

export interface VariableCompletionContext {
  kind: 'variable';
  from: number;
  to: number;
  prefix: string;
  /** True when the cursor is inside `${…` (a closing brace may already exist). */
  braced: boolean;
}

export interface ChoiceValueCompletionContext {
  kind: 'choiceValue';
  varName: string;
  listName: string;
  from: number;
  to: number;
  quote: "'" | '"';
  prefix: string;
}

export interface FunctionCompletionContext {
  kind: 'function';
  from: number;
  to: number;
  prefix: string;
}

export interface SignatureContext {
  kind: 'signature';
  funcName: string;
  /** Zero-based argument index at the cursor. */
  argIndex: number;
}

export interface NoCompletionContext {
  kind: 'none';
}

export type XPathCompletionContext =
  | VariableCompletionContext
  | ChoiceValueCompletionContext
  | FunctionCompletionContext
  | SignatureContext
  | NoCompletionContext;

export interface AnalyzeContextOptions {
  variableMap: VariableMap;
}

export interface ChoiceValueReference {
  varName: string;
  value: string;
  quote: "'" | '"';
  /** Inner content range of the string literal (excluding quotes). */
  from: number;
  to: number;
  varFrom: number;
  varTo: number;
}

const COMPARISON_OPERATORS = new Set(['=', '!=']);
const SELECT_LIST_TYPES = new Set(['select_one', 'select_multiple', 'rank']);

interface Significant {
  index: number;
  token: Token;
}

function significantTokens(tokens: readonly Token[]): Significant[] {
  const result: Significant[] = [];
  tokens.forEach((token, index) => {
    if (token.kind !== 'ws') result.push({ index, token });
  });
  return result;
}

function splitCallArguments(
  tokens: readonly Token[],
  openIndex: number,
  closeIndex: number,
): number[][] {
  const args: number[][] = [];
  let current: number[] = [];
  let index = openIndex + 1;
  while (index < closeIndex) {
    const token = tokens[index];
    if (!token) break;
    if (token.kind === 'paren' && token.text === '(') {
      current.push(index);
      if (typeof token.matchIndex === 'number' && token.matchIndex > index) {
        for (let nested = index + 1; nested <= token.matchIndex; nested += 1) {
          current.push(nested);
        }
        index = token.matchIndex + 1;
        continue;
      }
    }
    if (token.kind === 'comma') {
      args.push(current);
      current = [];
      index += 1;
      continue;
    }
    if (token.kind !== 'ws') current.push(index);
    index += 1;
  }
  args.push(current);
  return args;
}

function onlySignificant(tokens: readonly Token[], indexes: readonly number[]): Token[] {
  return indexes
    .map((index) => tokens[index])
    .filter((token): token is Token => token !== undefined && token.kind !== 'ws');
}

/**
 * All places where a string literal names a choice value of a known select:
 *   selected(${q}, 'x'), ${q} = 'x', ${q} != 'x', and swapped comparisons.
 *
 * `selected-at` and `jr:choice-name` are deliberately excluded (their string
 * arguments are positions / field names, not choice values).
 */
export function findChoiceValueReferences(tokens: readonly Token[]): ChoiceValueReference[] {
  const references: ChoiceValueReference[] = [];
  const seen = new Set<number>();

  const add = (varToken: Token, stringToken: Token): void => {
    if (varToken.kind !== 'varRef' || !varToken.name) return;
    if (stringToken.kind !== 'string' || stringToken.innerFrom === undefined) return;
    if (seen.has(stringToken.from)) return;
    seen.add(stringToken.from);
    const closed = stringToken.error !== 'unclosed-string';
    references.push({
      varName: varToken.name,
      value: closed ? stringToken.text.slice(1, -1) : stringToken.text.slice(1),
      quote: stringToken.text.startsWith('"') ? '"' : "'",
      from: stringToken.innerFrom,
      to: stringToken.innerTo ?? stringToken.to,
      varFrom: varToken.from,
      varTo: varToken.to,
    });
  };

  // selected(${q}, 'x') — only the plain `selected` function.
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || (token.kind !== 'func' && token.kind !== 'ident')) continue;
    if (token.text !== 'selected') continue;
    let openIndex = index + 1;
    while (tokens[openIndex]?.kind === 'ws') openIndex += 1;
    const open = tokens[openIndex];
    if (!open || open.kind !== 'paren' || open.text !== '(') continue;
    const closeIndex =
      typeof open.matchIndex === 'number' && open.matchIndex >= 0 ? open.matchIndex : tokens.length;
    const args = splitCallArguments(tokens, openIndex, closeIndex);
    const first = args[0] ? onlySignificant(tokens, args[0]) : [];
    const second = args[1] ? onlySignificant(tokens, args[1]) : [];
    if (first.length === 1 && second.length === 1) {
      const varToken = first[0];
      const stringToken = second[0];
      if (varToken && stringToken) add(varToken, stringToken);
    }
  }

  // Comparisons at any depth.
  const significant = significantTokens(tokens);
  for (let index = 0; index + 2 < significant.length; index += 1) {
    const left = significant[index];
    const operator = significant[index + 1];
    const right = significant[index + 2];
    if (!left || !operator || !right) continue;
    if (operator.token.kind !== 'op' || !COMPARISON_OPERATORS.has(operator.token.text)) {
      continue;
    }
    if (left.token.kind === 'varRef' && right.token.kind === 'string') {
      add(left.token, right.token);
    } else if (left.token.kind === 'string' && right.token.kind === 'varRef') {
      add(right.token, left.token);
    }
  }

  return references.sort((left, right) => left.from - right.from);
}

/** String token whose content contains the cursor, if any. */
export function findStringTokenAt(tokens: readonly Token[], cursor: number): Token | undefined {
  for (const token of tokens) {
    if (token.kind !== 'string' || token.innerFrom === undefined) continue;
    const innerTo = token.innerTo ?? token.to;
    if (cursor >= token.innerFrom && cursor <= innerTo) return token;
  }
  return undefined;
}

function isSelectWithList(
  variableMap: VariableMap,
  name: string,
): { listName: string } | undefined {
  const metadata = variableMap.variables[name];
  if (!metadata || !metadata.listName) return undefined;
  if (!SELECT_LIST_TYPES.has(metadata.questionType)) return undefined;
  return { listName: metadata.listName };
}

function variableContext(tokens: readonly Token[], src: string, cursor: number) {
  // `${…}` with the cursor somewhere inside.
  let open = src.lastIndexOf('${', Math.max(0, cursor - 1));
  while (open !== -1) {
    const close = src.indexOf('}', open + 2);
    const inside = close === -1 || cursor <= close;
    const closedBeforeCursor = close !== -1 && close < cursor;
    if (inside && !closedBeforeCursor) {
      const from = open + 2;
      let to = close === -1 ? cursor : close;
      if (close === -1) {
        while (to < src.length && /[A-Za-z0-9_.:-]/.test(src[to] ?? '')) to += 1;
      }
      return {
        kind: 'variable' as const,
        from,
        to,
        prefix: src.slice(from, cursor),
        braced: true,
      };
    }
    open = open === 0 ? -1 : src.lastIndexOf('${', open - 1);
  }

  // A bare `$` still opens variable completion (`$` -> `${name}`).
  if (cursor > 0 && src[cursor - 1] === '$') {
    return { kind: 'variable' as const, from: cursor, to: cursor, prefix: '', braced: false };
  }

  // Guard against treating a `$` token inside a path/identifier oddly.
  const at = tokens.find(
    (token) => token.kind === 'varRef' && token.from < cursor && cursor < token.to,
  );
  if (at) {
    return {
      kind: 'variable' as const,
      from: at.innerFrom ?? at.from,
      to: at.innerTo ?? cursor,
      prefix: src.slice(at.innerFrom ?? at.from, cursor),
      braced: true,
    };
  }
  return undefined;
}

function signatureContext(tokens: readonly Token[], cursor: number): SignatureContext | undefined {
  let openIndex = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.kind !== 'paren' || token.text !== '(') continue;
    const close =
      typeof token.matchIndex === 'number' && token.matchIndex >= 0
        ? (tokens[token.matchIndex]?.from ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
    if (token.from < cursor && cursor <= close) {
      if (openIndex === -1 || token.from > (tokens[openIndex]?.from ?? -1)) openIndex = index;
    }
  }
  if (openIndex === -1) return undefined;

  let before = openIndex - 1;
  while (tokens[before]?.kind === 'ws') before -= 1;
  const callee = tokens[before];
  if (!callee || (callee.kind !== 'func' && callee.kind !== 'ident')) return undefined;

  let argIndex = 0;
  let index = openIndex + 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token || token.from >= cursor) break;
    if (token.kind === 'paren' && token.text === '(') {
      if (typeof token.matchIndex === 'number' && token.matchIndex >= 0) {
        index = token.matchIndex + 1;
        continue;
      }
    }
    if (token.kind === 'comma') argIndex += 1;
    index += 1;
  }
  return { kind: 'signature', funcName: callee.text, argIndex };
}

function functionContext(src: string, cursor: number): FunctionCompletionContext | undefined {
  let start = cursor;
  while (start > 0 && /[A-Za-z0-9_.:-]/.test(src[start - 1] ?? '')) start -= 1;
  if (start === cursor) return undefined;
  const prefix = src.slice(start, cursor);
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(prefix)) return undefined;

  const before = start > 0 ? (src[start - 1] ?? '') : '';
  if (before === '/' || before === '@' || before === '.' || before === '$' || before === '{') {
    return undefined;
  }
  // An identifier glued to the end of a number (`18and`) is not a call.
  if (/[0-9]/.test(before)) return undefined;

  return { kind: 'function', from: start, to: cursor, prefix };
}

/**
 * Classify what completion/signature help should show at `cursor`.
 *
 * Precedence: choice value (inside a string), variable, signature help,
 * function name, none. Unknown variables or non-select variables never
 * produce `choiceValue`.
 */
export function analyzeContext(
  src: string,
  cursor: number,
  options: AnalyzeContextOptions,
): XPathCompletionContext {
  const clamped = Math.max(0, Math.min(src.length, cursor));
  const tokens = tokenize(src);
  const stringToken = findStringTokenAt(tokens, clamped);

  if (stringToken) {
    const reference = findChoiceValueReferences(tokens).find(
      (candidate) => candidate.from === stringToken.innerFrom,
    );
    if (!reference) return { kind: 'none' };
    const resolved = isSelectWithList(options.variableMap, reference.varName);
    if (!resolved) return { kind: 'none' };
    return {
      kind: 'choiceValue',
      varName: reference.varName,
      listName: resolved.listName,
      from: reference.from,
      to: reference.to,
      quote: reference.quote,
      prefix: src.slice(reference.from, clamped),
    };
  }

  const variable = variableContext(tokens, src, clamped);
  if (variable) return variable;

  const signature = signatureContext(tokens, clamped);
  if (signature) return signature;

  const func = functionContext(src, clamped);
  if (func) return func;

  return { kind: 'none' };
}
