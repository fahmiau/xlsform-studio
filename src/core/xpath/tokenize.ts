/**
 * The one hand-written XLSForm XPath tokenizer (master plan AD-9).
 *
 * Editing, completion context, linting, and rename refactoring all consume
 * these tokens, so "what is a `${var}`" has a single answer. The tokenizer
 * never throws: malformed input becomes error tokens.
 *
 * Offsets are UTF-16 code-unit indexes into the same string, which is what
 * CodeMirror and `String.prototype.slice` use.
 */

export type TokenKind =
  | 'varRef'
  | 'string'
  | 'number'
  | 'keywordOp'
  | 'func'
  | 'path'
  | 'op'
  | 'paren'
  | 'comma'
  | 'punct'
  | 'ident'
  | 'ws'
  | 'unknown';

export type TokenError = 'unclosed-var' | 'unclosed-string' | 'unbalanced';

export interface Token {
  kind: TokenKind;
  from: number;
  to: number;
  text: string;
  error?: TokenError;
  /** Variable name for `varRef` tokens (trimmed). */
  name?: string;
  /** Inner content range for `varRef` / `string` tokens. */
  innerFrom?: number;
  innerTo?: number;
  /** Matching paren token index (both directions) or `-1` when unmatched. */
  matchIndex?: number;
}

const KEYWORD_OPERATORS = new Set(['and', 'or', 'mod', 'div']);

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isNameStart(char: string | undefined): boolean {
  if (char === undefined) return false;
  return (
    (char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z') ||
    char === '_' ||
    char.charCodeAt(0) > 127
  );
}

function isNameChar(char: string | undefined): boolean {
  if (char === undefined) return false;
  return isNameStart(char) || isDigit(char) || char === '-' || char === ':';
}

function isPathChar(char: string | undefined): boolean {
  return isNameStart(char) || isDigit(char) || char === '_' || char === '-' || char === ':';
}

/** Tokens after which a binary operator may appear. */
function canEndExpression(token: Token | undefined): boolean {
  if (!token) return false;
  switch (token.kind) {
    case 'varRef':
    case 'string':
    case 'number':
    case 'func':
    case 'path':
    case 'ident':
    case 'punct':
      return true;
    case 'paren':
      return token.text === ')';
    default:
      return false;
  }
}

function previousSignificant(tokens: readonly Token[]): Token | undefined {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token && token.kind !== 'ws') return token;
  }
  return undefined;
}

function push(tokens: Token[], token: Token): void {
  tokens.push(token);
}

