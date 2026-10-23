import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '../model/factory';
import type { WorkbookData } from '../model/types';
import {
  countVariableUses,
  renameVariable,
  replaceInterpolations,
  replaceTriggerTokens,
  replaceVarRefs,
} from './renameVariable';

function workbook(): WorkbookData {
  const data = createEmptyWorkbook();
  data.survey.columns.push(
    'required_message',
    'trigger',
    'label::English (en)',
    'hint::English (en)',
    'constraint_message::English (en)',
    'required_message::English (en)',
  );
  return data;
}

function surveyRow(data: WorkbookData, index: number) {
  return data.survey.rows[index]!;
}

describe('replaceVarRefs (Task 5.1)', () => {
  it('rewrites a single reference', () => {
    expect(replaceVarRefs("${old} = 'x'", 'old', 'new')).toBe("${new} = 'x'");
  });

  it('keeps inner whitespace formatting', () => {
    expect(replaceVarRefs('${  old  } + 1', 'old', 'new')).toBe('${  new  } + 1');
  });

  it('rewrites every matching reference in one string', () => {
    expect(replaceVarRefs('${old} + ${old}', 'old', 'new')).toBe('${new} + ${new}');
  });

  it('handles names with regex metacharacters', () => {
    expect(replaceVarRefs('${a.b} + ${a-b}', 'a.b', 'c.d')).toBe('${c.d} + ${a-b}');
  });

  it('excludes a longer name with the same prefix', () => {
    expect(replaceVarRefs('${old_var} ${old_var_2}', 'old_var', 'new')).toBe('${new} ${old_var_2}');
  });

  it('leaves unclosed references untouched', () => {
    expect(replaceVarRefs('${old', 'old', 'new')).toBe('${old');
  });

  it('returns the same string when nothing matches', () => {
    const source = '${other}';
    expect(replaceVarRefs(source, 'old', 'new')).toBe(source);
  });
});

describe('plain-text helpers (Task 5.1)', () => {
  it('rescapes regex characters in prose', () => {
    expect(replaceInterpolations('Value of ${a.b} and ${a.b_2}', 'a.b', 'c')).toBe(
      'Value of ${c} and ${a.b_2}',
    );
  });

  it('leaves prose without interpolation untouched', () => {
    expect(replaceInterpolations('No refs', 'old', 'new')).toBe('No refs');
  });

  it('rewrites space-separated trigger tokens only', () => {
    expect(replaceTriggerTokens('calc_a old calc_b', 'old', 'new')).toBe('calc_a new calc_b');
    expect(replaceTriggerTokens('older old_2', 'old', 'new')).toBe('older old_2');
  });
});

describe('countVariableUses (Task 5.1)', () => {
  it('counts rows sharing a name', () => {
    const data = workbook();
    data.survey.rows.push(
      createRow({ name: 'dup' }),
      createRow({ name: 'dup' }),
      createRow({ name: 'unique' }),
    );
    expect(countVariableUses(data, 'dup')).toBe(2);
    expect(countVariableUses(data, 'unique')).toBe(1);
    expect(countVariableUses(data, 'missing')).toBe(0);
  });
});

