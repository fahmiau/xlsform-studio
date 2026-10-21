import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const appInfo = vi.fn();
vi.mock('@/ipc/bindings', () => ({
  commands: {
    appInfo: () => appInfo(),
  },
}));

const { StatusBar } = await import('./StatusBar');

describe('StatusBar', () => {
  it('renders the version reported by the Rust command', async () => {
    appInfo.mockResolvedValueOnce({ version: '0.1.0', platform: 'windows', arch: 'x86_64' });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

    render(<StatusBar />);

    await waitFor(() => expect(screen.getByTestId('app-version')).toHaveTextContent('v0.1.0'));
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('stays quiet outside the Tauri runtime (browser previews and tests)', () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    appInfo.mockClear();
    render(<StatusBar />);
    expect(appInfo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('app-version')).not.toBeInTheDocument();
  });
});
