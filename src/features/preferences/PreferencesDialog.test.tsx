import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePrefsStore } from '@/state/prefsStore';

import { PreferencesDialog } from './PreferencesDialog';

async function choose(testId: string, name: string) {
  const user = userEvent.setup();
  const trigger = screen.getByTestId(testId);
  expect(trigger).toHaveAttribute('role', 'combobox');
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name }));
}

describe('PreferencesDialog selects (Task 5.7)', () => {
  beforeEach(() => {
    localStorage.clear();
    usePrefsStore.setState({ theme: 'system', defaultSlugMode: 'snake' });
  });

  it('commits the theme select', async () => {
    render(<PreferencesDialog open onOpenChange={() => undefined} />);
    await choose('pref-theme', 'Dark');
    expect(usePrefsStore.getState().theme).toBe('dark');
  });

  it('commits the new list naming select', async () => {
    render(<PreferencesDialog open onOpenChange={() => undefined} />);
    await choose('pref-slug-mode', 'camelCase');
    expect(usePrefsStore.getState().defaultSlugMode).toBe('camel');
  });
});
