import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';
import type { WorkbookData } from '@/core/model/types';
import type { DiagnosticIssue } from '@/core/lint';
import { appCommands, PRD_SHORTCUTS } from '@/lib/appCommands';
import {
  __clearCommandsForTests,
  getCommand,
  registerCommands,
  shortcutLabel,
} from '@/lib/commands';
import { foldingCommands } from '@/features/grid/useFolding';
import { groupCommands } from '@/features/grid/useGroupCommands';
import { rowCommands } from '@/features/grid/useRowCommands';
import {
  collectChoiceLists,
  commandItems,
  filterItems,
  fuzzyScore,
  languageViewItems,
  listItems,
  parseQuery,
  problemItems,
  variableItems,
} from './sources';

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    createRow({ type: 'select_one water', name: 'hh_income', label: 'Household income' }),
    createRow({ type: 'select_one water', name: 'other_water', label: 'Other water' }),
    createRow({ type: 'text', name: 'hh_members', label: 'Household members' }),
  );
  data.choices.rows.push(
    createRow({ list_name: 'water', name: 'tap', label: 'Tap' }),
    createRow({ list_name: 'water', name: 'well', label: 'Well' }),
    createRow({ list_name: 'orphan', name: 'x', label: 'X' }),
  );
  return data;
}

describe('parseQuery (Task 5.6)', () => {
  it('recognizes each prefix', () => {
    expect(parseQuery('>save')).toEqual({ prefix: '>', term: 'save' });
    expect(parseQuery('@hh_inc')).toEqual({ prefix: '@', term: 'hh_inc' });
    expect(parseQuery('#water')).toEqual({ prefix: '#', term: 'water' });
    expect(parseQuery('!XLS-002')).toEqual({ prefix: '!', term: 'XLS-002' });
  });

  it('treats unprefixed text as a plain term', () => {
    expect(parseQuery('  hh_inc  ')).toEqual({ prefix: null, term: 'hh_inc' });
    expect(parseQuery('')).toEqual({ prefix: null, term: '' });
  });

  it('does not treat a prefix in the middle as one', () => {
    expect(parseQuery('save@home')).toEqual({ prefix: null, term: 'save@home' });
  });
});

describe('fuzzyScore (Task 5.6)', () => {
  it('scores an exact prefix highest', () => {
    expect(fuzzyScore('hh_income', 'hh_inc')).toBeGreaterThan(fuzzyScore('other', 'hh_inc'));
    expect(fuzzyScore('hh_income', 'hh_inc')).toBeGreaterThan(0);
  });

  it('matches a subsequence', () => {
    expect(fuzzyScore('hh_income', 'hhi')).toBeGreaterThan(0);
    expect(fuzzyScore('hh_income', 'xyz')).toBe(0);
  });

  it('returns 1 for an empty query', () => {
    expect(fuzzyScore('anything', '')).toBe(1);
  });
});

describe('filterItems (Task 5.6)', () => {
  const items = [
    { id: 'c', section: 'commands' as const, title: 'Save', run: () => undefined },
    { id: 'v', section: 'variables' as const, title: 'hh_income', run: () => undefined },
    { id: 'v2', section: 'variables' as const, title: 'hh_members', run: () => undefined },
    { id: 'l', section: 'lists' as const, title: 'water', run: () => undefined },
    { id: 'p', section: 'problems' as const, title: 'Duplicate name', run: () => undefined },
  ];

  it('shows everything for an empty query', () => {
    expect(filterItems(items, '')).toHaveLength(items.length);
  });

  it('narrows to variables with @', () => {
    expect(filterItems(items, '@hh').map((item) => item.id)).toEqual(['v', 'v2']);
  });

  it('narrows to commands with >', () => {
    expect(filterItems(items, '>save').map((item) => item.id)).toEqual(['c']);
  });

  it('narrows to lists with # and problems with !', () => {
    expect(filterItems(items, '#water').map((item) => item.id)).toEqual(['l']);
    expect(filterItems(items, '!dup').map((item) => item.id)).toEqual(['p']);
  });

  it('fuzzy-matches hh_inc to hh_income', () => {
    expect(filterItems(items, 'hh_inc').map((item) => item.id)).toEqual(['v']);
  });

  it('returns nothing when there is no match', () => {
    expect(filterItems(items, 'zzz')).toEqual([]);
  });
});

describe('commandItems (Task 5.6)', () => {
  it('includes the shortcut label and runs the command', () => {
    const run = vi.fn();
    const items = commandItems([
      { id: 'file.save', title: 'Save', shortcut: { code: 'KeyS', ctrlOrMeta: true }, run },
    ]);
    expect(items[0]).toMatchObject({
      title: 'Save',
      shortcut: 'Ctrl+S',
      section: 'commands',
      keywords: 'file.save',
    });
    items[0]!.run();
    expect(run).toHaveBeenCalledOnce();
  });

  it('hides commands whose `when` fails', () => {
    const items = commandItems([
      { id: 'a', title: 'A', when: () => false, run: () => undefined },
      { id: 'b', title: 'B', when: () => true, run: () => undefined },
    ]);
    expect(items.map((item) => item.title)).toEqual(['B']);
  });
});

