import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearModelCache, listModels, modelBaseUrlCandidates } from './listModels';
import { presetById, type ProviderPreset } from './providers';

beforeEach(() => {
  clearModelCache();
});

function preset(id: string): ProviderPreset {
  const found = presetById(id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('listModels', () => {
  it('tries /v1 when a gateway root has no path', () => {
    expect(modelBaseUrlCandidates('https://api.vikey.ai')).toEqual([
      'https://api.vikey.ai',
      'https://api.vikey.ai/v1',
    ]);
  });

  it('keeps an explicit API prefix as the only candidate', () => {
    expect(modelBaseUrlCandidates('https://api.vikey.ai/v1/')).toEqual(['https://api.vikey.ai/v1']);
    expect(modelBaseUrlCandidates('https://openrouter.ai/api/v1')).toEqual([
      'https://openrouter.ai/api/v1',
    ]);
  });

  it('strips a pasted endpoint path back to its API root', () => {
    expect(modelBaseUrlCandidates('https://api.vikey.ai/v1/chat/completions')).toEqual([
      'https://api.vikey.ai/v1',
    ]);
    expect(modelBaseUrlCandidates('https://api.anthropic.com/v1/messages')).toEqual([
      'https://api.anthropic.com/v1',
    ]);
  });

  it('sends the Anthropic version header', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: [{ id: 'claude-x' }] }),
    );

    const models = await listModels(
      fetchImpl as unknown as typeof fetch,
      preset('custom-anthropic'),
      'https://gateway.test/v1',
      { refresh: true },
    );

    expect(models[0]?.id).toBe('claude-x');
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ 'anthropic-version': '2023-06-01' });
  });

  it('parses Anthropic display names', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ id: 'claude-x', display_name: 'Claude X' }] }),
    );

    const models = await listModels(
      fetchImpl as unknown as typeof fetch,
      preset('custom-anthropic'),
      'https://gateway.test/v1',
      { refresh: true },
    );

    expect(models[0]).toMatchObject({ id: 'claude-x', label: 'Claude X' });
  });
});
