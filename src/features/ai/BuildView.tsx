/**
 * Build Mode view (Task 6.7): a multi-step tool loop against the staging draft.
 * The live workbook changes only when the user accepts the staged diff.
 */
import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, Square, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { appErrorMessage } from '@/lib/errors';
import { selectReviewPending, useStagingStore } from '@/state/stagingStore';
import { useUiStore } from '@/state/uiStore';

import { AiErrorBanner } from './AiErrorBanner';
import { AiProcessStatus } from './AiProcessStatus';
import {
  consumeAiStream,
  createInitialProcessState,
  finalizeProcessState,
  type AiProcessState,
} from './aiProcess';
import { AiQuestionCard } from './AiQuestionCard';
import {
  formatAnswersAsMessage,
  splitQuestionBlocks,
  type AiQuestionAnswer,
  type AiQuestionState,
  type AskQuestionInput,
  type AskQuestionToolResult,
} from './aiQuestion';
import { AttachmentChips } from './AttachmentChips';
import {
  MAX_ATTACHMENTS,
  attachmentUnsupportedReason,
  pickAttachments,
  toModelMessages,
  type ChatAttachment,
} from './attachments';
import { buildTools } from './buildTools';
import { streamBuild } from './client';
import { classifySdkError, type AiErrorInfo } from './errors';
import { buildSystemPrompt } from './prompts';
import { useAttachmentDrop } from './useAttachmentDrop';
import { buildAiContext, type ChatQuestionResult } from './useChat';
import { modelForConfig, type AiConfig } from './useAiConfig';

interface BuildMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
  process?: AiProcessState;
  questions?: AiQuestionState[];
  textQuestionResult?: ChatQuestionResult;
}

interface PendingQuestionResolver {
  id: string;
  resolve: (result: AskQuestionToolResult) => void;
}

