import { describe, expect, it } from 'vitest';

import { buildAllIndexes } from '../../indexes';
import type { ColumnKey, Row, WorkbookData } from '../../model/types';
import { createEmptyWorkbook } from '../../model/factory';
import { createLintContext } from '../context';
import type { DiagnosticIssue, LintRule } from '../types';
import { xls001 } from './xls001';
import { xls002 } from './xls002';
import { xls003 } from './xls003';
import { xls004 } from './xls004';
import { xls005 } from './xls005';
import { xls006 } from './xls006';
import { xls007 } from './xls007';
import { xls008 } from './xls008';
import { xls009 } from './xls009';
import { xls010 } from './xls010';
import { xls011 } from './xls011';

const SURVEY_COLUMNS: ColumnKey[] = [
  'type',
  'name',
  'label',
  'label::English (en)',
  'label::French (fr)',
  'hint',
  'hint::English (en)',
  'constraint_message',
  'constraint_message::English (en)',
  'relevant',
  'calculation',
  'constraint',
  'choice_filter',
  'default',
  'repeat_count',
  'required',
  'trigger',
  'note',
];

const CHOICES_COLUMNS: ColumnKey[] = ['list_name', 'name', 'label', 'label::English (en)'];

interface Fixture {
  surveyRows?: Array<Record<string, string>>;
  choicesRows?: Array<Record<string, string>>;
  settingsRows?: Array<Record<string, string>>;
  surveyColumns?: ColumnKey[];
  choicesColumns?: ColumnKey[];
  settingsColumns?: ColumnKey[];
}

function makeRows(prefix: string, cells: Array<Record<string, string>>): Row[] {
  return cells.map((entry, index) => ({ id: `${prefix}${index + 1}`, cells: { ...entry } }));
}

function workbook(fixture: Fixture = {}): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.columns = [...(fixture.surveyColumns ?? SURVEY_COLUMNS)];
  data.survey.rows = makeRows('s', fixture.surveyRows ?? []);
  data.choices.columns = [...(fixture.choicesColumns ?? CHOICES_COLUMNS)];
  data.choices.rows = makeRows('c', fixture.choicesRows ?? []);
  if (fixture.settingsColumns) data.settings.columns = [...fixture.settingsColumns];
  else
    data.settings.columns = [
      'form_title',
      'form_id',
      'version',
      'default_language',
      'style',
      'instance_name',
      'allow_choice_duplicates',
    ];
  if (fixture.settingsRows) data.settings.rows = makeRows('t', fixture.settingsRows);
  return data;
}

function lint(rule: LintRule, data: WorkbookData): DiagnosticIssue[] {
  const indexes = buildAllIndexes(data);
  return rule.run(createLintContext(data, indexes));
}

function positive(
  rule: LintRule,
  fixture: Fixture,
  expected: number,
  matcher?: (issues: DiagnosticIssue[]) => void,
): void {
  const issues = lint(rule, workbook(fixture));
  expect(issues, `${rule.id} should report ${expected}`).toHaveLength(expected);
  expect(issues.every((issue) => issue.ruleId === rule.id)).toBe(true);
  matcher?.(issues);
}

function negative(rule: LintRule, fixture: Fixture): void {
  expect(lint(rule, workbook(fixture))).toEqual([]);
}

