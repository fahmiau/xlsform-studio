import { snippet } from '@codemirror/autocomplete';
import { describe, expect, it } from 'vitest';

import {
  FUNCTION_CATEGORIES,
  PRD_FUNCTION_NAMES,
  XPATH_FUNCTIONS,
  findFunction,
} from './functions';

describe('ODK function catalog (Task 4.2)', () => {
  it('contains every function from PRD §4.2', () => {
    for (const name of PRD_FUNCTION_NAMES) {
      expect(findFunction(name), `missing ${name}`).toBeDefined();
    }
  });

  it('has unique names and coherent metadata', () => {
    const names = new Set<string>();
    for (const entry of XPATH_FUNCTIONS) {
      expect(names.has(entry.name), `duplicate ${entry.name}`).toBe(false);
      names.add(entry.name);
      expect(entry.signature.startsWith(`${entry.name}(`)).toBe(true);
      expect(entry.signature.endsWith(')')).toBe(true);
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.returns.length).toBeGreaterThan(0);
      expect(FUNCTION_CATEGORIES).toContain(entry.category);
      expect(entry.docsUrl).toMatch(/^https:\/\/(docs|getodk)\./);
    }
  });

  it('parses every snippet as a valid CodeMirror snippet', () => {
    for (const entry of XPATH_FUNCTIONS) {
      expect(() => snippet(entry.snippet), `invalid snippet for ${entry.name}`).not.toThrow();
    }
  });

  it('uses tab stops for functions with parameters', () => {
    const selected = findFunction('selected');
    expect(selected?.snippet).toBe('selected(${1:field}, ${2:value})');
    expect(findFunction('today')?.snippet).toBe('today()');
  });

  it('keeps quoted snippets balanced', () => {
    for (const entry of XPATH_FUNCTIONS) {
      const single = (entry.snippet.match(/'/g) ?? []).length;
      expect(single % 2, `${entry.name} snippet has unbalanced quotes`).toBe(0);
    }
  });
});
