import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { usePrefsStore } from '@/state/prefsStore';

import { LandingPage } from './LandingPage';

const RELEASE_URL = 'https://github.com/fahmiau/xlsform-studio/releases/latest';

describe('LandingPage', () => {
  beforeEach(() => {
    localStorage.clear();
    usePrefsStore.setState({ theme: 'system', hydrated: true });
    document.documentElement.classList.remove('dark');
  });

  it('renders headline, IDE preview, features, Desktop AI security note, and release links', () => {
    render(<LandingPage onLaunchApp={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/XLSForms/i);
    expect(screen.getByText(/ODK, KoboToolbox, SurveyCTO/i)).toBeInTheDocument();

    for (const title of [
      'Formula Autocomplete',
      'Real-time Linter',
      'Side-by-Side Choices Drawer',
      'Safe Rename Refactoring',
      'Multilingual Views',
      'Lossless .xlsx Round-Trip',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
    }

    expect(screen.getByText(/Windows Credential Manager/i)).toBeInTheDocument();
    expect(screen.getByText(/proxied through Rust/i)).toBeInTheDocument();
    expect(screen.queryByText(/Desktop Exclusive/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('download-desktop')).toHaveAttribute('href', RELEASE_URL);
    expect(screen.getByTestId('hero-download-desktop')).toHaveAttribute('href', RELEASE_URL);
    expect(screen.getByTestId('showcase-lint-pill')).toHaveTextContent(/XLS-004/);
  });

  it('steps through relevant column variable and choice-list autocomplete in IdeShowcase', async () => {
    const user = userEvent.setup();
    render(<LandingPage onLaunchApp={vi.fn()} />);

    const varPopup = screen.getByTestId('showcase-autocomplete');
    expect(within(varPopup).getByText('water_source')).toBeInTheDocument();
    expect(screen.getByTestId('showcase-active-cell')).toHaveTextContent('${w');

    await user.click(screen.getByTestId('showcase-step-2'));
    const choicePopup = screen.getByTestId('showcase-autocomplete');
    expect(within(choicePopup).getByText('other')).toBeInTheDocument();
    expect(within(choicePopup).getByText('piped_dwelling')).toBeInTheDocument();
    expect(within(choicePopup).getByText('borehole')).toBeInTheDocument();

    await user.click(screen.getByTestId('showcase-step-3'));
    expect(screen.queryByTestId('showcase-autocomplete')).not.toBeInTheDocument();
    expect(screen.getByTestId('showcase-active-cell')).toHaveTextContent("${water_source} = 'other'");
    expect(screen.getByTestId('showcase-lint-pill')).toHaveTextContent(/0 Problems \(4 ms\)/);

    await user.click(screen.getByTestId('showcase-step-0'));
    expect(within(screen.getByTestId('showcase-autocomplete')).getByText('water_source')).toBeInTheDocument();

    await user.click(screen.getByTestId('showcase-play-pause'));
    expect(screen.getByTestId('showcase-play-pause')).toHaveTextContent(/Pause/i);
  });

  it('invokes onLaunchApp from both header and hero CTA buttons', async () => {
    const user = userEvent.setup();
    const onLaunchApp = vi.fn();
    render(<LandingPage onLaunchApp={onLaunchApp} />);

    await user.click(screen.getByTestId('launch-web-app'));
    await user.click(screen.getByTestId('hero-launch-web-app'));
    expect(onLaunchApp).toHaveBeenCalledTimes(2);
  });
});

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    window.history.replaceState({}, '', '/');
    usePrefsStore.setState({ theme: 'system', hydrated: false });
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    Reflect.deleteProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__');
    window.history.replaceState({}, '', '/');
  });

  it('starts on LandingPage in browser mode and transitions to editor on launch', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('landing-theme-toggle'));
    await user.click(screen.getByTestId('landing-theme-toggle'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(screen.getByTestId('launch-web-app'));

    await waitFor(() => expect(screen.getByTestId('app-shell')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/app');
  });

  it('renders editor directly when /app or ?app is requested or in Tauri runtime', async () => {
    window.history.replaceState({}, '', '/?app=1');
    const first = render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-shell')).toBeInTheDocument());
    first.unmount();

    window.history.replaceState({}, '', '/');
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main', windowLabel: 'main' },
        },
        invoke: vi.fn().mockResolvedValue(null),
        transformCallback: () => 0,
        unregisterCallback: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
      value: { unregisterListener: vi.fn() },
      configurable: true,
    });
    const second = render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-shell')).toBeInTheDocument());
    expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    second.unmount();
  });
});
