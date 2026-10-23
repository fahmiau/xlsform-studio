import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '../model/factory';
import type { WorkbookData } from '../model/types';
import { changedChoiceNames, propagateChoiceRenames, renameChoiceValue } from './renameChoiceValue';

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({
      type: 'select_one marital_status',
      name: 'marital',
      relevant: "selected(${marital}, 'married')",
      constraint: "${marital} = 'married'",
      calculation: "${marital} != 'married'",
      choice_filter: "'married' = ${marital}",
    }),
    createRow({ type: 'select_one marital_status', name: 'second', default: 'married' }),
    createRow({
      type: 'select_multiple marital_status',
      name: 'multi',
      default: 'single married',
      calculation: "selected(${multi}, 'single') and ${multi} != 'married'",
    }),
    createRow({
      type: 'select_one other_list',
      name: 'other',
      relevant: "selected(${other}, 'married')",
    }),
  );
  data.choices.rows.push(
    createRow({ list_name: 'marital_status', name: 'single', label: 'Single' }),
    createRow({ list_name: 'marital_status', name: 'married', label: 'Married' }),
    createRow({ list_name: 'other_list', name: 'married', label: 'Married elsewhere' }),
  );
  return data;
}

const cell = (data: WorkbookData, index: number, column: string) =>
  data.survey.rows[index]!.cells[column];

describe('renameChoiceValue (Task 5.2)', () => {
  it("rewrites selected(${v}, 'old')", () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 0, 'relevant')).toBe("selected(${marital}, 'married_lt')");
  });

  it('supports double-quoted literals', () => {
    const data = workbook();
    data.survey.rows[0]!.cells.constraint = 'selected(${marital}, "married")';
    const result = renameChoiceValue(data, 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 0, 'constraint')).toBe('selected(${marital}, "married_lt")');
  });

  it("rewrites ${v} = 'old'", () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 0, 'constraint')).toBe("${marital} = 'married_lt'");
  });

  it("rewrites ${v} != 'old'", () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 0, 'calculation')).toBe("${marital} != 'married_lt'");
  });

  it("rewrites swapped comparisons: 'old' = ${v}", () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 0, 'choice_filter')).toBe("'married_lt' = ${marital}");
  });

  it('rewrites a default value', () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 1, 'default')).toBe('married_lt');
  });

  it('rewrites every token of a multi-value default', () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 2, 'default')).toBe('single married_lt');
  });

  it('leaves a literal compared against another variable alone', () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 3, 'relevant')).toBe("selected(${other}, 'married')");
  });

  it('rewrites several references in one cell', () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 2, 'calculation')).toBe(
      "selected(${multi}, 'single') and ${multi} != 'married_lt'",
    );
  });

  it('leaves a longer literal with the same prefix alone', () => {
    const data = workbook();
    data.survey.rows[0]!.cells.constraint = "${marital} = 'married_longer'";
    const result = renameChoiceValue(data, 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 0, 'constraint')).toBe("${marital} = 'married_longer'");
  });

  it('ignores selected-at and jr:choice-name literals', () => {
    const data = workbook();
    data.survey.rows[0]!.cells.constraint =
      "selected-at(${marital}, 'married') = jr:choice-name(${marital}, 'married')";
    const result = renameChoiceValue(data, 'marital_status', 'married', 'married_lt');
    expect(cell(result.data, 0, 'constraint')).toBe(
      "selected-at(${marital}, 'married') = jr:choice-name(${marital}, 'married')",
    );
  });

  it('reports each changed survey cell', () => {
    const result = renameChoiceValue(workbook(), 'marital_status', 'married', 'married_lt');
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.every((change) => change.sheet === 'survey')).toBe(true);
    const columns = new Set(result.changes.map((change) => change.column));
    expect(columns.has('relevant')).toBe(true);
    expect(columns.has('constraint')).toBe(true);
    expect(columns.has('calculation')).toBe(true);
    expect(columns.has('choice_filter')).toBe(true);
    expect(columns.has('default')).toBe(true);
  });

  it('is a no-op when no variable is bound to the list', () => {
    const data = workbook();
    expect(renameChoiceValue(data, 'missing_list', 'married', 'x').data).toBe(data);
  });

  it('is a no-op for the same value', () => {
    const data = workbook();
    expect(renameChoiceValue(data, 'marital_status', 'married', 'married').data).toBe(data);
  });

  it('is a no-op for empty values or list name', () => {
    const data = workbook();
    expect(renameChoiceValue(data, '', 'married', 'x').data).toBe(data);
    expect(renameChoiceValue(data, 'marital_status', '', 'x').data).toBe(data);
    expect(renameChoiceValue(data, 'marital_status', 'married', ' ').data).toBe(data);
  });

  it('does not mutate the input', () => {
    const data = workbook();
    renameChoiceValue(data, 'marital_status', 'married', 'married_lt');
    expect(cell(data, 0, 'relevant')).toBe("selected(${marital}, 'married')");
  });

  it('returns the same object when nothing references the choice', () => {
    const data = workbook();
    expect(renameChoiceValue(data, 'marital_status', 'widowed', 'x').data).toBe(data);
  });
});

