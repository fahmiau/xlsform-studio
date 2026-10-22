import { describe, expect, it } from 'vitest';

import { buildVariableMap, type VariableMap } from '../indexes/variables';
import type { SheetData } from '../model/types';
import { analyzeContext, findChoiceValueReferences, type XPathCompletionContext } from './context';
import { tokenize } from './tokenize';

const sheet: SheetData = {
  sheetName: 'survey',
  columns: ['type', 'name', 'label'],
  rows: [
    { id: 'r1', cells: { type: 'text', name: 'q_name', label: 'Name' } },
    { id: 'r2', cells: { type: 'integer', name: 'age', label: 'Age' } },
    {
      id: 'r3',
      cells: { type: 'select_one marital', name: 'marital_status', label: 'Marital status' },
    },
    {
      id: 'r4',
      cells: { type: 'select_multiple hobby', name: 'hobbies', label: 'Hobbies' },
    },
    {
      id: 'r5',
      cells: { type: 'select_one_from_file people.csv', name: 'from_file', label: 'From file' },
    },
    { id: 'r6', cells: { type: 'begin_group', name: 'grp', label: 'Group' } },
    { id: 'r7', cells: { type: 'end_group', label: '' } },
  ],
};

const variableMap: VariableMap = buildVariableMap(sheet);

function analyze(marked: string): XPathCompletionContext {
  const cursor = marked.indexOf('|');
  if (cursor === -1) throw new Error('test source needs a | cursor marker');
  return analyzeContext(marked.replace('|', ''), cursor, { variableMap });
}

