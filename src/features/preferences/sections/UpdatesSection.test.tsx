import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdatesSection } from './UpdatesSection';

const check = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('UpdatesSection (docs/releasing.md A5)', () => {
  beforeEach(() => {
    check.mockReset();
  });

  it('reports that the installed build is current', async () => {
    check.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<UpdatesSection />);

    await user.click(screen.getByTestId('check-for-updates'));

    expect(await screen.findByTestId('update-status')).toHaveTextContent('newest version');
  });

  it('downloads and installs an available update', async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    check.mockResolvedValue({ version: '1.0.1', downloadAndInstall });
    const user = userEvent.setup();
    render(<UpdatesSection />);

    await user.click(screen.getByTestId('check-for-updates'));

    expect(await screen.findByTestId('update-status')).toHaveTextContent('1.0.1 installed');
    expect(downloadAndInstall).toHaveBeenCalledOnce();
  });

  it('surfaces a failed check instead of a silent no-op', async () => {
    check.mockRejectedValue(new Error('updater is not supported in development'));
    const user = userEvent.setup();
    render(<UpdatesSection />);

    await user.click(screen.getByTestId('check-for-updates'));

    expect(await screen.findByTestId('update-status')).toHaveTextContent(
      'updater is not supported in development',
    );
    // The button must come back so the user can retry.
    expect(screen.getByTestId('check-for-updates')).toBeEnabled();
  });
});
