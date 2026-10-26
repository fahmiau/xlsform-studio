/**
 * Build Mode view (Task 6.7): a multi-step tool loop against the staging draft.
 * The live workbook changes only when the user accepts the staged diff.
 */
import { useEffect, useRef, useState } from 'react';
import { Send, Square, Wand2 } from 'lucide-react';

import { useStagingStore } from '@/state/stagingStore';
import { useUiStore } from '@/state/uiStore';

import { AiErrorBanner } from './AiErrorBanner';
import { buildTools, type ToolTranscriptEntry } from './buildTools';
import { streamBuild } from './client';
import { classifySdkError, type AiErrorInfo } from './errors';
import { buildSystemPrompt } from './prompts';
import { buildAiContext } from './useChat';
import { modelForConfig, type AiConfig } from './useAiConfig';

interface BuildMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function BuildView({ config }: { config: AiConfig }) {
  const staged = useStagingStore((state) => state.draft !== null);
  const diff = useStagingStore((state) => state.diff);
  const lint = useStagingStore((state) => state.lint);
  const [messages, setMessages] = useState<BuildMessage[]>([]);
  const [tools, setTools] = useState<ToolTranscriptEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusNonce = useUiStore((state) => state.aiFocusNonce);
  const aiMode = useUiStore((state) => state.aiMode);
  const setAiMode = useUiStore((state) => state.setAiMode);

  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus();
  }, [focusNonce]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || staged) return;
    setInput('');
    setError(null);
    setBusy(true);
    const userMessage: BuildMessage = {
      id: `b${messages.length + 1}`,
      role: 'user',
      content: text,
    };
    const assistantMessage: BuildMessage = {
      id: `b${messages.length + 2}`,
      role: 'assistant',
      content: '',
    };
    const history = [...messages, userMessage];
    setMessages([...history, assistantMessage]);
    setTools([]);

    useStagingStore.getState().start();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = streamBuild({
        model: modelForConfig(config),
        system: buildSystemPrompt(buildAiContext()),
        messages: history.map((message) => ({ role: message.role, content: message.content })),
        tools: buildTools((entry) => setTools((current) => [...current, entry])),
        signal: controller.signal,
        ...(config.provider.temperature !== undefined
          ? { temperature: config.provider.temperature }
          : {}),
      });
      for await (const delta of result.textStream) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: message.content + delta }
              : message,
          ),
        );
      }
      const state = useStagingStore.getState();
      if (state.diff && state.diff.summary.total === 0) {
        state.revert();
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id && message.content.trim() === ''
              ? { ...message, content: 'No changes were proposed.' }
              : message,
          ),
        );
      }
    } catch (caught) {
      const aborted =
        (caught instanceof DOMException && caught.name === 'AbortError') ||
        (caught instanceof Error && caught.name === 'AbortError');
      if (!aborted) setError(classifySdkError(caught, config.preset));
      const state = useStagingStore.getState();
      if (state.diff && state.diff.summary.total === 0) state.revert();
    } finally {
      abortRef.current = null;
      useStagingStore.getState().setRunning(false);
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="ai-build-view">
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

        {messages.map((message) => (
          <div key={message.id} data-role={message.role} className="text-xs">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </p>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}

        {tools.length > 0 ? (
          <div className="space-y-1" data-testid="ai-tool-transcript">
            {tools.map((entry, index) => (
              <details
                key={`${entry.name}-${index}`}
                className="rounded border px-2 py-1 text-[11px]"
              >
                <summary className="cursor-pointer">
                  <span className={entry.ok ? 'text-emerald-700' : 'text-rose-700'}>
                    {entry.ok ? '✓' : '✕'} {entry.name}
                  </span>{' '}
                  — {entry.summary}
                </summary>
                {entry.errors.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-rose-700">
                    {entry.errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            ))}
          </div>
        ) : null}

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
              disabled={staged || input.trim() === ''}
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
              setTools([]);
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
