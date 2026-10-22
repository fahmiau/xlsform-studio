import { describe, expect, it } from 'vitest';

import { isCellEditable, rowTintKind, structuralRowKind } from './editability';

describe('cell editability (Task 2.3)', () => {
  it('detects structural rows', () => {
    expect(structuralRowKind('begin_group')).toBe('begin_group');
    expect(structuralRowKind('begin_repeat')).toBe('begin_repeat');
    expect(structuralRowKind('end_group')).toBe('end_group');
    expect(structuralRowKind('end_repeat')).toBe('end_repeat');
    expect(structuralRowKind('select_one list')).toBeNull();
    expect(structuralRowKind('')).toBeNull();
  });

  it('disables logic columns on end rows only', () => {
    for (const column of ['relevant', 'constraint', 'calculation', 'required']) {
      expect(isCellEditable('end_group', column), column).toBe(false);
      expect(isCellEditable('end_repeat', column), column).toBe(false);
      expect(isCellEditable('text', column), column).toBe(true);
      expect(isCellEditable('begin_group', column), column).toBe(true);
    }
  });

  it('keeps label, name, and type editable on end rows', () => {
    for (const column of ['type', 'name', 'label', 'hint', 'appearance']) {
      expect(isCellEditable('end_group', column), column).toBe(true);
    }
  });

  it('resolves aliases and mixed case before applying the rule', () => {
    expect(isCellEditable('end_group', 'ReLeVaNt')).toBe(false);
    expect(isCellEditable('end_group', 'constraint message')).toBe(true);
  });

  it('classifies tint kinds', () => {
    expect(rowTintKind('begin_group')).toBe('begin');
    expect(rowTintKind('begin_repeat')).toBe('begin');
    expect(rowTintKind('end_repeat')).toBe('end');
    expect(rowTintKind('text')).toBeNull();
  });
});
