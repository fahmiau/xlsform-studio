import { describe, expect, it } from 'vitest';

import type { WorkbookData } from '@/core/model/types';

import { lintDelta } from './lintDelta';

function workbook(): WorkbookData {
  return {
    survey: {
      sheetName: 'survey',
      columns: ['type', 'name', 'label', 'relevant'],
      rows: [
        { id: 's1', cells: { type: 'text', name: 'age', label: 'Age' } },
        {
          id: 's2',
          cells: { type: 'integer', name: 'income', label: 'Income', relevant: '${age} > 0' },
        },
      ],
    },
    choices: {
      sheetName: 'choices',
      columns: ['list_name', 'name', 'label'],
      rows: [],
    },
    settings: {
      sheetName: 'settings',
      columns: ['form_title'],
      rows: [{ id: 't1', cells: { form_title: 'Test' } }],
    },
    passthrough: [],
    sheetOrder: ['survey', 'choices', 'settings'],
  };
}

describe('lintDelta', () => {
  it('reports the new error introduced by a draft', () => {
    const base = workbook();
    const draft = structuredClone(base);
    draft.survey.rows[1]!.cells.relevant = '${missing} > 0';
    const delta = lintDelta(base, draft);
    expect(delta.added.map((issue) => issue.ruleId)).toContain('XLS-004');
    expect(delta.added[0]?.rowId).toBe('s2');
  });

  it('is empty when the draft keeps the same diagnostics', () => {
    const base = workbook();
    const draft = structuredClone(base);
    draft.survey.rows[0]!.cells.label = 'Age in years';
    expect(lintDelta(base, draft)).toEqual({ added: [], removed: [] });
  });

  it('reports removed errors when a draft fixes one', () => {
    const base = workbook();
    base.survey.rows[1]!.cells.relevant = '${missing} > 0';
    const draft = structuredClone(base);
    draft.survey.rows[1]!.cells.relevant = '${age} > 0';
    const delta = lintDelta(base, draft);
    expect(delta.added).toHaveLength(0);
    expect(delta.removed.map((issue) => issue.ruleId)).toContain('XLS-004');
  });

  it('does not count a pre-existing warning as new', () => {
    const base = workbook();
    base.survey.rows.push({ id: 's3', cells: { type: 'text', name: 'city' } });
    const draft = structuredClone(base);
    draft.survey.rows[0]!.cells.label = 'Age (years)';
    const delta = lintDelta(base, draft);
    expect(delta.added).toHaveLength(0);
  });
});