describe('changedChoiceNames (Task 5.2, Q6)', () => {
  function pair(): { before: WorkbookData; after: WorkbookData } {
    const before = workbook();
    const after = {
      ...before,
      choices: {
        ...before.choices,
        rows: before.choices.rows.map((row) =>
          row.cells.list_name === 'marital_status' && row.cells.name === 'married'
            ? { ...row, cells: { ...row.cells, name: 'married_lt' } }
            : row,
        ),
      },
    };
    return { before, after };
  }

  it('detects a unique renamed choice', () => {
    const { before, after } = pair();
    expect(changedChoiceNames(before, after)).toEqual([
      expect.objectContaining({
        listName: 'marital_status',
        from: 'married',
        to: 'married_lt',
      }),
    ]);
  });

  it('ignores unchanged names', () => {
    const data = workbook();
    expect(changedChoiceNames(data, data)).toEqual([]);
  });

  it('ignores a rename of a duplicated old name', () => {
    const before = workbook();
    before.choices.rows.push(createRow({ list_name: 'marital_status', name: 'married' }));
    const after = {
      ...before,
      choices: {
        ...before.choices,
        rows: before.choices.rows.map((row, index) =>
          index === 1 ? { ...row, cells: { ...row.cells, name: 'married_lt' } } : row,
        ),
      },
    };
    expect(changedChoiceNames(before, after)).toEqual([]);
  });

  it('ignores folding onto an existing choice name', () => {
    const before = workbook();
    const after = {
      ...before,
      choices: {
        ...before.choices,
        rows: before.choices.rows.map((row) =>
          row.cells.list_name === 'marital_status' && row.cells.name === 'married'
            ? { ...row, cells: { ...row.cells, name: 'single' } }
            : row,
        ),
      },
    };
    expect(changedChoiceNames(before, after)).toEqual([]);
  });

  it('ignores empty old or new names', () => {
    const before = workbook();
    const after = {
      ...before,
      choices: {
        ...before.choices,
        rows: before.choices.rows.map((row) =>
          row.cells.list_name === 'marital_status' && row.cells.name === 'married'
            ? { ...row, cells: { ...row.cells, name: '' } }
            : row,
        ),
      },
    };
    expect(changedChoiceNames(before, after)).toEqual([]);
  });
});

describe('propagateChoiceRenames (Task 5.2)', () => {
  it('rewrites formulas in the same pass', () => {
    const before = workbook();
    const after = {
      ...before,
      choices: {
        ...before.choices,
        rows: before.choices.rows.map((row) =>
          row.cells.list_name === 'marital_status' && row.cells.name === 'married'
            ? { ...row, cells: { ...row.cells, name: 'married_lt' } }
            : row,
        ),
      },
    };
    const result = propagateChoiceRenames(before, after);
    expect(cell(result.data, 0, 'relevant')).toBe("selected(${marital}, 'married_lt')");
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it('handles several renamed choices', () => {
    const before = workbook();
    const after = {
      ...before,
      choices: {
        ...before.choices,
        rows: before.choices.rows.map((row) => {
          if (row.cells.list_name === 'marital_status' && row.cells.name === 'married') {
            return { ...row, cells: { ...row.cells, name: 'married_lt' } };
          }
          if (row.cells.list_name === 'marital_status' && row.cells.name === 'single') {
            return { ...row, cells: { ...row.cells, name: 'never_married' } };
          }
          return row;
        }),
      },
    };
    const result = propagateChoiceRenames(before, after);
    expect(cell(result.data, 0, 'relevant')).toBe("selected(${marital}, 'married_lt')");
    expect(cell(result.data, 2, 'calculation')).toBe(
      "selected(${multi}, 'never_married') and ${multi} != 'married_lt'",
    );
  });

  it('returns the input unchanged when nothing renamed', () => {
    const data = workbook();
    expect(propagateChoiceRenames(data, data).data).toBe(data);
  });
});
