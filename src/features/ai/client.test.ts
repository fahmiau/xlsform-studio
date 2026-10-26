import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamText } = vi.hoisted(() => ({
  streamText: vi.fn(() => 'streamed'),
}));
vi.mock('ai', () => ({
  streamText,
  tool: vi.fn((definition) => definition),
  stepCountIs: vi.fn((steps: number) => ({ steps })),
}));

import { buildStreamParams, chatStreamParams, streamChat } from './client';

describe('AI SDK wrapper', () => {
  beforeEach(() => streamText.mockClear());

  const base = {
    model: 'model' as never,
    system: 'system',
    messages: [{ role: 'user' as const, content: 'hello' }],
  };

  it('Chat Mode passes no tools to the model call', () => {
    const params = chatStreamParams(base);
    expect('tools' in params).toBe(false);
    expect('stopWhen' in params).toBe(false);
    streamChat(base);
    const call = streamText.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(call[0]).not.toHaveProperty('tools');
    expect(call[0]).not.toHaveProperty('stopWhen');
  });

  it('Build Mode passes tools and caps the step loop', () => {
    const tools = { insert_survey_rows: { description: 'x' } } as never;
    const params = buildStreamParams({ ...base, tools, maxSteps: 8 });
    expect(params.tools).toBe(tools);
    expect(params.stopWhen).toEqual({ steps: 8 });
  });

  it('forwards an abort signal and temperature only when provided', () => {
    const controller = new AbortController();
    expect(chatStreamParams({ ...base, signal: controller.signal })).toMatchObject({
      abortSignal: controller.signal,
    });
    expect(chatStreamParams(base)).not.toHaveProperty('temperature');
    expect(chatStreamParams({ ...base, temperature: 0 })).toMatchObject({ temperature: 0 });
  });
});
