import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '../model/factory';
import { buildAllIndexes } from './index';
import { buildRowIndex } from './rowIndex';

describe('buildRowIndex', () => {
  it('maps row ids to positions', () => {
    const rows = [createRow({ name: 'a' }), createRow({ name: 'b' })];
    const index = buildRowIndex({ sheetName: 'survey', columns: ['name'], rows });
    expect(index.get(rows[0]!.id)).toBe(0);
    expect(index.get(rows[1]!.id)).toBe(1);
    expect(index.size).toBe(2);
  });
});

describe('buildAllIndexes', () => {
  it('composes every index', () => {
    const data = createEmptyWorkbook();
    data.survey.rows.push(
      createRow({ type: 'begin_group', name: 'g', label: 'Group' }),
      createRow({ type: 'select_one yes_no', name: 'q', label: 'Q' }),
      createRow({ type: 'end_group' }),
    );
    data.choices.rows.push(createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }));

    const indexes = buildAllIndexes(data);
    expect(Object.keys(indexes.variables.variables)).toEqual(['g', 'q']);
    expect(indexes.choices.byList.yes_no).toHaveLength(1);
    expect(indexes.choices.listUsage.yes_no).toEqual([data.survey.rows[1]?.id]);
    expect(indexes.groups.roots).toHaveLength(1);
    expect(indexes.rowIndexes.survey.get(data.survey.rows[1]!.id)).toBe(1);
    expect(indexes.rowIndexes.settings.size).toBe(1);
  });
});