describe('variableItems (Task 5.6)', () => {
  it('lists name, type, and label and reveals the row', () => {
    const reveal = vi.fn();
    const items = variableItems(
      [
        {
          rowId: 'r1',
          rowIndex: 0,
          name: 'hh_income',
          questionType: 'select_one',
          primaryLabel: 'Household income',
          groupPath: ['household'],
        },
      ],
      reveal,
    );
    expect(items[0]).toMatchObject({
      title: 'hh_income',
      subtitle: 'select_one · Household income',
      keywords: 'household',
    });
    items[0]!.run();
    expect(reveal).toHaveBeenCalledWith(expect.objectContaining({ rowId: 'r1' }));
  });
});

describe('collectChoiceLists (Task 5.6)', () => {
  it('dedupes lists and counts choices', () => {
    const data = workbook();
    const lists = collectChoiceLists(data);
    expect(lists.map((list) => list.name)).toEqual(['water', 'orphan']);
    const water = lists.find((list) => list.name === 'water');
    expect(water?.choiceCount).toBe(2);
    expect(water?.surveyRowId).toBe(data.survey.rows[0]?.id);
  });

  it('keeps the survey question name for search', () => {
    const data = workbook();
    const water = collectChoiceLists(data).find((list) => list.name === 'water');
    expect(water?.questionName).toBe('hh_income');
  });

  it('includes a list that only appears in a type cell', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ type: 'select_one ghost', name: 'ghost_q' }));
    const ghost = collectChoiceLists(data).find((list) => list.name === 'ghost');
    expect(ghost).toMatchObject({ choiceCount: 0, questionName: 'ghost_q' });
  });
});

describe('listItems / problemItems (Task 5.6)', () => {
  it('opens the chosen list', () => {
    const open = vi.fn();
    const items = listItems(workbook(), open);
    items[0]!.run();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ name: 'water' }));
  });

  it('lists lint problems with their rule in the subtitle', () => {
    const reveal = vi.fn();
    const issue: DiagnosticIssue = {
      ruleId: 'XLS-002',
      severity: 'error',
      sheet: 'survey',
      rowId: 'r1',
      message: 'Duplicate variable name',
    };
    const items = problemItems([issue], reveal);
    expect(items[0]).toMatchObject({
      title: 'Duplicate variable name',
      subtitle: 'XLS-002 · survey',
    });
    items[0]!.run();
    expect(reveal).toHaveBeenCalledWith(issue);
  });
});

describe('languageViewItems (Task 5.6)', () => {
  const languages = [
    {
      id: 'Default',
      name: 'Default',
      display: 'Default',
      columns: { survey: ['label'], choices: ['label'] },
    },
    {
      id: 'English (en)',
      name: 'English',
      code: 'en',
      display: 'English (en)',
      columns: { survey: ['label::English (en)'], choices: ['label::English (en)'] },
    },
  ];

  it('offers all, each language, and split', () => {
    const items = languageViewItems(languages, () => undefined);
    expect(items.map((item) => item.title)).toEqual([
      'View: All languages',
      'View: Default',
      'View: English (en)',
      'View: Translation split (Default + English (en))',
    ]);
  });

  it('applies each view payload', () => {
    const apply = vi.fn();
    const items = languageViewItems(languages, apply);
    items[0]!.run();
    items[1]!.run();
    items[3]!.run();
    expect(apply.mock.calls).toEqual([
      [{ mode: 'all', language: null, source: null, target: null }],
      [{ mode: 'single', language: 'Default', source: null, target: null }],
      [{ mode: 'split', language: null, source: 'Default', target: 'English (en)' }],
    ]);
  });

  it('omits split when only one language exists', () => {
    expect(languageViewItems([languages[0]!], () => undefined)).toHaveLength(2);
  });
});

describe('PRD shortcut registry completeness (Task 5.6)', () => {
  afterEach(() => __clearCommandsForTests());

  it('registers every PRD §6.2 shortcut with the documented keys', () => {
    registerCommands([
      ...appCommands(),
      ...rowCommands(),
      ...groupCommands(),
      ...foldingCommands(),
    ]);
    for (const entry of PRD_SHORTCUTS) {
      const command = getCommand(entry.id);
      expect(command, `missing command ${entry.id}`).toBeDefined();
      expect(shortcutLabel(command?.shortcut), entry.id).toBe(entry.keys);
    }
  });
});
