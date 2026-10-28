import { describe, expect, it } from 'vitest';

import { choiceNameRenderer, makeChoiceNameCell } from './ChoiceNameCell';
import { enumRenderer, makeEnumCell } from './EnumCell';
import { makeXPathCell, xpathRenderer } from './XPathCell';

/** Plain Delete hands Glide an empty copy of the custom cell (C1). */
describe('custom cell delete', () => {
  it('clears an XPath cell and keeps its kind', () => {
    const cell = makeXPathCell({ value: '${age} > 5', rowId: 'row-a', column: 'relevant' });
    const cleared = xpathRenderer.onDelete?.(cell);
    expect(cleared?.copyData).toBe('');
    expect(cleared?.data).toMatchObject({ kind: 'xlsform-xpath', value: '', rowId: 'row-a' });
  });

  it('clears an enum cell without dropping the choice-count badge data', () => {
    const cell = makeEnumCell({ column: 'type', value: 'select_one yes_no', rowId: 'row-a' });
    const cleared = enumRenderer.onDelete?.(cell);
    expect(cleared?.copyData).toBe('');
    expect(cleared?.data).toMatchObject({ kind: 'xlsform-enum', value: '', column: 'type' });
  });

  it('clears a choice name cell and keeps the lock flag', () => {
    const cell = makeChoiceNameCell({ value: 'yes', locked: true, rowId: 'choice-a' });
    const cleared = choiceNameRenderer.onDelete?.(cell);
    expect(cleared?.copyData).toBe('');
    expect(cleared?.data).toMatchObject({ kind: 'xlsform-choice-name', value: '', locked: true });
  });
});
