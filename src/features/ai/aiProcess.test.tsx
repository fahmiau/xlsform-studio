import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamBuildMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./client');
  return {
    ...actual,
    streamBuild: (...args: unknown[]) => streamBuildMock(...args),
  };
});

vi.mock('./useAiConfig', () => ({
  modelForConfig: vi.fn(() => ({})),
}));

import { AiProcessStatus } from './AiProcessStatus';
import {
  applyStreamPart,
  consumeAiStream,
  createInitialProcessState,
  finalizeProcessState,
  type StreamProcessPart,
} from './aiProcess';
import { BuildView } from './BuildView';
import { MessageList } from './MessageList';
import { presetById } from './providers';
import { useStagingStore } from '@/state/stagingStore';
import { useWorkbookStore } from '@/state/workbookStore';

const ollamaConfig = {
  preset: presetById('ollama')!,
  provider: {
    instanceId: 'p_test',
    presetId: 'ollama' as const,
    label: 'Ollama',
    modelId: 'qwen2.5:7b',
  },
  baseUrl: 'http://localhost:11434/v1',
  fetchImpl: vi.fn<typeof fetch>(),
};

describe('aiProcess reducer and stream consumer', () => {
  it('tracks thinking -> tool call -> writing -> done transitions', async () => {
    async function* stream(): AsyncGenerator<StreamProcessPart> {
      yield { type: 'start' };
      yield { type: 'start-step' };
      yield { type: 'reasoning-delta' };
      yield { type: 'tool-input-start', id: 'call_1', toolName: 'insert_survey_rows' };
      yield { type: 'tool-call', toolCallId: 'call_1', toolName: 'insert_survey_rows' };
      yield {
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'insert_survey_rows',
        output: { ok: true, summary: 'inserted 3 rows', errors: [] },
      };
      yield { type: 'start-step' };
      yield { type: 'text-delta', text: '' };
      yield { type: 'text-delta', text: 'Done!' };
      yield { type: 'finish' };
    }

    const snapshots: Array<{ activeLabel: string | null; statuses: string[] }> = [];
    let text = '';
    const finalState = await consumeAiStream(stream(), (delta, process) => {
      text += delta;
      snapshots.push({
        activeLabel: process.activeLabel,
        statuses: process.steps.map((s) => `${s.kind}:${s.status}`),
      });
    });

    expect(text).toBe('Done!');
    expect(snapshots).toContainEqual({
      activeLabel: 'Inserting survey rows…',
      statuses: ['thinking:done', 'tool:running'],
    });
    expect(snapshots).toContainEqual({
      activeLabel: 'Thinking…',
      statuses: ['thinking:done', 'tool:done'],
    });
    expect(snapshots).toContainEqual({
      activeLabel: 'Writing response…',
      statuses: ['thinking:done', 'tool:done', 'thinking:done', 'writing:running'],
    });
    expect(finalState.running).toBe(false);
    expect(finalState.steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('marks failed tool output and rethrows stream error parts', async () => {
    const initial = createInitialProcessState();
    const afterCall = applyStreamPart(initial, {
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'update_survey_cells',
    }).process;
    const afterErr = applyStreamPart(afterCall, {
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'update_survey_cells',
      output: { ok: false, summary: 'failed', errors: ['unknown row'] },
    }).process;

    expect(afterErr.steps[1]).toMatchObject({
      kind: 'tool',
      label: 'Updating survey cells',
      status: 'error',
      detail: 'failed',
      errors: ['unknown row'],
    });

    async function* errorStream(): AsyncGenerator<StreamProcessPart> {
      yield { type: 'start-step' };
      yield { type: 'error', error: new Error('boom') };
    }

    let latest = createInitialProcessState();
    await expect(
      consumeAiStream(errorStream(), (_delta, process) => {
        latest = process;
      }),
    ).rejects.toThrow('boom');
    expect(latest.running).toBe(false);
    expect(latest.steps[0]?.status).toBe('error');
  });
});

describe('AiProcessStatus and MessageList', () => {
  it('renders live status + steps while running and collapses after completion', () => {
    const running = applyStreamPart(createInitialProcessState(), {
      type: 'text-delta',
      text: 'Hello',
    }).process;
    const { rerender } = render(<AiProcessStatus process={running} />);

    expect(screen.getByTestId('ai-process-active')).toHaveTextContent('Writing response…');
    expect(screen.getAllByTestId('ai-process-step')).toHaveLength(2);
    expect(screen.getByTestId('ai-process-status')).toHaveAttribute('data-running', 'true');

    rerender(<AiProcessStatus process={finalizeProcessState(running, 'done')} />);
    expect(screen.getByTestId('ai-process-status')).toHaveAttribute('data-running', 'false');
    expect(screen.getByText('Process · 2 steps')).toBeInTheDocument();
  });

  it('only falls back to active process for the last assistant message', () => {
    render(
      <MessageList
        streaming={true}
        messages={[
          { id: '1', role: 'user', content: 'First' },
          { id: '2', role: 'assistant', content: '' },
          { id: '3', role: 'user', content: 'Second' },
          { id: '4', role: 'assistant', content: '' },
        ]}
      />,
    );
    expect(screen.getAllByTestId('ai-process-status')).toHaveLength(1);
    expect(screen.getByTestId('ai-process-active')).toHaveTextContent('Thinking…');
  });
});

describe('BuildView live process indicator', () => {
  beforeEach(() => {
    streamBuildMock.mockReset();
    useStagingStore.getState().revert();
    useWorkbookStore.getState().newWorkbook();
  });

  it('shows Thinking, active tool execution, Writing, and final tool transcript inline', async () => {
    const queue: StreamProcessPart[] = [];
    let waiting: ((value: IteratorResult<StreamProcessPart>) => void) | null = null;
    let closed = false;

    const pushChunk = (part: StreamProcessPart) => {
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve({ value: part, done: false });
      } else {
        queue.push(part);
      }
    };
    const closeStream = () => {
      closed = true;
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve({ value: undefined, done: true });
      }
    };

    const fullStream: AsyncIterable<StreamProcessPart> = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise<IteratorResult<StreamProcessPart>>((resolve) => {
            waiting = resolve;
          });
        },
      }),
    };

    streamBuildMock.mockReturnValue({ fullStream });

    const user = userEvent.setup();
    render(<BuildView config={ollamaConfig} />);
    await user.type(screen.getByTestId('ai-build-input'), 'Add age question');
    await user.click(screen.getByTestId('ai-build-send'));

    expect(screen.getByTestId('ai-process-active')).toHaveTextContent('Thinking…');

    pushChunk({ type: 'tool-input-start', id: 'c1', toolName: 'insert_survey_rows' });
    await waitFor(() => {
      expect(screen.getByTestId('ai-process-active')).toHaveTextContent('Inserting survey rows…');
    });

    pushChunk({
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'insert_survey_rows',
      output: { ok: true, summary: 'inserted 1 row', errors: [] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('ai-process-active')).toHaveTextContent('Thinking…');
    });

    pushChunk({ type: 'text-delta', text: 'Added the question.' });
    await waitFor(() => {
      expect(screen.getByTestId('ai-process-active')).toHaveTextContent('Writing response…');
    });

    pushChunk({ type: 'finish' });
    closeStream();

    await waitFor(() => {
      expect(screen.getByTestId('ai-tool-transcript')).toHaveTextContent('insert_survey_rows');
    });
    expect(screen.getByTestId('ai-tool-transcript')).toHaveTextContent('inserted 1 row');
    expect(screen.getByText('Added the question.')).toBeInTheDocument();
  });
});
