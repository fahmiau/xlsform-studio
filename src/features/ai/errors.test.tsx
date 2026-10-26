import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AiErrorBanner } from './AiErrorBanner';
import { classifySdkError, describeAiError } from './errors';
import { presetById } from './providers';

const anthropic = presetById('anthropic')!;
const ollama = presetById('ollama')!;

describe('describeAiError', () => {
  it('maps 401 to a replace-key action with the key page', () => {
    const info = describeAiError({
      status: 401,
      body: '{"error":{"message":"invalid x-api-key"}}',
      preset: anthropic,
    });
    expect(info.title).toBe('The key was rejected');
    expect(info.action).toBe('replace-key');
    expect(info.link).toBe(anthropic.keyPageUrl);
    expect(info.detail).toBe('invalid x-api-key');
  });

  it('maps 403 to the same replace-key path', () => {
    expect(describeAiError({ status: 403, preset: anthropic }).action).toBe('replace-key');
  });

  it('maps 402 and quota-shaped 429 to billing', () => {
    for (const status of [402, 429]) {
      const info = describeAiError({
        status,
        body: '{"error":{"message":"insufficient credits"}}',
        preset: anthropic,
      });
      expect(info.action).toBe('open-billing');
      expect(info.link).toBe(anthropic.billingUrl);
      expect(info.retryable).toBe(true);
    }
  });

  it('maps a plain 429 rate limit to billing too', () => {
    const info = describeAiError({ status: 429, body: 'rate limit reached', preset: anthropic });
    expect(info.title).toBe('Out of credits or rate limited');
  });

  it('maps 404 to the model picker', () => {
    const info = describeAiError({ status: 404, preset: anthropic });
    expect(info.title).toBe('Model not found');
    expect(info.action).toBe('open-model-picker');
  });

  it('shows the ollama pull hint for a missing local model', () => {
    const info = describeAiError({ status: 404, preset: ollama, modelId: 'qwen2.5:7b' });
    expect(info.message).toContain('ollama pull qwen2.5:7b');
  });

  it('maps a refused loopback connection to the local-server hint', () => {
    const info = describeAiError({
      error: new Error('error sending request: connection refused (os error 10061)'),
      preset: ollama,
    });
    expect(info.action).toBe('ollama-serve');
    expect(info.title).toContain('Ollama');
  });

  it('maps a refused cloud connection to retry', () => {
    const info = describeAiError({
      error: new Error('connection refused'),
      preset: anthropic,
    });
    expect(info.action).toBe('retry');
    expect(info.title).toBe('Could not reach the provider');
  });

  it('maps DNS failures to the offline message', () => {
    const info = describeAiError({ error: new Error('dns error: ENOTFOUND api.anthropic.com') });
    expect(info.title).toBe('No internet connection');
    expect(info.action).toBe('retry');
  });

  it('maps keychain failures to the docs action', () => {
    const info = describeAiError({
      error: { kind: 'Keyring', detail: 'system keychain unavailable: no Secret Service' },
    });
    expect(info.title).toBe('System keychain not available');
    expect(info.action).toBe('keychain-docs');
  });

  it('maps aborts to a neutral stopped state', () => {
    const info = describeAiError({ error: new DOMException('aborted', 'AbortError') });
    expect(info.title).toBe('Stopped');
    expect(info.action).toBe('none');
    expect(info.retryable).toBe(false);
  });

  it('classifies an SDK error string with an embedded status', () => {
    const info = classifySdkError('401 {"error":{"message":"bad key"}}', anthropic);
    expect(info.action).toBe('replace-key');
    expect(info.detail).toBe('bad key');
  });
});

describe('AiErrorBanner', () => {
  const onAction = vi.fn();

  it.each([
    {
      name: 'rejected key',
      info: describeAiError({ status: 401, preset: anthropic }),
      button: 'Replace key',
    },
    {
      name: 'out of credits',
      info: describeAiError({ status: 402, preset: anthropic }),
      button: 'Open billing',
    },
    {
      name: 'missing model',
      info: describeAiError({ status: 404, preset: anthropic }),
      button: 'Choose model',
    },
    {
      name: 'local server down',
      info: describeAiError({ error: new Error('connection refused'), preset: ollama }),
      button: 'Show command',
    },
    {
      name: 'offline',
      info: describeAiError({ error: new Error('ENOTFOUND') }),
      button: 'Retry',
    },
    {
      name: 'keychain unavailable',
      info: describeAiError({ error: 'keychain unavailable' }),
      button: 'Learn more',
    },
  ])('renders the $name row with its one action', async ({ info, button }) => {
    render(<AiErrorBanner info={info} onAction={onAction} />);
    expect(screen.getByTestId('ai-error-title')).toHaveTextContent(info.title);
    expect(screen.getByTestId('ai-error-message')).toHaveTextContent(info.message);
    const action = screen.getByRole('button', { name: button });
    await userEvent.click(action);
    expect(onAction).toHaveBeenCalledWith(info.action);
    if (info.action === 'ollama-serve') {
      expect(screen.getByTestId('ai-error-command')).toHaveTextContent('ollama serve');
    }
  });

  it('shows the provider detail in a collapsible section', () => {
    render(
      <AiErrorBanner info={describeAiError({ status: 401, body: 'nope', preset: anthropic })} />,
    );
    expect(screen.getByText('Provider detail')).toBeInTheDocument();
  });
});