describe('renameVariable (Task 5.1)', () => {
  it('rewrites relevant', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', relevant: '${old} = 1' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.relevant).toBe('${new} = 1');
    expect(result.changes).toHaveLength(1);
  });

  it('rewrites calculation', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', calculation: '${old} * 2' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.calculation).toBe('${new} * 2');
  });

  it('rewrites constraint', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', constraint: '. < ${old}' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.constraint).toBe('. < ${new}');
  });

  it('rewrites choice_filter', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', choice_filter: 'x = ${old}' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.choice_filter).toBe('x = ${new}');
  });

  it('rewrites default', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', default: '${old}' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.default).toBe('${new}');
  });

  it('rewrites repeat_count', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', repeat_count: '${old} + 1' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.repeat_count).toBe('${new} + 1');
  });

  it('rewrites required expressions', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', required: '${old} > 0' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.required).toBe('${new} > 0');
  });

  it('rewrites trigger tokens', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', trigger: 'calc_a old' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.trigger).toBe('calc_a new');
  });

  it('rewrites label interpolations', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', label: 'Value: ${old}' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.label).toBe('Value: ${new}');
  });

  it('rewrites hint interpolations', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', hint: 'See ${old}' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.hint).toBe('See ${new}');
  });

  it('rewrites constraint_message interpolations', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', constraint_message: 'Must match ${old}' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.constraint_message).toBe('Must match ${new}');
  });

  it('rewrites required_message interpolations', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', required_message: 'Required: ${old}' }));
    const result = renameVariable(data, 'old', 'new');
    expect(surveyRow(result.data, 0).cells.required_message).toBe('Required: ${new}');
  });

  it('rewrites every localized label variant', () => {
    const data = workbook();
    data.survey.rows.push(
      createRow({
        name: 'old',
        'label::English (en)': 'English ${old}',
        'hint::English (en)': 'Hint ${old}',
        'constraint_message::English (en)': 'Message ${old}',
        'required_message::English (en)': 'Required ${old}',
      }),
    );
    const result = renameVariable(data, 'old', 'new');
    const row = surveyRow(result.data, 0);
    expect(row.cells['label::English (en)']).toBe('English ${new}');
    expect(row.cells['hint::English (en)']).toBe('Hint ${new}');
    expect(row.cells['constraint_message::English (en)']).toBe('Message ${new}');
    expect(row.cells['required_message::English (en)']).toBe('Required ${new}');
  });

  it('rewrites choice label interpolations', () => {
    const data = workbook();
    data.choices.rows.push(createRow({ list_name: 'l', name: 'c', label: '${old} choice' }));
    const result = renameVariable(data, 'old', 'new');
    expect(result.data.choices.rows[0]!.cells.label).toBe('${new} choice');
    expect(result.changes[0]?.sheet).toBe('choices');
  });

  it('rewrites settings.instance_name', () => {
    const data = workbook();
    data.settings.rows[0]!.cells.instance_name = '${old}';
    const result = renameVariable(data, 'old', 'new');
    expect(result.data.settings.rows[0]!.cells.instance_name).toBe('${new}');
    expect(result.changes[0]?.sheet).toBe('settings');
  });

  it('handles a name containing a dot', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old.var', relevant: '${old.var} = 1' }));
    const result = renameVariable(data, 'old.var', 'new.var');
    expect(surveyRow(result.data, 0).cells.relevant).toBe('${new.var} = 1');
  });

  it('handles a name containing a hyphen', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old-var', relevant: '${old-var} = 1' }));
    const result = renameVariable(data, 'old-var', 'new-var');
    expect(surveyRow(result.data, 0).cells.relevant).toBe('${new-var} = 1');
  });

  it('does not touch a longer variable name', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old_var', relevant: '${old_var} + ${old_var_2}' }));
    const result = renameVariable(data, 'old_var', 'renamed');
    expect(surveyRow(result.data, 0).cells.relevant).toBe('${renamed} + ${old_var_2}');
  });

  it('leaves ${…} inside an XPath string literal alone (R10)', () => {
    const data = workbook();
    data.survey.rows.push(
      createRow({
        name: 'old_var',
        calculation: "concat('literal ${old_var}', ${old_var})",
      }),
    );
    const result = renameVariable(data, 'old_var', 'new_var');
    expect(surveyRow(result.data, 0).cells.calculation).toBe(
      "concat('literal ${old_var}', ${new_var})",
    );
  });

  it('rewrites several rows and reports each change', () => {
    const data = workbook();
    data.survey.rows.push(
      createRow({ name: 'a', relevant: '${old} = 1' }),
      createRow({ name: 'b', calculation: '${old} + 1' }),
    );
    const result = renameVariable(data, 'old', 'new');
    expect(result.changes).toHaveLength(2);
    expect(result.changes.map((change) => change.column)).toEqual(['relevant', 'calculation']);
  });

  it('is a no-op for the same or an empty name', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', relevant: '${old}' }));
    expect(renameVariable(data, 'old', 'old').data).toBe(data);
    expect(renameVariable(data, '', 'new').data).toBe(data);
    expect(renameVariable(data, 'old', '  ').data).toBe(data);
  });

  it('does not mutate the input workbook', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', relevant: '${old}' }));
    renameVariable(data, 'old', 'new');
    expect(surveyRow(data, 0).cells.relevant).toBe('${old}');
  });

  it('returns the same data object when nothing changed', () => {
    const data = workbook();
    data.survey.rows.push(createRow({ name: 'old', relevant: '${other}' }));
    expect(renameVariable(data, 'old', 'new').data).toBe(data);
  });
});
