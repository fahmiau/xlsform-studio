import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { buildChoicesByList } from '@/core/indexes/choices';
import { buildVariableMap } from '@/core/indexes/variables';
import type { SheetData } from '@/core/model/types';

import { variableCompletionInfo } from './completionRender';
import { makeCompletionSource, type CompletionData } from './completions';
import { signatureDom, signatureParts } from './signatureHelp';
import { findFunction } from '@/core/xpath/functions';

const survey: SheetData = {
  sheetName: 'survey',
  columns: ['type', 'name', 'label'],
  rows: [
    { id: 'r1', cells: { type: 'text', name: 'q_name', label: 'Name' } },
    { id: 'r2', cells: { type: 'integer', name: 'age', label: 'Age' } },
    {
      id: 'r3',
      cells: { type: 'select_one marital', name: 'status', label: 'Marital status' },
    },
    {
      id: 'r4',
      cells: { type: 'select_multiple hobby', name: 'hobbies', label: 'Hobbies' },
    },
  ],
};

const choices: SheetData = {
  sheetName: 'choices',
  columns: ['list_name', 'name', 'label'],
  rows: [
    { id: 'c1', cells: { list_name: 'marital', name: 'married', label: 'Married' } },
    { id: 'c2', cells: { list_name: 'marital', name: 'single', label: 'Single' } },
    { id: 'c3', cells: { list_name: 'hobby', name: 'chess', label: 'Chess' } },
  ],
};

function data(overrides: Partial<CompletionData> = {}): CompletionData {
  return {
    variableMap: buildVariableMap(survey),
    choicesByList: buildChoicesByList(choices).byList,
    choiceNameKey: 'name',
    choiceLabelKey: 'label',
    rowIndex: 1,
    columnBase: 'relevant',
    ...overrides,
  };
}

function sourceFor(marked: string, overrides: Partial<CompletionData> = {}) {
  const cursor = marked.indexOf('|');
  const doc = marked.replace('|', '');
  const getData = () => data(overrides);
  const source = makeCompletionSource(getData);
  return {
    doc,
    cursor,
    source,
    run: (explicit = false) =>
      source(
        new CompletionContext(EditorState.create({ doc }), cursor, explicit),
      ) as CompletionResult | null,
  };
}

describe('XPath completion source (Task 4.5)', () => {
  it('lists variables with type, label, and forward-reference warnings', () => {
    const { run } = sourceFor('$|', { rowIndex: 1 });
    const result = run();
    expect(result).not.toBeNull();
    const options = result?.options ?? [];
    expect(options.map((option) => option.label)).toEqual(['q_name', 'age', 'status', 'hobbies']);
    const forward = options.find((option) => option.label === 'status');
    expect(forward?.detail).toContain('select_one');
    expect(forward?.detail).toContain('Marital status');
    expect(forward?.detail).toContain('forward');
  });

  it('excludes the current row name in relevant and constraint', () => {
    for (const columnBase of ['relevant', 'constraint']) {
      const { run } = sourceFor('$|', { currentRowName: 'age', columnBase });
      expect((run()?.options ?? []).map((option) => option.label)).not.toContain('age');
    }
    const { run } = sourceFor('$|', { currentRowName: 'age', columnBase: 'calculation' });
    expect((run()?.options ?? []).map((option) => option.label)).toContain('age');
  });

  it('filters variables by name and label', () => {
    const { run } = sourceFor('${mar|');
    expect((run()?.options ?? []).map((option) => option.label)).toEqual(['status']);
    const byLabel = sourceFor('${Hobb|').run();
    expect((byLabel?.options ?? []).map((option) => option.label)).toEqual(['hobbies']);
  });

  it('applies variable completions as ${name}', () => {
    const { run } = sourceFor('$|');
    const result = run();
    const option = result?.options[0];
    const view = new EditorView({ state: EditorState.create({ doc: '$' }) });
    const apply = option?.apply;
    expect(typeof apply).toBe('function');
    if (typeof apply === 'function') apply(view, option!, result!.from, result!.to ?? result!.from);
    expect(view.state.doc.toString()).toBe('${q_name}');
    view.destroy();
  });

  it('keeps the closing brace when completing inside ${…}', () => {
    const { run } = sourceFor('${mar|}', { currentRowName: '' });
    const result = run();
    const option = result?.options.find((candidate) => candidate.label === 'status');
    const view = new EditorView({ state: EditorState.create({ doc: '${mar}' }) });
    const apply = option?.apply;
    expect(typeof apply).toBe('function');
    if (typeof apply === 'function') apply(view, option!, 2, 5);
    expect(view.state.doc.toString()).toBe('${status}');
    view.destroy();
  });

  it('lists exactly the bound list choices with labels', () => {
    const { run } = sourceFor("selected(${status}, '|')");
    const options = run()?.options ?? [];
    expect(options.map((option) => option.label)).toEqual(['married', 'single']);
    expect(options[0]?.detail).toBe('Married');
    expect(options[1]?.detail).toBe('Single');
  });

  it('filters choice values by name and label', () => {
    const { run } = sourceFor("selected(${status}, 'mar|')");
    expect((run()?.options ?? []).map((option) => option.label)).toEqual(['married']);
    const byLabel = sourceFor("selected(${status}, 'Sing|')").run();
    expect((byLabel?.options ?? []).map((option) => option.label)).toEqual(['single']);
  });

  it('does not complete choices for non-select variables', () => {
    const { run } = sourceFor("selected(${age}, '|')");
    expect(run()).toBeNull();
  });

  it('lists functions and inserts snippets', () => {
    const { run } = sourceFor('sel|');
    const result = run();
    expect((result?.options ?? []).map((option) => option.label)).toContain('selected');
    const option = result?.options.find((candidate) => candidate.label === 'selected');
    expect(typeof option?.apply).toBe('function');
  });

  it('explicit completion at an empty position lists variables and functions', () => {
    const { run } = sourceFor('|', { currentRowName: '' });
    const options = run(true)?.options ?? [];
    expect(options.some((option) => option.label === 'q_name')).toBe(true);
    expect(options.some((option) => option.label === 'selected')).toBe(true);
  });

  it('returns null for implicit completion in plain text', () => {
    const { run } = sourceFor('plain |', { currentRowName: '' });
    expect(run()).toBeNull();
  });
});

describe('completion rendering', () => {
  it('renders the type badge, label, and forward warning', () => {
    const metadata = buildVariableMap(survey).variables.status!;
    const info = variableCompletionInfo(metadata, true);
    const dom = (info as { dom: HTMLElement }).dom;
    expect(dom.textContent).toContain('select_one');
    expect(dom.textContent).toContain('Marital status');
    expect(dom.textContent).toContain('Declared later');
    expect(dom.textContent).toContain('row 3');
  });
});

describe('signature help', () => {
  it('marks the active parameter', () => {
    const fn = findFunction('selected')!;
    const parts = signatureParts(fn, 1);
    expect(parts.params.map((param) => param.active)).toEqual([false, true]);
    const dom = signatureDom(fn, 1);
    expect(dom.querySelector('[data-active="true"]')?.textContent).toBe('value');
    expect(dom.textContent).toContain('selected(field, value)');
  });

  it('tracks optional parameters', () => {
    const fn = findFunction('substr')!;
    expect(signatureParts(fn, 2).params[2]?.text).toBe('[end]');
  });
});
