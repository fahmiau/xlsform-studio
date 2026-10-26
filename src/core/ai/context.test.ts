import { describe, expect, it } from 'vitest';

import { buildAllIndexes } from '@/core/indexes';
import { runLint } from '@/core/lint';
import type { WorkbookData } from '@/core/model/types';
import { buildReferenceWorkbookData } from '../../../tests/fixtures/reference-workbook';

import { buildContext, DEFAULT_CONTEXT_BUDGET, estimateTokens } from './context';

function workbook(): WorkbookData {
  return {
    survey: {
      sheetName: 'survey',
      columns: ['type', 'name', 'label', 'label::Indonesian (id)', 'relevant'],
      rows: [
        {
          id: 's1',
          cells: {
            type: 'begin_group',
            name: 'household',
            label: 'Household',
            'label::Indonesian (id)': 'Rumah tangga',
          },
        },
        {
          id: 's2',
          cells: {
            type: 'integer',
            name: 'age',
            label: 'Age of the respondent',
            'label::Indonesian (id)': 'Usia responden',
            relevant: '${age} > 0',
          },
        },
        { id: 's3', cells: { type: 'end_group' } },
        { id: 's4', cells: { type: 'text', name: 'city', label: 'City' } },
      ],
    },
    choices: {
      sheetName: 'choices',
      columns: ['list_name', 'name', 'label'],
      rows: [
        { id: 'c1', cells: { list_name: 'yes_no', name: 'yes', label: 'Yes' } },
        { id: 'c2', cells: { list_name: 'yes_no', name: 'no', label: 'No' } },
      ],
    },
    settings: {
      sheetName: 'settings',
      columns: ['form_title', 'form_id', 'default_language'],
      rows: [
        {
          id: 't1',
          cells: {
            form_title: 'Household survey',
            form_id: 'household',
            default_language: 'English',
          },
        },
      ],
    },
    passthrough: [],
    sheetOrder: ['survey', 'choices', 'settings'],
  };
}

function contextFor(data: WorkbookData, selectedRowIds: string[] = []): string {
  const indexes = buildAllIndexes(data, { defaultLanguage: 'English' });
  const diagnostics = runLint(data, indexes);
  return buildContext(data, indexes, { activeSheet: 'survey', selectedRowIds }, diagnostics, {});
}

describe('buildContext', () => {
  it('snapshots a small form', () => {
    expect(contextFor(workbook())).toMatchSnapshot();
  });

  it('snapshots a form with a selection', () => {
    expect(contextFor(workbook(), ['s2'])).toMatchSnapshot();
  });

  it('includes the header, outline, choices, and diagnostics sections', () => {
    const text = contextFor(workbook());
    expect(text).toContain('form_title: Household survey');
    expect(text).toContain('form_id: household');
    expect(text).toContain('languages: Default, Indonesian (id)');
    expect(text).toContain('1 | integer | age | Age of the respondent | household');
    expect(text).toContain('yes_no: [yes, no]');
    expect(text).toContain('lint_errors:');
  });

  it('includes selected rows in full, including localized cells', () => {
    const text = contextFor(workbook(), ['s2']);
    expect(text).toContain('selected_rows: 1');
    expect(text).toContain('survey#1');
    expect(text).toContain('label::Indonesian (id): Usia responden');
    expect(text).toContain('relevant: ${age} > 0');
  });

  it('truncates long labels to 60 characters', () => {
    const data = workbook();
    data.survey.rows[1]!.cells.label = 'x'.repeat(120);
    const text = contextFor(data);
    expect(text).toContain(`${'x'.repeat(59)}…`);
    expect(text).not.toContain('x'.repeat(61));
  });

  it('says none when there are no diagnostics or selections', () => {
    const data = workbook();
    data.survey.rows[1]!.cells.relevant = '';
    const text = contextFor(data);
    expect(text).toContain('selected_rows: none');
    expect(text).toContain('lint_errors: none');
  });

  it('keeps the reference form under the default budget and preserves errors', () => {
    const data = buildReferenceWorkbookData();
    const indexes = buildAllIndexes(data, { defaultLanguage: 'English' });
    const diagnostics = runLint(data, indexes);
    const text = buildContext(data, indexes, { activeSheet: 'survey' }, diagnostics, {});
    expect(estimateTokens(text)).toBeLessThanOrEqual(DEFAULT_CONTEXT_BUDGET);
    expect(text).toContain('outline:');
    expect(text).toContain('lint_errors:');
    // The outline must be summarized instead of listing all 2,000 rows.
    expect(text).toContain('rows in');
    expect(text.split('\n').length).toBeLessThan(600);
  });

  it('snapshots the reference form summary', () => {
    const data = buildReferenceWorkbookData();
    const indexes = buildAllIndexes(data, { defaultLanguage: 'English' });
    const diagnostics = runLint(data, indexes);
    expect(
      buildContext(data, indexes, { activeSheet: 'survey' }, diagnostics, {}),
    ).toMatchSnapshot();
  });

  it('honors a smaller budget by dropping optional blocks', () => {
    const data = buildReferenceWorkbookData();
    const indexes = buildAllIndexes(data, { defaultLanguage: 'English' });
    const diagnostics = runLint(data, indexes);
    const text = buildContext(data, indexes, { activeSheet: 'survey' }, diagnostics, {
      budgetTokens: 500,
    });
    expect(estimateTokens(text)).toBeLessThanOrEqual(500);
    expect(text).toContain('form_title:');
    expect(text).toContain('lint_errors:');
  });

  it('is deterministic', () => {
    const data = workbook();
    expect(contextFor(data, ['s2'])).toBe(contextFor(data, ['s2']));
  });
});