describe('XLS-001 missing or invalid name', () => {
  const cases: Array<[string, Record<string, string>, RegExp]> = [
    ['empty name', { type: 'text', name: '' }, /missing a name/],
    ['leading digit', { type: 'integer', name: '1age' }, /must not start/],
    ['leading hyphen', { type: 'text', name: '-age' }, /must not start/],
    ['leading period', { type: 'text', name: '.age' }, /must not start/],
    ['space in name', { type: 'text', name: 'my age' }, /outside/],
    ['slash in name', { type: 'select_one l', name: 'a/b' }, /outside/],
    ['group without name', { type: 'begin_group' }, /missing a name/],
  ];
  it.each(cases)('flags %s', (_label, row, pattern) => {
    positive(xls001, { surveyRows: [row] }, 1, (issues) => {
      expect(issues[0]?.message).toMatch(pattern);
    });
  });

  it('accepts valid names and rows that do not declare a variable', () => {
    negative(xls001, {
      surveyRows: [
        { type: 'text', name: 'age' },
        { type: 'text', name: '_age' },
        { type: 'text', name: 'a.b' },
        { type: 'text', name: 'a-b' },
        { type: 'note' },
        { type: 'end_group' },
        { type: 'start' },
        { type: 'mystery' },
      ],
    });
  });
});

describe('XLS-002 duplicate name', () => {
  it('reports errors on every exact duplicate occurrence', () => {
    positive(
      xls002,
      {
        surveyRows: [
          { type: 'text', name: 'age' },
          { type: 'text', name: 'age' },
          { type: 'text', name: 'age' },
        ],
      },
      3,
      (issues) => {
        expect(issues.every((issue) => issue.severity === 'error')).toBe(true);
        expect(issues[0]?.message).toMatch(/also on row 2, row 3/);
        expect((issues[0]?.data?.relatedRowIds as string[]).length).toBe(2);
      },
    );
  });

  it('warns once per row when names differ only by case', () => {
    positive(
      xls002,
      {
        surveyRows: [
          { type: 'text', name: 'Age' },
          { type: 'text', name: 'age' },
        ],
      },
      2,
      (issues) => {
        expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
        expect(issues[0]?.message).toMatch(/differs only by case/);
      },
    );
  });

  it('warns for three case variants', () => {
    positive(
      xls002,
      {
        surveyRows: [
          { type: 'text', name: 'AGE' },
          { type: 'text', name: 'age' },
          { type: 'text', name: 'Age' },
        ],
      },
      3,
      (issues) => expect(issues.every((issue) => issue.severity === 'warning')).toBe(true),
    );
  });

  it('reports duplicates across question kinds and groups', () => {
    positive(
      xls002,
      {
        surveyRows: [
          { type: 'begin_group', name: 'grp' },
          { type: 'integer', name: 'grp' },
          { type: 'end_group' },
        ],
      },
      2,
    );
  });

  it('accepts unique names and ignores empty names', () => {
    negative(xls002, {
      surveyRows: [
        { type: 'text', name: 'age' },
        { type: 'text', name: 'name' },
        { type: 'note' },
        { type: 'text', name: '' },
      ],
    });
  });
});

describe('XLS-003 unbalanced groups', () => {
  it('flags an unclosed begin_group', () => {
    positive(xls003, { surveyRows: [{ type: 'begin_group', name: 'g' }] }, 1, (issues) => {
      expect(issues[0]?.message).toMatch(/never closed/);
    });
  });

  it('flags an unclosed begin_repeat', () => {
    positive(xls003, { surveyRows: [{ type: 'begin_repeat', name: 'r' }] }, 1);
  });

  it('flags an orphan end_group', () => {
    positive(xls003, { surveyRows: [{ type: 'end_group' }] }, 1, (issues) => {
      expect(issues[0]?.message).toMatch(/no matching/);
    });
  });

  it('flags an orphan end_repeat', () => {
    positive(xls003, { surveyRows: [{ type: 'end_repeat' }] }, 1);
  });

  it('flags a mismatched end type and the unclosed begin', () => {
    positive(
      xls003,
      {
        surveyRows: [{ type: 'begin_group', name: 'g' }, { type: 'end_repeat' }],
      },
      2,
      (issues) => {
        expect(issues.some((issue) => /does not match/.test(issue.message))).toBe(true);
        expect(issues.some((issue) => /never closed/.test(issue.message))).toBe(true);
      },
    );
  });

  it('accepts balanced groups, repeats, and non-structural rows', () => {
    negative(xls003, {
      surveyRows: [
        { type: 'begin_group', name: 'g' },
        { type: 'begin_repeat', name: 'r' },
        { type: 'text', name: 'q' },
        { type: 'end_repeat' },
        { type: 'end_group' },
        { type: 'note' },
      ],
    });
  });
});

