import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdatesSection } from './UpdatesSection';

const check = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('UpdatesSection', () => {
  beforeEach(() => {
    check.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('rewrites missing release JSON and network errors into friendly copy', async () => {
    const user = userEvent.setup();
    render(<UpdatesSection />);

    check.mockRejectedValueOnce(new Error('Could not fetch a valid release JSON from the remote'));
    await user.click(screen.getByTestId('check-for-updates'));
    expect(await screen.findByTestId('update-status')).toHaveTextContent(
      'Could not check for updates: No published update was found yet. Check back later or verify your connection.',
    );

    check.mockRejectedValueOnce(
      new Error('error sending request for url (https://github.com/...)'),
    );
    await user.click(screen.getByTestId('check-for-updates'));
    expect(await screen.findByTestId('update-status')).toHaveTextContent(
      'Could not check for updates: Could not reach the update server. Check your internet connection and try again.',
    );
  });

  it('shows the dev-only feed note in dev and hides it in production builds', () => {
    vi.stubEnv('PROD', false);
    const { rerender } = render(<UpdatesSection />);
    expect(screen.getByTestId('updates-dev-note')).toHaveTextContent('Installed builds only');

    vi.stubEnv('PROD', true);
    rerender(<UpdatesSection />);
    expect(screen.queryByTestId('updates-dev-note')).not.toBeInTheDocument();
  });
});
