/** Chat Mode view (Task 6.5). Read-only: no tools are ever passed. */
import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, Square } from 'lucide-react';
import { toast } from 'sonner';

import { appErrorMessage } from '@/lib/errors';
import { useUiStore } from '@/state/uiStore';
import { usePrefsStore } from '@/state/prefsStore';

import { AiErrorBanner } from './AiErrorBanner';
import { AttachmentChips } from './AttachmentChips';
import {
  MAX_ATTACHMENTS,
  attachmentUnsupportedReason,
  pickAttachments,
  type ChatAttachment,
} from './attachments';
import { MessageList } from './MessageList';
import { useAttachmentDrop } from './useAttachmentDrop';
import { useChatStore } from './useChat';
import type { AiConfig } from './useAiConfig';

export function ChatView({ config }: { config: AiConfig }) {
  const messages = useChatStore((state) => state.messages);
  const status = useChatStore((state) => state.status);
  const error = useChatStore((state) => state.error);
  const send = useChatStore((state) => state.send);
  const answerQuestion = useChatStore((state) => state.answerQuestion);
  const stop = useChatStore((state) => state.stop);
  const reset = useChatStore((state) => state.reset);
  const clearError = useChatStore((state) => state.clearError);
  const aiMode = useUiStore((state) => state.aiMode);
  const setAiMode = useUiStore((state) => state.setAiMode);
  const focusNonce = useUiStore((state) => state.aiFocusNonce);
  const setPreferencesOpen = useUiStore((state) => state.setPreferencesOpen);
  const setPanelVisible = usePrefsStore((state) => state.setPanelVisible);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streaming = status === 'streaming';

  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus();
  }, [focusNonce]);

  const appendPending = (picked: ChatAttachment[]) => {
    setPending((current) => [...current, ...picked].slice(0, MAX_ATTACHMENTS));
  };

  const { dragging, dropProps } = useAttachmentDrop({
    containerRef,
    pendingCount: pending.length,
    existingNames: pending.map((item) => item.name),
    disabled: streaming,
    onAttach: appendPending,
  });

  const attach = async () => {
    try {
      const picked = await pickAttachments(MAX_ATTACHMENTS - pending.length);
      if (picked.length > 0) appendPending(picked);
    } catch (caught) {
      toast.error('Could not attach the file', { description: appErrorMessage(caught) });
    }
  };

  const submit = () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || streaming) return;
    const unsupported = attachmentUnsupportedReason(config.preset, pending);
    if (unsupported) {
      toast.error('Attachment not supported', { description: unsupported });
      return;
    }
    setInput('');
    setPending([]);
    void send(text, config, pending);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 flex-col"
      data-testid="ai-chat-view"
      {...dropProps}
    >
      {dragging ? (
        <div
          className="border-primary/60 bg-background/80 pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded border-2 border-dashed"
          data-testid="ai-drop-overlay"
        >
          <span className="bg-background rounded border px-2 py-1 text-xs font-medium shadow-xs">
            Drop images or PDFs to attach
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <MessageList
          messages={messages}
          streaming={streaming}
          onAnswerQuestion={(messageId, answers) => answerQuestion(messageId, answers, config)}
        />
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
        {pending.length > 0 ? (
          <div className="mb-1" data-testid="ai-pending-attachments">
            <AttachmentChips
              attachments={pending}
              onRemove={(id) =>
                setPending((current) => current.filter((attachment) => attachment.id !== id))
              }
            />
          </div>
        ) : null}
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
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-0.5 text-xs disabled:opacity-40"
            disabled={streaming || pending.length >= MAX_ATTACHMENTS}
            onClick={() => void attach()}
            aria-label="Attach image or PDF"
            data-testid="ai-attach"
          >
            <Paperclip className="size-3" />
          </button>
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
              disabled={input.trim() === '' && pending.length === 0}
              data-testid="ai-send"
            >
              <Send className="size-3" /> Send
            </button>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent ml-auto rounded px-2 py-0.5 text-xs"
            onClick={() => {
              setPending([]);
              reset();
            }}
            data-testid="ai-new-chat"
          >
            New chat
          </button>
        </div>
        <p className="text-muted-foreground mt-1 text-[10px]">
          Chat Mode is read-only. Attach or drop PNG, JPEG, WEBP, GIF, or PDF, or paste images (up
          to {MAX_ATTACHMENTS} files).
        </p>
      </div>
    </div>
  );
}
