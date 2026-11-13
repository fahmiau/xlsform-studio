import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamBuildMock = vi.fn();
const streamChatMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./client');
  return {
    ...actual,
    streamBuild: (...args: unknown[]) => streamBuildMock(...args),
    streamChat: (...args: unknown[]) => streamChatMock(...args),
  };
});

import { AiQuestionCard } from './AiQuestionCard';
import { formatAnswersAsMessage, parseQuestionBlock, splitQuestionBlocks } from './aiQuestion';
import type { StreamProcessPart } from './aiProcess';
import { BuildView } from './BuildView';
import { ChatView } from './ChatView';
import { presetById } from './providers';
import { useChatStore } from './useChat';
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

describe('aiQuestion helpers', () => {
  it('extracts xlsform-choices blocks and supports single-question shorthand', () => {
    const content = [
      'Please clarify:',
      '```xlsform-choices',
      '{"question":"Question type?","options":["text","integer"]}',
      '```',
    ].join('\n');

    const result = splitQuestionBlocks(content, false);
    expect(result.text).toBe('Please clarify:');
    expect(result.streamingIncomplete).toBe(false);
    expect(result.questions).toEqual([
      { question: 'Question type?', options: ['text', 'integer'] },
    ]);
  });

  it('hides incomplete xlsform-choices fence while streaming and keeps invalid JSON as text', () => {
    const partial = splitQuestionBlocks('Asking...\n```xlsform-choices\n{"quest', true);
    expect(partial.text).toBe('Asking...');
    expect(partial.streamingIncomplete).toBe(true);
    expect(partial.questions).toEqual([]);

    expect(parseQuestionBlock('{not json')).toBeNull();
    const invalid = splitQuestionBlocks('```xlsform-choices\n{bad}\n```', false);
    expect(invalid.questions).toEqual([]);
    expect(invalid.text).toContain('{bad}');
  });

  it('formats answers concisely', () => {
    expect(formatAnswersAsMessage([{ question: 'Type?', selected: ['integer'] }])).toBe(
      'Type?: integer',
    );
    expect(
      formatAnswersAsMessage([
        { question: 'Type?', selected: ['select_one'] },
        { question: 'Required?', selected: ['yes', 'default'] },
      ]),
    ).toBe('- Type?: select_one\n- Required?: yes, default');
  });
});

describe('AiQuestionCard', () => {
  it('submits immediately on single-select option click and supports custom input + skip', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const onSkip = vi.fn();

    render(
      <AiQuestionCard
        state={{
          id: 'q1',
          status: 'pending',
          questions: [{ question: 'Pick type', options: ['text', 'date'] }],
        }}
        onAnswer={onAnswer}
        onSkip={onSkip}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'text' }));
    expect(onAnswer).toHaveBeenCalledWith([{ question: 'Pick type', selected: ['text'] }]);

    await user.type(screen.getByTestId('ai-question-other'), 'decimal{Enter}');
    expect(onAnswer).toHaveBeenLastCalledWith([{ question: 'Pick type', selected: ['decimal'] }]);

    await user.click(screen.getByTestId('ai-question-skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('supports multi-select checkboxes + submit button', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();

    render(
      <AiQuestionCard
        state={{
          id: 'q2',
          status: 'pending',
          questions: [
            {
              question: 'Columns to include',
              options: ['hint', 'required', 'constraint'],
              multiSelect: true,
            },
          ],
        }}
        onAnswer={onAnswer}
        onSkip={vi.fn()}
      />,
    );

    const submit = screen.getByTestId('ai-question-submit');
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /hint/ }));
    await user.click(screen.getByRole('button', { name: /required/ }));
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onAnswer).toHaveBeenCalledWith([
      { question: 'Columns to include', selected: ['hint', 'required'] },
    ]);
  });
});

describe('Chat Mode interactive choices', () => {
  beforeEach(() => {
    streamChatMock.mockReset();
    useChatStore.getState().reset();
  });

  it('renders xlsform-choices as interactive card and sends chosen answer', async () => {
    streamChatMock
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield {
            type: 'text-delta',
            text:
              'Which list style?\n```xlsform-choices\n' +
              '{"questions":[{"question":"List style","options":["select_one","select_multiple"]}]}\n' +
              '```',
          };
          yield { type: 'finish' };
        })(),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: 'Use select_one for single choice.' };
          yield { type: 'finish' };
        })(),
      }));

    const user = userEvent.setup();
    render(<ChatView config={ollamaConfig} />);

    await user.type(screen.getByTestId('ai-chat-input'), 'Help me add a list');
    await user.click(screen.getByTestId('ai-send'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-question-card')).toHaveAttribute('data-status', 'pending');
    });
    expect(screen.getByText('Which list style?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'select_one' }));

    await waitFor(() => {
      expect(screen.getByText('Use select_one for single choice.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ai-question-card')).toHaveAttribute('data-status', 'answered');
    expect(streamChatMock).toHaveBeenCalledTimes(2);
  });
});

describe('Build Mode ask_question tool', () => {
  beforeEach(() => {
    streamBuildMock.mockReset();
    useStagingStore.getState().revert();
    useWorkbookStore.getState().newWorkbook();
  });

  it('pauses on ask_question tool, resolves with user selection, and supports Stop', async () => {
    streamBuildMock.mockImplementation(
      (options: {
        tools: {
          ask_question: {
            execute: (
              input: { questions: Array<{ question: string; options: string[] }> },
              opts: { abortSignal?: AbortSignal },
            ) => Promise<unknown>;
          };
        };
        signal?: AbortSignal;
      }) => {
        async function* fullStream(): AsyncGenerator<StreamProcessPart> {
          yield { type: 'start-step' };
          yield { type: 'tool-call', toolCallId: 'ask_1', toolName: 'ask_question' };
          const output = await options.tools.ask_question.execute(
            { questions: [{ question: 'Where to insert?', options: ['Top', 'Bottom'] }] },
            { abortSignal: options.signal },
          );
          yield { type: 'tool-result', toolCallId: 'ask_1', toolName: 'ask_question', output };
          yield { type: 'text-delta', text: 'Inserted after confirmation.' };
          yield { type: 'finish' };
        }
        return { fullStream: fullStream() };
      },
    );

    const user = userEvent.setup();
    render(<BuildView config={ollamaConfig} />);

    await user.type(screen.getByTestId('ai-build-input'), 'Add age');
    await user.click(screen.getByTestId('ai-build-send'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-process-active')).toHaveTextContent('Waiting for your answer…');
      expect(screen.getByTestId('ai-question-card')).toHaveAttribute('data-status', 'pending');
    });

    await user.click(screen.getByRole('button', { name: 'Bottom' }));

    await waitFor(() => {
      expect(screen.getByText('Inserted after confirmation.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ai-question-card')).toHaveAttribute('data-status', 'answered');

    // Now verify Stop cancels a pending ask_question cleanly.
    await user.type(screen.getByTestId('ai-build-input'), 'Add city');
    await user.click(screen.getByTestId('ai-build-send'));

    await waitFor(() => {
      expect(screen.getAllByTestId('ai-question-card')[1]).toHaveAttribute(
        'data-status',
        'pending',
      );
    });

    await user.click(screen.getByTestId('ai-build-stop'));

    await waitFor(() => {
      expect(screen.getAllByTestId('ai-question-card')[1]).toHaveAttribute(
        'data-status',
        'cancelled',
      );
    });
    expect(screen.getByTestId('ai-build-send')).toBeInTheDocument();
  });
});
