/**
 * Chat session store (Task 6.5). In memory for the session; persistent history
 * is post-v1. Chat Mode never passes tools to the model.
 */
import { create } from 'zustand';

import { buildContext } from '@/core/ai/context';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import {
  consumeAiStream,
  createInitialProcessState,
  finalizeProcessState,
  type AiProcessState,
} from './aiProcess';
import { formatAnswersAsMessage, type AiQuestionAnswer } from './aiQuestion';
import { streamChat } from './client';
import { toModelMessages, type ChatAttachment } from './attachments';
import { classifySdkError, type AiErrorInfo } from './errors';
import { chatSystemPrompt } from './prompts';
import { modelForConfig, type AiConfig } from './useAiConfig';

export interface ChatQuestionResult {
  status: 'answered' | 'skipped';
  answers?: AiQuestionAnswer[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
  process?: AiProcessState;
  questionResult?: ChatQuestionResult;
}

export type ChatStatus = 'idle' | 'streaming';

export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  error: AiErrorInfo | null;
  send: (text: string, config: AiConfig, attachments?: ChatAttachment[]) => Promise<void>;
  answerQuestion: (messageId: string, answers: AiQuestionAnswer[] | null, config: AiConfig) => void;
  stop: () => void;
  reset: () => void;
  clearError: () => void;
}

let controller: AbortController | null = null;
let sequence = 0;

function nextId(): string {
  sequence += 1;
  return `chat-${sequence}`;
}

/** Fresh compact context for the current document and selection. */
export function buildAiContext(): string {
  const data = useWorkbookStore.getState().data;
  const indexes = useDerivedStore.getState().indexes;
  const diagnostics = useDerivedStore.getState().diagnostics;
  const ui = useUiStore.getState();
  return buildContext(
    data,
    indexes,
    { activeSheet: ui.activeSheet, selectedRowIds: ui.selectedRowIds },
    diagnostics,
    {},
  );
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  status: 'idle',
  error: null,

  send: async (text, config, attachments = []) => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || get().status === 'streaming') return;

    const userMessage: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      ...(attachments.length > 0 ? { attachments } : {}),
    };
    const assistantMessage: ChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      process: createInitialProcessState(),
    };
    const history = [...get().messages, userMessage];
    set({ messages: [...history, assistantMessage], status: 'streaming', error: null });

    controller = new AbortController();
    try {
      const result = streamChat({
        model: modelForConfig(config),
        system: chatSystemPrompt(buildAiContext()),
        messages: toModelMessages(history),
        signal: controller.signal,
        ...(config.provider.temperature !== undefined
          ? { temperature: config.provider.temperature }
          : {}),
      });
      const finalProcess = await consumeAiStream(result.fullStream, (delta, process) => {
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: message.content + delta, process }
              : message,
          ),
        }));
      });
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id ? { ...message, process: finalProcess } : message,
        ),
      }));
    } catch (error) {
      const aborted =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError');
      set((state) => ({
        error: aborted ? state.error : classifySdkError(error, config.preset),
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                process: finalizeProcessState(
                  message.process ?? createInitialProcessState(),
                  aborted ? 'stopped' : 'error',
                ),
              }
            : message,
        ),
      }));
    } finally {
      controller = null;
      set({ status: 'idle' });
    }
  },

  answerQuestion: (messageId, answers, config) => {
    if (get().status === 'streaming') return;
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              questionResult: answers ? { status: 'answered', answers } : { status: 'skipped' },
            }
          : message,
      ),
    }));
    if (answers && answers.length > 0) {
      void get().send(formatAnswersAsMessage(answers), config);
    }
  },

  stop: () => {
    controller?.abort();
    controller = null;
  },

  reset: () => {
    controller?.abort();
    controller = null;
    set({ messages: [], status: 'idle', error: null });
  },

  clearError: () => set({ error: null }),
}));