/**
 * Tokenize a formula. Always returns a contiguous view of the source: joining
 * every `text` reproduces the input exactly.
 */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const parenStack: number[] = [];
  let index = 0;

  while (index < src.length) {
    const char = src[index] ?? '';

    if (isWhitespace(char)) {
      let end = index + 1;
      while (end < src.length && isWhitespace(src[end] ?? '')) end += 1;
      push(tokens, { kind: 'ws', from: index, to: end, text: src.slice(index, end) });
      index = end;
      continue;
    }

    // `${name}` variable reference.
    if (char === '$' && src[index + 1] === '{') {
      const innerFrom = index + 2;
      const close = src.indexOf('}', innerFrom);
      if (close === -1) {
        const name = src.slice(innerFrom).trim();
        push(tokens, {
          kind: 'varRef',
          from: index,
          to: src.length,
          text: src.slice(index),
          error: 'unclosed-var',
          name,
          innerFrom,
          innerTo: src.length,
        });
        index = src.length;
        continue;
      }
      push(tokens, {
        kind: 'varRef',
        from: index,
        to: close + 1,
        text: src.slice(index, close + 1),
        name: src.slice(innerFrom, close).trim(),
        innerFrom,
        innerTo: close,
      });
      index = close + 1;
      continue;
    }

    // '…' / "…"; doubled quotes escape the quote character in XPath.
    if (char === "'" || char === '"') {
      const quote = char;
      let cursor = index + 1;
      let closed = false;
      while (cursor < src.length) {
        if (src[cursor] === quote) {
          if (src[cursor + 1] === quote) {
            cursor += 2;
            continue;
          }
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (closed) {
        push(tokens, {
          kind: 'string',
          from: index,
          to: cursor + 1,
          text: src.slice(index, cursor + 1),
          innerFrom: index + 1,
          innerTo: cursor,
        });
        index = cursor + 1;
      } else {
        push(tokens, {
          kind: 'string',
          from: index,
          to: src.length,
          text: src.slice(index),
          error: 'unclosed-string',
          innerFrom: index + 1,
          innerTo: src.length,
        });
        index = src.length;
      }
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(src[index + 1]))) {
      let end = index;
      if (char === '.') {
        end += 1;
        while (isDigit(src[end])) end += 1;
      } else {
        while (isDigit(src[end])) end += 1;
        if (src[end] === '.' && isDigit(src[end + 1])) {
          end += 1;
          while (isDigit(src[end])) end += 1;
        }
      }
      push(tokens, { kind: 'number', from: index, to: end, text: src.slice(index, end) });
      index = end;
      continue;
    }

    // Paths: `.`, `..`, `/data/x`, `@attr`, `instance('x')/root/item`.
    if (char === '/' || char === '@' || (char === '.' && !isDigit(src[index + 1]))) {
      let end = index + 1;
      if (char === '/') {
        if (src[end] === '/') end += 1;
        if (src[end] === '*') end += 1;
      } else if (char === '.') {
        while (src[end] === '.') end += 1;
      }
      while (end < src.length) {
        const next = src[end] ?? '';
        if (isPathChar(next)) {
          end += 1;
          continue;
        }
        if (next === '/' && src[end + 1] !== '/') {
          end += 1;
          continue;
        }
        if (next === '@' && end === index + 1) {
          end += 1;
          continue;
        }
        break;
      }
      push(tokens, { kind: 'path', from: index, to: end, text: src.slice(index, end) });
      index = end;
      continue;
    }

    if (isNameStart(char)) {
      // Function names may contain `-` and `:` (`count-selected`,
      // `jr:choice-name`). Only treat the long run as a name when `(` follows.
      let candidateEnd = index + 1;
      while (candidateEnd < src.length) {
        const next = src[candidateEnd] ?? '';
        if (isNameChar(next) || next === '.') candidateEnd += 1;
        else break;
      }
      const candidate = src.slice(index, candidateEnd);
      if (src[candidateEnd] === '(' && !/[.:-]$/.test(candidate)) {
        push(tokens, {
          kind: 'func',
          from: index,
          to: candidateEnd,
          text: candidate,
        });
        index = candidateEnd;
        continue;
      }

      let end = index + 1;
      while (end < src.length) {
        const next = src[end] ?? '';
        if (isNameStart(next) || isDigit(next)) end += 1;
        else break;
      }
      const word = src.slice(index, end);
      const keyword = KEYWORD_OPERATORS.has(word) && canEndExpression(previousSignificant(tokens));
      push(tokens, {
        kind: keyword ? 'keywordOp' : 'ident',
        from: index,
        to: end,
        text: word,
      });
      index = end;
      continue;
    }

    if (char === '(' || char === ')') {
      const token: Token = { kind: 'paren', from: index, to: index + 1, text: char };
      if (char === '(') {
        parenStack.push(tokens.length);
      } else {
        const openIndex = parenStack.pop();
        if (openIndex === undefined) {
          token.error = 'unbalanced';
          token.matchIndex = -1;
        } else {
          token.matchIndex = openIndex;
          const open = tokens[openIndex];
          if (open) open.matchIndex = tokens.length;
        }
      }
      push(tokens, token);
      index += 1;
      continue;
    }

    if (char === ',') {
      push(tokens, { kind: 'comma', from: index, to: index + 1, text: char });
      index += 1;
      continue;
    }

    if ('[{}]'.includes(char)) {
      push(tokens, { kind: 'punct', from: index, to: index + 1, text: char });
      index += 1;
      continue;
    }

    const two = src.slice(index, index + 2);
    if (two === '!=' || two === '<=' || two === '>=') {
      push(tokens, { kind: 'op', from: index, to: index + 2, text: two });
      index += 2;
      continue;
    }
    if ('=<>+-*|'.includes(char)) {
      push(tokens, { kind: 'op', from: index, to: index + 1, text: char });
      index += 1;
      continue;
    }

    push(tokens, { kind: 'unknown', from: index, to: index + 1, text: char });
    index += 1;
  }

  for (const openIndex of parenStack) {
    const open = tokens[openIndex];
    if (!open) continue;
    open.error = 'unbalanced';
    open.matchIndex = -1;
  }

  return tokens;
}

export interface VarRef {
  name: string;
  /** Range of the whole `${name}` token. */
  from: number;
  to: number;
  innerFrom: number;
  innerTo: number;
  closed: boolean;
}

/** All variable references in source order, including unclosed ones. */
export function extractVarRefs(src: string): VarRef[] {
  const refs: VarRef[] = [];
  for (const token of tokenize(src)) {
    if (token.kind !== 'varRef') continue;
    refs.push({
      name: token.name ?? '',
      from: token.from,
      to: token.to,
      innerFrom: token.innerFrom ?? token.from,
      innerTo: token.innerTo ?? token.to,
      closed: token.error !== 'unclosed-var',
    });
  }
  return refs;
}

/** String literal tokens in source order (unclosed literals included). */
export function findStringLiterals(src: string): Token[] {
  return tokenize(src).filter((token) => token.kind === 'string');
}

export type BracketDiagnosticCode = 'unbalanced-paren' | 'unclosed-string' | 'unclosed-var';

export interface BracketDiagnostic {
  code: BracketDiagnosticCode;
  from: number;
  to: number;
  message: string;
}

const ERROR_MESSAGES: Record<BracketDiagnosticCode, string> = {
  'unbalanced-paren': 'Unbalanced parenthesis',
  'unclosed-string': 'Unclosed string literal',
  'unclosed-var': 'Unclosed ${…} variable reference',
};

/**
 * Syntax-level diagnostics for bracket matching and the red editor
 * decorations. Rule XLS-008 turns these into lint issues.
 */
export function bracketDiagnostics(tokens: readonly Token[]): BracketDiagnostic[] {
  const diagnostics: BracketDiagnostic[] = [];
  for (const token of tokens) {
    let code: BracketDiagnosticCode | undefined;
    if (token.error === 'unclosed-string') code = 'unclosed-string';
    else if (token.error === 'unclosed-var') code = 'unclosed-var';
    else if (token.error === 'unbalanced') code = 'unbalanced-paren';
    if (!code) continue;
    diagnostics.push({
      code,
      from: token.from,
      to: Math.max(token.from + 1, token.to),
      message: ERROR_MESSAGES[code],
    });
  }
  return diagnostics.sort((left, right) => left.from - right.from || left.to - right.to);
}
