import { beforeEach, describe, expect, it } from 'vitest';

import { selectIsDirty, useWorkbookStore } from '@/state/workbookStore';

import { requestUnsavedChoice, useUnsavedGuard } from './unsavedGuard';

function markDirty() {
  useWorkbookStore.getState().apply('Edit cells', (data) => ({
    ...data,
    survey: {
      ...data.survey,
      rows: [...data.survey.rows, { id: 'dirty-row', cells: { type: 'text', name: 'q1' } }],
    },
  }));
}

describe('unsaved-changes guard (Stage 1 review m3)', () => {
  beforeEach(() => {
    useWorkbookStore.getState().newWorkbook();
    useUnsavedGuard.setState({ open: false, pending: null });
  });

  it('resolves the choice picked for a dirty document', async () => {
    markDirty();
    expect(selectIsDirty(useWorkbookStore.getState())).toBe(true);

    const choice = requestUnsavedChoice();
    expect(useUnsavedGuard.getState().open).toBe(true);
    useUnsavedGuard.getState().answer('discard');
    await expect(choice).resolves.toBe('discard');
    expect(useUnsavedGuard.getState().open).toBe(false);
    expect(useUnsavedGuard.getState().pending).toBeNull();
  });

  it.each(['save', 'cancel'] as const)('resolves "%s"', async (answer) => {
    markDirty();
    const choice = requestUnsavedChoice();
    useUnsavedGuard.getState().answer(answer);
    await expect(choice).resolves.toBe(answer);
  });

  it('cancels a pending request when a second one starts', async () => {
    const first = requestUnsavedChoice();
    const second = requestUnsavedChoice();
    await expect(first).resolves.toBe('cancel');
    useUnsavedGuard.getState().answer('save');
    await expect(second).resolves.toBe('save');
  });
});
