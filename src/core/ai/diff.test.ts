import { describe, expect, it } from 'vitest';

import type { WorkbookData } from '@/core/model/types';

import { cellChangeKey, diffWorkbooks, isCellModified, rowChange } from './diff';

function workbook(): WorkbookData {
  return {
    survey: {
      sheetName: 'survey',
      columns: ['type', 'name', 'label'],
      rows: [
        { id: 's1', cells: { type: 'text', name: 'age', label: 'Age' } },
        { id: 's2', cells: { type: 'text', name: 'city', label: 'City' } },
      ],
    },
    choices: {
      sheetName: 'choices',
      columns: ['list_name', 'name', 'label'],
      rows: [{ id: 'c1', cells: { list_name: 'yes_no', name: 'yes', label: 'Yes' } }],
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

function clone(data: WorkbookData): WorkbookData {
  return structuredClone(data);
}

describe('diffWorkbooks', () => {
  it('reports no changes for identical data', () => {
    const base = workbook();
    const diff = diffWorkbooks(base, clone(base));
    expect(diff.summary.total).toBe(0);
    expect(diff.summary.text).toBe('0 changes');
    expect(diff.survey.rows.size).toBe(0);
    expect(diff.survey.cells.size).toBe(0);
  });

  it('detects inserted rows', () => {
    const base = workbook();
    const draft = clone(base);
    draft.survey.rows.push({ id: 's3', cells: { type: 'text', name: 'new' } });
    const diff = diffWorkbooks(base, draft);
    expect(rowChange(diff, 'survey', 's3')).toBe('inserted');
    expect(diff.summary.inserted).toBe(1);
    expect(diff.summary.text).toContain('1 inserted');
  });

  it('detects deleted rows', () => {
    const base = workbook();
    const draft = clone(base);
    draft.survey.rows = draft.survey.rows.filter((row) => row.id !== 's2');
    const diff = diffWorkbooks(base, draft);
    expect(rowChange(diff, 'survey', 's2')).toBe('deleted');
    expect(diff.summary.deleted).toBe(1);
  });

  it('detects modified rows and cells', () => {
    const base = workbook();
    const draft = clone(base);
    draft.survey.rows[0]!.cells.label = 'Respondent age';
    const diff = diffWorkbooks(base, draft);
    expect(rowChange(diff, 'survey', 's1')).toBe('modified');
    expect(isCellModified(diff, 'survey', 's1', 'label')).toBe(true);
    expect(isCellModified(diff, 'survey', 's1', 'name')).toBe(false);
    expect(diff.survey.cells.has(cellChangeKey('s1', 'label'))).toBe(true);
    expect(diff.summary.modifiedCells).toBe(1);
  });

  it('treats a cleared cell as a modification', () => {
    const base = workbook();
    const draft = clone(base);
    delete draft.survey.rows[0]!.cells.label;
    const diff = diffWorkbooks(base, draft);
    expect(isCellModified(diff, 'survey', 's1', 'label')).toBe(true);
  });

  it('treats reordering without content changes as no row changes', () => {
    const base = workbook();
    const draft = clone(base);
    draft.survey.rows = [draft.survey.rows[1]!, draft.survey.rows[0]!];
    const diff = diffWorkbooks(base, draft);
    expect(diff.summary.total).toBe(0);
  });

  it('counts created groups', () => {
    const base = workbook();
    const draft = clone(base);
    draft.survey.rows.push(
      { id: 'g1', cells: { type: 'begin_group', name: 'education' } },
      { id: 'g2', cells: { type: 'text', name: 'level' } },
      { id: 'g3', cells: { type: 'end_group' } },
    );
    const diff = diffWorkbooks(base, draft);
    expect(diff.summary.groupsCreated).toBe(1);
    expect(diff.summary.text).toContain('1 group created');
  });

  it('counts added choice lists', () => {
    const base = workbook();
    const draft = clone(base);
    draft.choices.rows.push({
      id: 'c2',
      cells: { list_name: 'gender', name: 'f', label: 'Female' },
    });
    const diff = diffWorkbooks(base, draft);
    expect(diff.summary.choiceListsAdded).toBe(1);
    expect(diff.summary.text).toContain('1 choice list added');
  });

  it('does not count an existing list being extended', () => {
    const base = workbook();
    const draft = clone(base);
    draft.choices.rows.push({ id: 'c2', cells: { list_name: 'yes_no', name: 'no', label: 'No' } });
    const diff = diffWorkbooks(base, draft);
    expect(diff.summary.choiceListsAdded).toBe(0);
    expect(diff.choices.rows.get('c2')).toBe('inserted');
  });

  it('detects nameLocked metadata changes', () => {
    const base = workbook();
    const draft = clone(base);
    draft.choices.rows[0]!.meta = { nameLocked: true };
    const diff = diffWorkbooks(base, draft);
    expect(rowChange(diff, 'choices', 'c1')).toBe('modified');
  });

  it('summarizes changes across sheets', () => {
    const base = workbook();
    const draft = clone(base);
    draft.survey.rows[0]!.cells.label = 'Age (years)';
    draft.choices.rows[0]!.cells.label = 'Yes!';
    const diff = diffWorkbooks(base, draft);
    expect(diff.summary.total).toBe(2);
    expect(diff.summary.text).toBe('2 changes (2 modified)');
  });
});