describe('XLS-004 undefined variable', () => {
  const report = (extension: Record<string, string>) =>
    positive(xls004, { surveyRows: [{ type: 'text', name: 'q', ...extension }] }, 1, (issues) => {
      expect(issues[0]?.range).toEqual({ from: 0, to: 10 });
      expect(issues[0]?.message).toMatch(/\$\{missing\}/);
    });

  it('checks relevant', () => report({ relevant: '${missing}' }));
  it('checks calculation', () => report({ calculation: '${missing}' }));
  it('checks constraint', () => report({ constraint: '${missing}' }));
  it('checks choice_filter', () => report({ choice_filter: '${missing}' }));
  it('checks default', () => report({ default: '${missing}' }));
  it('checks repeat_count', () => report({ repeat_count: '${missing}' }));
  it('checks plain and localized labels, hints, and messages', () => {
    positive(
      xls004,
      {
        surveyRows: [
          { type: 'text', name: 'a', label: '${missing}' },
          { type: 'text', name: 'b', 'label::English (en)': '${missing}' },
          { type: 'text', name: 'c', hint: '${missing}' },
          { type: 'text', name: 'd', 'hint::English (en)': '${missing}' },
          { type: 'text', name: 'e', constraint_message: '${missing}' },
          { type: 'text', name: 'f', 'constraint_message::English (en)': '${missing}' },
        ],
      },
      6,
    );
  });

  it('checks settings.instance_name', () => {
    positive(
      xls004,
      { settingsRows: [{ form_title: 'T', form_id: 'f', instance_name: '${missing}' }] },
      1,
      (issues) => {
        expect(issues[0]?.sheet).toBe('settings');
        expect(issues[0]?.column).toBe('instance_name');
      },
    );
  });

  it('accepts defined variables and group names', () => {
    negative(xls004, {
      surveyRows: [
        { type: 'begin_group', name: 'grp' },
        { type: 'text', name: 'q', relevant: '${grp} = 1 and ${q2} > 0' },
        { type: 'text', name: 'q2', label: '${q}' },
        { type: 'end_group' },
      ],
      settingsRows: [{ form_id: 'f', instance_name: '${q}' }],
    });
  });

  it('ignores references in non-expression columns', () => {
    negative(xls004, {
      surveyRows: [{ type: 'text', name: 'q', note: '${missing}', appearance: '${missing}' }],
    });
  });
});

describe('XLS-005 forward reference', () => {
  const forward = (extension: Record<string, string>) =>
    positive(
      xls005,
      {
        surveyRows: [
          { type: 'text', name: 'q1', ...extension },
          { type: 'text', name: 'q2' },
        ],
      },
      1,
      (issues) => expect(issues[0]?.severity).toBe('warning'),
    );

  it('warns from relevant', () => forward({ relevant: '${q2}' }));
  it('warns from calculation', () => forward({ calculation: '${q2}' }));
  it('warns from constraint', () => forward({ constraint: '${q2}' }));
  it('warns from choice_filter', () => forward({ choice_filter: '${q2}' }));
  it('warns from default', () => forward({ default: '${q2}' }));
  it('warns from repeat_count', () => forward({ repeat_count: '${q2}' }));

  it('accepts backward, self, non-XPath, and undefined references', () => {
    negative(xls005, {
      surveyRows: [
        { type: 'text', name: 'q1' },
        { type: 'text', name: 'q2', relevant: '${q1}', label: '${q3}', calculation: '${q2}' },
        { type: 'text', name: 'q3' },
      ],
    });
  });
});

