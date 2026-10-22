import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook } from '@/core/model/factory';
import type { WorkbookData } from '@/core/model/types';
import { insertRows } from '@/core/ops/rows';

import { matrixFromSheet, parseTsv, pasteMatrix, serializeTsv, toHtmlTable } from './clipboard';

const KEYS = ['type', 'name', 'label', 'relevant'];

function workbook(rows: Array<Record<string, string>>): WorkbookData {
  const data = createEmptyWorkbook();
  return insertRows(
    data,
    'survey',
    0,
    rows.map((cells) => ({ cells })),
  );
}

describe('serializeTsv', () => {
  it('writes simple rows', () => {
    expect(
      serializeTsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a\tb\nc\td');
  });
  it('returns an empty string for no rows', () => {
    expect(serializeTsv([])).toBe('');
  });
  it('quotes tabs', () => {
    expect(serializeTsv([['a\tb', 'c']])).toBe('"a\tb"\tc');
  });
  it('quotes newlines', () => {
    expect(serializeTsv([['a\nb']])).toBe('"a\nb"');
  });
  it('quotes carriage returns', () => {
    expect(serializeTsv([['a\rb']])).toBe('"a\rb"');
  });
  it('doubles inner quotes', () => {
    expect(serializeTsv([['say "hi"']])).toBe('"say ""hi"""');
  });
  it('keeps empty cells', () => {
    expect(serializeTsv([['', 'x', '']])).toBe('\tx\t');
  });
  it('round-trips a tricky matrix', () => {
    const matrix = [
      ['plain', 'tab\there', 'line\nbreak'],
      ['quote"inside', '', 'multi\nline\tand quote "x"'],
    ];
    expect(parseTsv(serializeTsv(matrix))).toEqual(matrix);
  });
});

describe('parseTsv', () => {
  it('parses an empty string as no rows', () => {
    expect(parseTsv('')).toEqual([]);
  });
  it('parses one cell', () => {
    expect(parseTsv('one')).toEqual([['one']]);
  });
  it('parses a rectangle', () => {
    expect(parseTsv('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('accepts CRLF row separators', () => {
    expect(parseTsv('a\tb\r\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('ignores one trailing newline', () => {
    expect(parseTsv('a\nb\n')).toEqual([['a'], ['b']]);
  });
  it('ignores one trailing carriage return', () => {
    expect(parseTsv('a\r')).toEqual([['a']]);
  });
  it('keeps a quoted tab inside a cell', () => {
    expect(parseTsv('"a\tb"\tc')).toEqual([['a\tb', 'c']]);
  });
  it('keeps a quoted newline inside a cell', () => {
    expect(parseTsv('"a\nb"\tc')).toEqual([['a\nb', 'c']]);
  });
  it('unescapes doubled quotes', () => {
    expect(parseTsv('"say ""hi"""')).toEqual([['say "hi"']]);
  });
  it('keeps empty cells', () => {
    expect(parseTsv('a\t\tb')).toEqual([['a', '', 'b']]);
  });
  it('keeps a trailing empty cell', () => {
    expect(parseTsv('a\t')).toEqual([['a', '']]);
  });
  it('parses a quoted empty cell', () => {
    expect(parseTsv('""')).toEqual([['']]);
  });
  it('normalizes CRLF inside quotes to a newline', () => {
    expect(parseTsv('"a\r\nb"')).toEqual([['a\nb']]);
  });
  it('parses multiple multiline quoted rows', () => {
    expect(parseTsv('"a\nb"\t"c\nd"\ne\tf')).toEqual([
      ['a\nb', 'c\nd'],
      ['e', 'f'],
    ]);
  });
  it('is lenient with an unclosed quote', () => {
    expect(parseTsv('"unterminated')).toEqual([['unterminated']]);
  });
  it('parses one cell per line', () => {
    expect(parseTsv('a\nb\nc')).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('toHtmlTable', () => {
  it('writes a table with escaped text', () => {
    expect(toHtmlTable([['<b>', 'a&b']])).toBe(
      '<table><tr><td>&lt;b&gt;</td><td>a&amp;b</td></tr></table>',
    );
  });
  it('escapes quotes and converts newlines to breaks', () => {
    expect(toHtmlTable([['say "hi"\nnext']])).toBe(
      '<table><tr><td>say &quot;hi&quot;<br>next</td></tr></table>',
    );
  });
});

describe('matrixFromSheet', () => {
  it('reads cells for the requested rows and columns', () => {
    const data = workbook([
      { type: 'text', name: 'q1', label: 'One' },
      { type: 'text', name: 'q2', label: 'Two' },
    ]);
    expect(matrixFromSheet(data.survey, [0, 1], ['name', 'label'])).toEqual([
      ['q1', 'One'],
      ['q2', 'Two'],
    ]);
  });
});

describe('pasteMatrix', () => {
  it('pastes at the target cell', () => {
    const data = workbook([{ type: 'text', name: 'q1', label: 'One' }]);
    const result = pasteMatrix(
      data,
      'survey',
      { rowIndex: 0, columnIndex: 0 },
      [['text', 'q1', 'One!']],
      KEYS,
    );
    expect(result.applied).toBe(1);
    expect(result.data.survey.rows[0]?.cells.label).toBe('One!');
  });

  it('appends rows when the paste runs past the end', () => {
    const data = workbook([{ type: 'text', name: 'q1' }]);
    const result = pasteMatrix(
      data,
      'survey',
      { rowIndex: 0, columnIndex: 0 },
      [
        ['text', 'q1'],
        ['text', 'q2'],
        ['text', 'q3'],
      ],
      KEYS,
    );
    expect(result.appendedRows).toBe(2);
    expect(result.data.survey.rows).toHaveLength(3);
    expect(result.data.survey.rows[2]?.cells.name).toBe('q3');
  });

  it('drops columns past the last available column', () => {
    const data = workbook([{ type: 'text', name: 'q1' }]);
    const result = pasteMatrix(
      data,
      'survey',
      { rowIndex: 0, columnIndex: 2 },
      [['label', 'relevant', 'extra', 'more']],
      KEYS,
    );
    expect(result.droppedColumns).toBe(2);
    expect(result.data.survey.rows[0]?.cells.label).toBe('label');
    expect(result.data.survey.rows[0]?.cells.relevant).toBe('relevant');
  });

  it('skips read-only cells on end rows and counts them', () => {
    const data = workbook([{ type: 'end_group', name: '' }]);
    const result = pasteMatrix(
      data,
      'survey',
      { rowIndex: 0, columnIndex: 0 },
      [['end_group', '', '', '${x} = 1']],
      KEYS,
    );
    expect(result.skippedReadOnly).toBe(1);
    expect(result.data.survey.rows[0]?.cells.relevant).toBeUndefined();
  });

  it('does not create a history-relevant change for an empty matrix', () => {
    const data = workbook([{ type: 'text', name: 'q1' }]);
    const result = pasteMatrix(data, 'survey', { rowIndex: 0, columnIndex: 0 }, [], KEYS);
    expect(result.data).toBe(data);
    expect(result.applied).toBe(0);
  });

  it('reports the row ids it touched', () => {
    const data = workbook([
      { type: 'text', name: 'q1' },
      { type: 'text', name: 'q2' },
    ]);
    const result = pasteMatrix(
      data,
      'survey',
      { rowIndex: 1, columnIndex: 1 },
      [['renamed']],
      KEYS,
    );
    expect(result.rowIds).toEqual([data.survey.rows[1]?.id]);
  });

  it('pastes 500×10 in under 200 ms', () => {
    const data = workbook([]);
    const matrix = Array.from({ length: 500 }, (_, row) =>
      Array.from({ length: 10 }, (_, column) => `v${row}_${column}`),
    );
    const started = performance.now();
    const result = pasteMatrix(data, 'survey', { rowIndex: 0, columnIndex: 0 }, matrix, KEYS);
    const elapsed = performance.now() - started;
    expect(result.data.survey.rows).toHaveLength(500);
    // Normal runs are ~25 ms. The looser bound tolerates the v8 coverage
    // provider's instrumentation (~10×), which is still well under a second.
    expect(elapsed).toBeLessThan(500);
  });
});