describe('XPath cursor context (Task 4.3)', () => {
  const cases: Array<[string, XPathCompletionContext]> = [
    // Variables.
    ['$|', { kind: 'variable', from: 1, to: 1, prefix: '', braced: false }],
    ['${|', { kind: 'variable', from: 2, to: 2, prefix: '', braced: true }],
    ['${mar|', { kind: 'variable', from: 2, to: 5, prefix: 'mar', braced: true }],
    ['${mar|}', { kind: 'variable', from: 2, to: 5, prefix: 'mar', braced: true }],
    [
      '${marital_status|}',
      { kind: 'variable', from: 2, to: 16, prefix: 'marital_status', braced: true },
    ],
    ['${ mar|ital_status }', { kind: 'variable', from: 2, to: 18, prefix: ' mar', braced: true }],
    [
      'selected(${mar|ital_status}, 1)',
      { kind: 'variable', from: 11, to: 25, prefix: 'mar', braced: true },
    ],
    ['${marital_status}|', { kind: 'none' }],
    ["'${mar|}'", { kind: 'none' }],

    // Choice values through selected().
    [
      "selected(${marital_status}, '|')",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 29,
        to: 29,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "selected(${marital_status}, 'mar|')",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 29,
        to: 32,
        quote: "'",
        prefix: 'mar',
      },
    ],
    [
      'selected(${marital_status}, "|")',
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 29,
        to: 29,
        quote: '"',
        prefix: '',
      },
    ],
    [
      "selected( ${marital_status} , '|' )",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 31,
        to: 31,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "selected(${marital_status},'|')",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 28,
        to: 28,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "if(selected(${marital_status}, '|'), 1, 0)",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 32,
        to: 32,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "selected(${marital_status}, '|') and ${age} > 1",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 29,
        to: 29,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "count(selected(${hobbies}, '|'))",
      {
        kind: 'choiceValue',
        varName: 'hobbies',
        listName: 'hobby',
        from: 28,
        to: 28,
        quote: "'",
        prefix: '',
      },
    ],

    // Choice values through comparisons.
    [
      "${marital_status} = '|'",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 21,
        to: 21,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "${marital_status} != '|'",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 22,
        to: 22,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "'|' = ${marital_status}",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 1,
        to: 1,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "'|' != ${marital_status}",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 1,
        to: 1,
        quote: "'",
        prefix: '',
      },
    ],
    [
      '${marital_status}= "|"',
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 20,
        to: 20,
        quote: '"',
        prefix: '',
      },
    ],
    [
      "${marital_status} = 'x' and ${hobbies} = '|'",
      {
        kind: 'choiceValue',
        varName: 'hobbies',
        listName: 'hobby',
        from: 42,
        to: 42,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "${hobbies} = '|'",
      {
        kind: 'choiceValue',
        varName: 'hobbies',
        listName: 'hobby',
        from: 14,
        to: 14,
        quote: "'",
        prefix: '',
      },
    ],
    [
      "selected(${marital_status}, '|",
      {
        kind: 'choiceValue',
        varName: 'marital_status',
        listName: 'marital',
        from: 29,
        to: 29,
        quote: "'",
        prefix: '',
      },
    ],

    // No choice context for non-selects, unknowns, excluded functions, or
    // strings that are not choice operands.
    ["${age} = '|'", { kind: 'none' }],
    ["${unknown} = '|'", { kind: 'none' }],
    ["${from_file} = '|'", { kind: 'none' }],
    ["selected(${from_file}, '|')", { kind: 'none' }],
    ["selected-at(${marital_status}, '|')", { kind: 'none' }],
    ["jr:choice-name('|', 'marital_status')", { kind: 'none' }],
    ["jr:selected(${marital_status}, '|')", { kind: 'none' }],
    ["selected(${marital_status}, 'x') = '|'", { kind: 'none' }],
    ["selected(${marital_status}, 'x') and ${age} = '|'", { kind: 'none' }],
    ["'|'", { kind: 'none' }],
    ["'plain | text'", { kind: 'none' }],

    // Functions.
    ['sel|', { kind: 'function', from: 0, to: 3, prefix: 'sel' }],
    ['selected|', { kind: 'function', from: 0, to: 8, prefix: 'selected' }],
    ['count-sel|', { kind: 'function', from: 0, to: 9, prefix: 'count-sel' }],
    ['jr:cho|', { kind: 'function', from: 0, to: 6, prefix: 'jr:cho' }],
    ['a - b|', { kind: 'function', from: 4, to: 5, prefix: 'b' }],
    ['foo:bar|', { kind: 'function', from: 0, to: 7, prefix: 'foo:bar' }],
    ['/data/|', { kind: 'none' }],
    ['@|', { kind: 'none' }],
    ['18and|', { kind: 'none' }],
    ['   |', { kind: 'none' }],
    ['|a', { kind: 'none' }],

    // Signature help.
    ['selected(|', { kind: 'signature', funcName: 'selected', argIndex: 0 }],
    ['selected(${marital_status}, |', { kind: 'signature', funcName: 'selected', argIndex: 1 }],
    ["if(selected(${marital_status}, 'x'), |", { kind: 'signature', funcName: 'if', argIndex: 1 }],
    [
      "selected(${marital_status}, 'x', |",
      { kind: 'signature', funcName: 'selected', argIndex: 2 },
    ],
    [
      'selected(${marital_status}, |, ${age})',
      { kind: 'signature', funcName: 'selected', argIndex: 1 },
    ],
    ["selected(${marital_status}, 'x'|)", { kind: 'signature', funcName: 'selected', argIndex: 1 }],
    ['if(${age} > 18, |', { kind: 'signature', funcName: 'if', argIndex: 1 }],
    ['selected(${marital_status}, |)', { kind: 'signature', funcName: 'selected', argIndex: 1 }],
    ["selected(${marital_status}, 'x')|", { kind: 'none' }],
  ];

  it.each(cases)('analyzes %s', (marked, expected) => {
    expect(analyze(marked)).toEqual(expected);
  });

  it('returns every structural choice-value reference', () => {
    const references = findChoiceValueReferences(
      tokenize(
        "${marital_status} = 'married' and selected(${hobbies}, 'chess') or 'x' = ${marital_status}",
      ),
    );
    expect(references.map((ref) => `${ref.varName}:${ref.value}`)).toEqual([
      'marital_status:married',
      'hobbies:chess',
      'marital_status:x',
    ]);
  });

  it('does not treat selected-at or jr:choice-name arguments as choices', () => {
    const references = findChoiceValueReferences(
      tokenize("selected-at(${marital_status}, 'married') or jr:choice-name('x', 'q')"),
    );
    expect(references).toEqual([]);
  });
});
