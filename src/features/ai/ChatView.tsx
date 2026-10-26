/** Chat Mode view (Task 6.5). Read-only: no tools are ever passed. */
import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';

import { useUiStore } from '@/state/uiStore';
import { usePrefsStore } from '@/state/prefsStore';

import { AiErrorBanner } from './AiErrorBanner';
import { MessageList } from './MessageList';
import { useChatStore } from './useChat';
import type { AiConfig } from './useAiConfig';

export function ChatView({ config }: { config: AiConfig }) {
  const messages = useChatStore((state) => state.messages);
  const status = useChatStore((state) => state.status);
  const error = useChatStore((state) => state.error);
  const send = useChatStore((state) => state.send);
  const stop = useChatStore((state) => state.stop);
  const reset = useChatStore((state) => state.reset);
  const clearError = useChatStore((state) => state.clearError);
  const aiMode = useUiStore((state) => state.aiMode);
  const setAiMode = useUiStore((state) => state.setAiMode);
  const focusNonce = useUiStore((state) => state.aiFocusNonce);
  const setPreferencesOpen = useUiStore((state) => state.setPreferencesOpen);
  const setPanelVisible = usePrefsStore((state) => state.setPanelVisible);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streaming = status === 'streaming';

  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus();
  }, [focusNonce]);

  const submit = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void send(text, config);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="ai-chat-view">
      <div className="min-h-0 flex-1 overflow-auto">
        <MessageList messages={messages} streaming={streaming} />
      </div>

      {error ? (
        <AiErrorBanner
          className="m-2"
          info={error}
          onAction={(action) => {
            clearError();
            if (action === 'replace-key') {
              setPanelVisible('right', true);
              setPreferencesOpen(true);
            }
          }}
        />
      ) : null}

      <div className="border-t p-2">
        <textarea
          id="ai-input"
          ref={inputRef}
          className="border-input bg-background min-h-[60px] w-full resize-y rounded border px-2 py-1 text-xs"
          placeholder="Ask about this form… (Tab on an empty box switches to Build)"
          value={input}
          data-testid="ai-chat-input"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Tab' && !event.shiftKey && input === '') {
              event.preventDefault();
              setAiMode(aiMode === 'chat' ? 'build' : 'chat');
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-1 flex items-center gap-1">
          {streaming ? (
            <button
              type="button"
              className="border-border flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
              onClick={stop}
              data-testid="ai-stop"
            >
              <Square className="size-3" /> Stop
            </button>
          ) : (
            <button
              type="button"
              className="bg-primary text-primary-foreground flex items-center gap-1 rounded px-2 py-0.5 text-xs disabled:opacity-40"
              onClick={submit}
              disabled={input.trim() === ''}
              data-testid="ai-send"
            >
              <Send className="size-3" /> Send
            </button>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent ml-auto rounded px-2 py-0.5 text-xs"
            onClick={reset}
            data-testid="ai-new-chat"
          >
            New chat
          </button>
        </div>
        <p className="text-muted-foreground mt-1 text-[10px]">
          Chat Mode is read-only. Code blocks have “Insert into Active Cell”.
        </p>
      </div>
    </div>
  );
}
