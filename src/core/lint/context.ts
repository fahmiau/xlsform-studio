/**
 * Linter context and the per-expression token cache (Task 4.7). Identical
 * formulas repeat heavily in real forms; keying tokens by cell text avoids
 * re-tokenizing them for XLS-004/005/008/011.
 */
import type { AllIndexes } from '../indexes';
import { readSettings, type WorkbookSettings } from '../model/settings';
import type { WorkbookData } from '../model/types';
import { tokenize, type Token } from '../xpath/tokenize';

import type { LintCell, LintContext, TokenCache } from './types';

export interface CreateLintContextOptions {
  tokenCache?: TokenCache;
}

export function createTokenCache(): TokenCache {
  const cache = new Map<string, readonly Token[]>();
  return {
    get(source: string): readonly Token[] {
      let tokens = cache.get(source);
      if (!tokens) {
        tokens = tokenize(source);
        cache.set(source, tokens);
      }
      return tokens;
    },
  };
}

export function createLintContext(
  data: WorkbookData,
  indexes: AllIndexes,
  options: CreateLintContextOptions = {},
): LintContext {
  const varRefCells: LintCell[] = [];
  data.survey.rows.forEach((row, rowIndex) => {
    for (const column in row.cells) {
      const text = row.cells[column] ?? '';
      if (text.includes('$')) varRefCells.push({ row, rowIndex, column, text });
    }
  });

  return {
    data,
    indexes,
    settings: readSettings(data.settings),
    tokens: options.tokenCache ?? createTokenCache(),
    varRefCells,
  };
}

export { readSettings, type WorkbookSettings };
