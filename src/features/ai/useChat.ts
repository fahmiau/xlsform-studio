/**
 * Chat session store (Task 6.5). In memory for the session; persistent history
 * is post-v1. Chat Mode never passes tools to the model.
 */
import { create } from 'zustand';

import { buildContext } from '@/core/ai/context';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { streamChat } from './client';
import { classifySdkError, type AiErrorInfo } from './errors';
import { chatSystemPrompt } from './prompts';
import { modelForConfig, type AiConfig } from './useAiConfig';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type ChatStatus = 'idle' | 'streaming';

export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  error: AiErrorInfo | null;
  send: (text: string, config: AiConfig) => Promise<void>;
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

  send: async (text, config) => {
    const trimmed = text.trim();
    if (!trimmed || get().status === 'streaming') return;

    const userMessage: ChatMessage = { id: nextId(), role: 'user', content: trimmed };
    const assistantMessage: ChatMessage = { id: nextId(), role: 'assistant', content: '' };
    const history = [...get().messages, userMessage];
    set({ messages: [...history, assistantMessage], status: 'streaming', error: null });

    controller = new AbortController();
    try {
      const result = streamChat({
        model: modelForConfig(config),
        system: chatSystemPrompt(buildAiContext()),
        messages: history.map((message) => ({ role: message.role, content: message.content })),
        signal: controller.signal,
        ...(config.provider.temperature !== undefined
          ? { temperature: config.provider.temperature }
          : {}),
      });
      for await (const delta of result.textStream) {
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: message.content + delta }
              : message,
          ),
        }));
      }
    } catch (error) {
      const aborted =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError');
      if (!aborted) {
        set({ error: classifySdkError(error, config.preset) });
      }
    } finally {
      controller = null;
      set({ status: 'idle' });
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