describe('XLS-006 missing or empty list', () => {
  it('flags select_one without a list', () => {
    positive(xls006, { surveyRows: [{ type: 'select_one', name: 'q' }] }, 1, (issues) => {
      expect(issues[0]?.message).toMatch(/missing a list_name/);
    });
  });

  it('flags select_multiple without a list', () => {
    positive(xls006, { surveyRows: [{ type: 'select_multiple', name: 'q' }] }, 1);
  });

  it('flags rank without a list', () => {
    positive(xls006, { surveyRows: [{ type: 'rank', name: 'q' }] }, 1);
  });

  it('flags a list with no choices rows', () => {
    positive(
      xls006,
      {
        surveyRows: [{ type: 'select_one missing', name: 'q' }],
        choicesRows: [{ list_name: 'other', name: 'a', label: 'A' }],
      },
      1,
      (issues) => {
        expect(issues[0]?.message).toMatch(/no rows/);
        expect(issues[0]?.range).toEqual({ from: 11, to: 18 });
      },
    );
  });

  it('flags an empty list', () => {
    positive(
      xls006,
      {
        surveyRows: [
          { type: 'select_one a', name: 'q1' },
          { type: 'select_multiple b', name: 'q2' },
        ],
      },
      2,
    );
  });

  it('accepts populated lists and file-backed selects', () => {
    negative(xls006, {
      surveyRows: [
        { type: 'select_one a', name: 'q1' },
        { type: 'select_multiple a', name: 'q2' },
        { type: 'rank a', name: 'q3' },
        { type: 'select_one_from_file people.csv', name: 'q4' },
        { type: 'select_multiple_from_file people.csv', name: 'q5' },
        { type: 'text', name: 'q6' },
      ],
      choicesRows: [{ list_name: 'a', name: 'one', label: 'One' }],
    });
  });
});

describe('XLS-007 duplicate choice name', () => {
  it('flags exact duplicates in a list', () => {
    positive(
      xls007,
      {
        choicesRows: [
          { list_name: 'a', name: 'yes' },
          { list_name: 'a', name: 'yes' },
        ],
      },
      2,
      (issues) => expect(issues[0]?.message).toMatch(/Duplicate choice name/),
    );
  });

  it('flags three duplicates', () => {
    positive(
      xls007,
      {
        choicesRows: [
          { list_name: 'a', name: 'yes' },
          { list_name: 'a', name: 'yes' },
          { list_name: 'a', name: 'yes' },
        ],
      },
      3,
    );
  });

  it('flags trimmed duplicates', () => {
    positive(
      xls007,
      {
        choicesRows: [
          { list_name: 'a', name: 'yes ' },
          { list_name: 'a', name: 'yes' },
        ],
      },
      2,
    );
  });

  it('flags duplicates in separate lists independently', () => {
    positive(
      xls007,
      {
        choicesRows: [
          { list_name: 'a', name: 'yes' },
          { list_name: 'a', name: 'yes' },
          { list_name: 'b', name: 'no' },
          { list_name: 'b', name: 'no' },
        ],
      },
      4,
    );
  });

  it('flags a duplicate when allow_choice_duplicates is no', () => {
    positive(
      xls007,
      {
        choicesRows: [
          { list_name: 'a', name: 'yes' },
          { list_name: 'a', name: 'yes' },
        ],
        settingsRows: [{ form_id: 'f', allow_choice_duplicates: 'no' }],
      },
      2,
    );
  });

  it('accepts unique names, different lists, and enabled duplicates', () => {
    negative(xls007, {
      choicesRows: [
        { list_name: 'a', name: 'yes' },
        { list_name: 'b', name: 'yes' },
      ],
    });
    negative(xls007, {
      choicesRows: [
        { list_name: 'a', name: 'yes' },
        { list_name: 'a', name: 'yes' },
      ],
      settingsRows: [{ form_id: 'f', allow_choice_duplicates: 'yes' }],
    });
    negative(xls007, {
      choicesRows: [
        { list_name: 'a', name: 'yes' },
        { list_name: 'a', name: 'yes' },
      ],
      settingsRows: [{ form_id: 'f', allow_choice_duplicates: 'TRUE' }],
    });
  });
});

