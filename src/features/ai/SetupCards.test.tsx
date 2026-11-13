import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { setProviderSecret } = vi.hoisted(() => ({
  setProviderSecret: vi.fn(async () => ({ bound: true, hasKey: true })),
}));
vi.mock('./aiIpc', () => ({
  setProviderSecret,
  providerSecretStatus: vi.fn(async () => ({ bound: true, hasKey: true })),
  deleteProviderSecret: vi.fn(async () => null),
  tauriProxyTransport: {},
}));

vi.mock('./listModels', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listModels: vi.fn(async () => [
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tools: true, recommended: true },
    ]),
    probeLocal: vi.fn(async (_fetch, preset) => ({ preset, running: false, models: [] })),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { usePrefsStore } from '@/state/prefsStore';

import { SetupCards } from './SetupCards';

const KEY = `sk-ant-api03-${'x'.repeat(30)}`;

describe('SetupCards (Task 6.2b)', () => {
  beforeEach(() => {
    localStorage.clear();
    usePrefsStore.setState({ ai: { providers: [], activeInstanceId: null } });
    setProviderSecret.mockClear();
  });

  it('detects a pasted key and saves it without keeping it in the UI or prefs', async () => {
    render(<SetupCards />);
    // Local probes bind keyless probe instances on mount.
    await waitFor(() =>
      expect(setProviderSecret).toHaveBeenCalledWith('probe_ollama', {
        baseUrl: 'http://localhost:11434/v1',
        auth: 'none',
      }),
    );

    const input = screen.getByTestId('ai-key-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: KEY } });
    expect(screen.getByTestId('ai-detected-chip')).toHaveTextContent('Anthropic');
    expect(screen.getByTestId('ai-detected-change')).toHaveAttribute('role', 'combobox');

    await userEvent.click(screen.getByTestId('ai-key-save'));

    await waitFor(() => expect(usePrefsStore.getState().ai.providers).toHaveLength(1));
    const saved = usePrefsStore.getState().ai.providers[0]!;
    expect(saved.presetId).toBe('anthropic');
    expect(saved.modelId).toBe('claude-haiku-4-5');

    expect(setProviderSecret).toHaveBeenCalledWith(expect.stringMatching(/^p_/), {
      baseUrl: 'https://api.anthropic.com/v1',
      auth: 'x-api-key',
      apiKey: KEY,
    });
    expect(input).toHaveValue('');
    expect(JSON.stringify(usePrefsStore.getState().ai)).not.toContain(KEY);
    expect(localStorage.getItem('xlsform-studio.prefs') ?? '').not.toContain(KEY);
  });

  it('uses a detected local server keylessly', async () => {
    const { probeLocal } = await import('./listModels');
    vi.mocked(probeLocal).mockImplementation(async (_fetch, preset) =>
      preset.id === 'ollama'
        ? {
            preset,
            running: true,
            models: [{ id: 'qwen2.5:7b', label: 'Qwen', tools: true, recommended: true }],
          }
        : { preset, running: false, models: [] },
    );
    render(<SetupCards />);

    const use = await screen.findByTestId('ai-use-ollama');
    await waitFor(() => expect(use).toBeEnabled());
    await userEvent.click(use);

    await waitFor(() => expect(usePrefsStore.getState().ai.providers).toHaveLength(1));
    expect(usePrefsStore.getState().ai.providers[0]?.presetId).toBe('ollama');
    expect(setProviderSecret).toHaveBeenCalledWith(
      expect.stringMatching(/^p_/),
      expect.objectContaining({ baseUrl: 'http://localhost:11434/v1', auth: 'none' }),
    );
  });

  it('requires a valid URL and model for a custom provider', async () => {
    render(<SetupCards />);
    await userEvent.click(screen.getByTestId('ai-setup-custom').querySelector('button')!);
    await userEvent.click(screen.getByTestId('ai-custom-save'));
    expect(screen.getByTestId('ai-error-banner')).toHaveTextContent('valid http(s) base URL');

    fireEvent.change(screen.getByTestId('ai-custom-url'), {
      target: { value: 'http://localhost:8080/v1' },
    });
    await userEvent.click(screen.getByTestId('ai-custom-save'));
    expect(screen.getByTestId('ai-error-banner')).toHaveTextContent('model ID');
  });

  it('fetches models for a custom endpoint and saves the selected model', async () => {
    render(<SetupCards />);
    await userEvent.click(screen.getByTestId('ai-setup-custom').querySelector('button')!);
    fireEvent.change(screen.getByTestId('ai-custom-url'), {
      target: { value: 'http://localhost:8080/v1' },
    });
    await userEvent.click(screen.getByTestId('ai-custom-fetch'));

    await waitFor(() =>
      expect(screen.getByTestId('ai-custom-model-select')).toHaveAttribute('role', 'combobox'),
    );
    expect(screen.getByTestId('ai-custom-model')).toHaveValue('claude-haiku-4-5');
    expect(setProviderSecret).toHaveBeenCalledWith('probe_custom', {
      baseUrl: 'http://localhost:8080/v1',
      auth: 'none',
    });

    await userEvent.click(screen.getByTestId('ai-custom-save'));
    await waitFor(() => expect(usePrefsStore.getState().ai.providers).toHaveLength(1));
    expect(usePrefsStore.getState().ai.providers[0]).toMatchObject({
      presetId: 'custom-openai',
      modelId: 'claude-haiku-4-5',
      baseUrlOverride: 'http://localhost:8080/v1',
    });
  });

  it('retries a gateway base URL without its /v1 prefix', async () => {
    const { AiHttpError, listModels } = await import('./listModels');
    vi.mocked(listModels).mockImplementation(async (_fetch, _preset, baseUrl) => {
      if (baseUrl === 'http://localhost:8080') throw new AiHttpError(404, 'not found');
      return [{ id: 'vikey-model', label: 'vikey-model' }];
    });

    render(<SetupCards />);
    await userEvent.click(screen.getByTestId('ai-setup-custom').querySelector('button')!);
    fireEvent.change(screen.getByTestId('ai-custom-url'), {
      target: { value: 'http://localhost:8080' },
    });
    await userEvent.click(screen.getByTestId('ai-custom-fetch'));

    await waitFor(() => expect(screen.getByTestId('ai-custom-model')).toHaveValue('vikey-model'));
    expect(screen.getByTestId('ai-custom-url')).toHaveValue('http://localhost:8080/v1');
    expect(setProviderSecret).toHaveBeenCalledWith('probe_custom', {
      baseUrl: 'http://localhost:8080/v1',
      auth: 'none',
    });

    await userEvent.click(screen.getByTestId('ai-custom-save'));
    await waitFor(() => expect(usePrefsStore.getState().ai.providers).toHaveLength(1));
    expect(usePrefsStore.getState().ai.providers[0]).toMatchObject({
      presetId: 'custom-openai',
      baseUrlOverride: 'http://localhost:8080/v1',
    });
  });
});