export function BuildView({ config }: { config: AiConfig }) {
  const staged = useStagingStore(selectReviewPending);
  const diff = useStagingStore((state) => state.diff);
  const lint = useStagingStore((state) => state.lint);
  const [messages, setMessages] = useState<BuildMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingQuestionRef = useRef<PendingQuestionResolver | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusNonce = useUiStore((state) => state.aiFocusNonce);
  const aiMode = useUiStore((state) => state.aiMode);
  const setAiMode = useUiStore((state) => state.setAiMode);

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
    disabled: busy || staged,
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

  const resolveToolQuestion = (
    messageId: string,
    questionId: string,
    answers: AiQuestionAnswer[] | null,
  ) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              questions: (message.questions ?? []).map((item) =>
                item.id === questionId
                  ? {
                      ...item,
                      status: answers ? 'answered' : 'skipped',
                      ...(answers ? { answers } : {}),
                    }
                  : item,
              ),
            }
          : message,
      ),
    );
    if (pendingQuestionRef.current?.id === questionId) {
      pendingQuestionRef.current.resolve({
        ok: true,
        summary: answers ? 'answered' : 'skipped',
        skipped: !answers,
        answers: answers ?? [],
      });
    }
  };

  const runPrompt = async (text: string, attachments: ChatAttachment[]) => {
    if ((!text && attachments.length === 0) || busy || staged) return;
    setError(null);
    setBusy(true);
    const userMessage: BuildMessage = {
      id: `b${messages.length + 1}`,
      role: 'user',
      content: text,
      ...(attachments.length > 0 ? { attachments } : {}),
    };
    const assistantMessage: BuildMessage = {
      id: `b${messages.length + 2}`,
      role: 'assistant',
      content: '',
      process: createInitialProcessState(),
    };
    const history = [...messages, userMessage];
    setMessages([...history, assistantMessage]);

    const onAskQuestion = (questionInput: AskQuestionInput, signal?: AbortSignal) =>
      new Promise<AskQuestionToolResult>((resolve, reject) => {
        const id = `bq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const entry: AiQuestionState = {
          id,
          questions: questionInput.questions,
          status: 'pending',
        };
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, questions: [...(message.questions ?? []), entry] }
              : message,
          ),
        );
        const cleanup = () => {
          signal?.removeEventListener('abort', onAbort);
          if (pendingQuestionRef.current?.id === id) {
            pendingQuestionRef.current = null;
          }
        };
        const onAbort = () => {
          cleanup();
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    questions: (message.questions ?? []).map((item) =>
                      item.id === id && item.status === 'pending'
                        ? { ...item, status: 'cancelled' }
                        : item,
                    ),
                  }
                : message,
            ),
          );
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
        pendingQuestionRef.current = {
          id,
          resolve: (result) => {
            cleanup();
            resolve(result);
          },
        };
      });

    useStagingStore.getState().start();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = streamBuild({
        model: modelForConfig(config),
        system: buildSystemPrompt(buildAiContext()),
        messages: toModelMessages(history),
        tools: buildTools(undefined, { onAskQuestion }),
        signal: controller.signal,
        ...(config.provider.temperature !== undefined
          ? { temperature: config.provider.temperature }
          : {}),
      });
      const finalProcess = await consumeAiStream(result.fullStream, (delta, process) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: message.content + delta, process }
              : message,
          ),
        );
      });
      const state = useStagingStore.getState();
      const revertedEmpty = Boolean(state.diff && state.diff.summary.total === 0);
      if (revertedEmpty) state.revert();
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                process: finalProcess,
                ...(revertedEmpty && message.content.trim() === ''
                  ? { content: 'No changes were proposed.' }
                  : {}),
              }
            : message,
        ),
      );
    } catch (caught) {
      const aborted =
        (caught instanceof DOMException && caught.name === 'AbortError') ||
        (caught instanceof Error && caught.name === 'AbortError');
      if (!aborted) setError(classifySdkError(caught, config.preset));
      setMessages((current) =>
        current.map((message) =>
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
      );
      const state = useStagingStore.getState();
      if (state.diff && state.diff.summary.total === 0) state.revert();
    } finally {
      pendingQuestionRef.current = null;
      abortRef.current = null;
      useStagingStore.getState().setRunning(false);
      setBusy(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || busy || staged) return;
    const unsupported = attachmentUnsupportedReason(config.preset, pending);
    if (unsupported) {
      toast.error('Attachment not supported', { description: unsupported });
      return;
    }
    const attachments = pending;
    setInput('');
    setPending([]);
    await runPrompt(text, attachments);
  };

  const answerTextQuestion = (messageId: string, answers: AiQuestionAnswer[] | null) => {
    if (busy || staged) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              textQuestionResult: answers ? { status: 'answered', answers } : { status: 'skipped' },
            }
          : message,
      ),
    );
    if (answers && answers.length > 0) {
      void runPrompt(formatAnswersAsMessage(answers), []);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 flex-col"
      data-testid="ai-build-view"
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
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {messages.length === 0 ? (
          <div className="text-muted-foreground space-y-1 text-xs" data-testid="ai-build-empty">
            <p className="flex items-center gap-1 font-medium">
              <Wand2 className="size-3.5" /> Describe a change
            </p>
            <p>
              Build Mode stages every tool call, shows a coloured diff, and waits for Accept. Try:
              “Add a select_one for education level with 5 Indonesian tiers”.
            </p>
          </div>
        ) : null}

        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const parsedQuestions =
            message.role === 'assistant'
              ? splitQuestionBlocks(message.content, busy && isLast)
              : null;
          return (
            <div key={message.id} data-role={message.role} className="space-y-1 text-xs">
              <p className="text-muted-foreground text-[10px] font-medium uppercase">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </p>
              {message.role === 'assistant' ? (
                <div className="space-y-1.5">
                  <AiProcessStatus process={message.process} />
                  {(message.questions ?? []).map((item) => (
                    <AiQuestionCard
                      key={item.id}
                      state={item}
                      onAnswer={(answers) => resolveToolQuestion(message.id, item.id, answers)}
                      onSkip={() => resolveToolQuestion(message.id, item.id, null)}
                    />
                  ))}
                  {parsedQuestions?.text ? (
                    <p className="whitespace-pre-wrap">{parsedQuestions.text}</p>
                  ) : null}
                  {parsedQuestions?.streamingIncomplete ? (
                    <p className="text-muted-foreground text-[11px]">Preparing choices…</p>
                  ) : null}
                  {parsedQuestions && parsedQuestions.questions.length > 0 ? (
                    <AiQuestionCard
                      state={{
                        id: `${message.id}-tq`,
                        questions: parsedQuestions.questions,
                        status:
                          message.textQuestionResult?.status ?? (isLast ? 'pending' : 'skipped'),
                        ...(message.textQuestionResult?.answers
                          ? { answers: message.textQuestionResult.answers }
                          : {}),
                      }}
                      disabled={busy || staged || !isLast}
                      onAnswer={(answers) => answerTextQuestion(message.id, answers)}
                      onSkip={() => answerTextQuestion(message.id, null)}
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  {message.content ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : null}
                  <AttachmentChips attachments={message.attachments ?? []} />
                </>
              )}
            </div>
          );
        })}

        {staged && diff ? (
          <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-[11px] text-emerald-900">
            <p className="font-medium">Review the staged changes</p>
            <p>{diff.summary.text}.</p>
            {lint && lint.added.length > 0 ? (
              <p className="text-amber-800">
                {lint.added.length} new lint issue{lint.added.length === 1 ? '' : 's'} introduced.
              </p>
            ) : null}
            <p>Accept or Revert below before prompting again.</p>
          </div>
        ) : null}

        {error ? (
          <AiErrorBanner
            info={error}
            onAction={() => {
              setError(null);
            }}
          />
        ) : null}
      </div>

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
          placeholder={
            staged
              ? 'Accept or Revert the staged changes first'
              : 'Describe rows or choices to add…'
          }
          value={input}
          disabled={staged}
          data-testid="ai-build-input"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Tab' && !event.shiftKey && input === '') {
              event.preventDefault();
              setAiMode(aiMode === 'chat' ? 'build' : 'chat');
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-0.5 text-xs disabled:opacity-40"
            disabled={busy || staged || pending.length >= MAX_ATTACHMENTS}
            onClick={() => void attach()}
            aria-label="Attach image or PDF"
            data-testid="ai-build-attach"
          >
            <Paperclip className="size-3" />
          </button>
          {busy ? (
            <button
              type="button"
              className="border-border flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
              onClick={() => abortRef.current?.abort()}
              data-testid="ai-build-stop"
            >
              <Square className="size-3" /> Stop
            </button>
          ) : (
            <button
              type="button"
              className="bg-primary text-primary-foreground flex items-center gap-1 rounded px-2 py-0.5 text-xs disabled:opacity-40"
              onClick={() => void send()}
              disabled={staged || (input.trim() === '' && pending.length === 0)}
              data-testid="ai-build-send"
            >
              <Send className="size-3" /> Run
            </button>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent ml-auto rounded px-2 py-0.5 text-xs"
            onClick={() => {
              setMessages([]);
              setPending([]);
              setError(null);
            }}
          >
            Clear transcript
          </button>
        </div>
        <p className="text-muted-foreground mt-1 text-[10px]">
          {config.provider.modelId}
          {lint && lint.added.length > 0
            ? ` · ${lint.added.length} new lint issue${lint.added.length === 1 ? '' : 's'}`
            : ''}
        </p>
      </div>
    </div>
  );
}