describe('XLS-008 XPath syntax errors', () => {
  it('flags an unbalanced paren', () => {
    positive(xls008, { surveyRows: [{ type: 'text', name: 'q', relevant: '(a' }] }, 1, (issues) => {
      expect(issues[0]?.message).toMatch(/Unbalanced/);
    });
  });

  it('flags an unclosed string', () => {
    positive(
      xls008,
      { surveyRows: [{ type: 'text', name: 'q', calculation: "'unclosed" }] },
      1,
      (issues) => expect(issues[0]?.message).toMatch(/Unclosed string/),
    );
  });

  it('flags an unclosed variable reference', () => {
    positive(
      xls008,
      { surveyRows: [{ type: 'text', name: 'q', constraint: '${a' }] },
      1,
      (issues) => expect(issues[0]?.message).toMatch(/Unclosed \$\{/),
    );
  });

  it('flags an unbalanced paren in choice_filter', () => {
    positive(
      xls008,
      { surveyRows: [{ type: 'select_one l', name: 'q', choice_filter: '((a)' }] },
      1,
    );
  });

  it('reports multiple errors in one cell', () => {
    positive(
      xls008,
      { surveyRows: [{ type: 'text', name: 'q', relevant: "(a and 'x) or ${b" }] },
      2,
    );
  });

  it('accepts valid expressions, empty cells, and non-syntax columns', () => {
    negative(xls008, {
      surveyRows: [
        { type: 'text', name: 'q1', relevant: '(${a} >= 18) and selected(${b}, "x")' },
        { type: 'text', name: 'q2', relevant: '' },
        { type: 'text', name: 'q3', default: '(a' },
        { type: 'text', name: 'q4', label: "'unclosed" },
      ],
    });
  });
});

describe('XLS-009 calculate without calculation', () => {
  it('flags an empty calculation', () => {
    positive(xls009, { surveyRows: [{ type: 'calculate', name: 'c' }] }, 1, (issues) => {
      expect(issues[0]?.message).toMatch(/empty calculation/);
    });
  });

  it('flags a whitespace-only calculation', () => {
    positive(xls009, { surveyRows: [{ type: 'calculate', name: 'c', calculation: '  ' }] }, 1);
  });

  it('flags each calculate row', () => {
    positive(
      xls009,
      {
        surveyRows: [
          { type: 'calculate', name: 'c1' },
          { type: 'calculate', name: 'c2' },
        ],
      },
      2,
    );
  });

  it('flags a calculate row with no calculation column', () => {
    positive(
      xls009,
      {
        surveyColumns: ['type', 'name', 'label'],
        surveyRows: [{ type: 'calculate', name: 'c' }],
      },
      1,
    );
  });

  it('accepts calculate rows with an expression and other rows', () => {
    negative(xls009, {
      surveyRows: [
        { type: 'calculate', name: 'c', calculation: '0' },
        { type: 'text', name: 'q' },
        { type: 'hidden', name: 'h' },
      ],
    });
  });
});

describe('XLS-010 missing label', () => {
  it('warns for visible questions without a label', () => {
    positive(
      xls010,
      {
        surveyRows: [
          { type: 'text', name: 'q1' },
          { type: 'integer', name: 'q2' },
          { type: 'begin_group', name: 'g' },
          { type: 'select_one l', name: 'q3' },
          { type: 'dateTime', name: 'q4' },
        ],
      },
      5,
      (issues) => expect(issues.every((issue) => issue.severity === 'warning')).toBe(true),
    );
  });

  it('uses the default-language label column', () => {
    positive(
      xls010,
      {
        surveyRows: [
          {
            type: 'text',
            name: 'q',
            label: '',
            'label::English (en)': 'English',
            'label::French (fr)': '',
          },
        ],
        settingsRows: [{ form_id: 'f', default_language: 'French (fr)' }],
      },
      1,
      (issues) => expect(issues[0]?.column).toBe('label::French (fr)'),
    );
  });

  it('accepts labels, metadata, and exempt types', () => {
    negative(xls010, {
      surveyRows: [
        { type: 'text', name: 'q', label: 'Q' },
        { type: 'calculate', name: 'c' },
        { type: 'hidden', name: 'h' },
        { type: 'start' },
        { type: 'end' },
        { type: 'today', name: 't' },
        { type: 'deviceid', name: 'd' },
        { type: 'username', name: 'u' },
        { type: 'phonenumber', name: 'p' },
        { type: 'email', name: 'e' },
        { type: 'audit' },
        { type: 'end_group' },
        { type: 'end_repeat' },
      ],
    });
  });

  it('accepts English labels when that is the default language', () => {
    negative(xls010, {
      surveyRows: [
        {
          type: 'text',
          name: 'q',
          label: '',
          'label::English (en)': 'English',
          'label::French (fr)': '',
        },
      ],
      settingsRows: [{ form_id: 'f', default_language: 'English (en)' }],
    });
  });

  it('does not flag a sheet that has no label column', () => {
    negative(xls010, {
      surveyColumns: ['type', 'name', 'relevant'],
      surveyRows: [{ type: 'text', name: 'q' }],
    });
  });
});

describe('XLS-011 invalid choice literal', () => {
  const withChoice = (expression: Record<string, string>) => ({
    surveyRows: [
      { type: 'select_one marital', name: 'status' },
      { type: 'text', name: 'q', ...expression },
    ],
    choicesRows: [
      { list_name: 'marital', name: 'married', label: 'Married' },
      { list_name: 'marital', name: 'single', label: 'Single' },
    ],
  });

  it('flags a selected() value missing from the list', () => {
    positive(xls011, withChoice({ relevant: "selected(${status}, 'divorced')" }), 1, (issues) => {
      expect(issues[0]?.severity).toBe('warning');
      expect(issues[0]?.message).toMatch(/divorced/);
      expect(issues[0]?.range).toEqual({ from: 21, to: 29 });
    });
  });

  it('flags equality and inequality literals', () => {
    positive(xls011, withChoice({ relevant: "${status} = 'divorced'" }), 1);
    positive(xls011, withChoice({ constraint: "${status} != 'divorced'" }), 1);
  });

  it('flags swapped operands and double quotes', () => {
    positive(xls011, withChoice({ relevant: "'divorced' = ${status}" }), 1);
    positive(xls011, withChoice({ relevant: '${status} = "divorced"' }), 1);
  });

  it('reports every invalid reference in a cell', () => {
    positive(
      xls011,
      withChoice({ relevant: "selected(${status}, 'a') or selected(${status}, 'b')" }),
      2,
    );
  });

  it('accepts valid values and ignores unresolved patterns', () => {
    negative(xls011, withChoice({ relevant: "selected(${status}, 'married')" }));
    negative(xls011, withChoice({ relevant: "${status} = 'single'" }));
    negative(xls011, withChoice({ relevant: "selected(${unknown}, 'x')" }));
    negative(xls011, withChoice({ relevant: "selected-at(${status}, 'x')" }));
    negative(xls011, withChoice({ relevant: "jr:choice-name('x', 'status')" }));
    negative(xls011, withChoice({ relevant: "${status} = ''" }));
  });

  it('ignores selects whose list has no rows (XLS-006 reports those)', () => {
    negative(xls011, {
      surveyRows: [
        { type: 'select_one empty', name: 'status' },
        { type: 'text', name: 'q', relevant: "selected(${status}, 'x')" },
      ],
      choicesRows: [],
    });
  });
});
