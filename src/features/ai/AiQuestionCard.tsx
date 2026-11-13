/**
 * Interactive choice/clarification prompt card shared by Chat and Build Mode.
 */
import { useState } from 'react';
import { Check, HelpCircle } from 'lucide-react';

import type { AiQuestionAnswer, AiQuestionState } from './aiQuestion';

export interface AiQuestionCardProps {
  state: AiQuestionState;
  disabled?: boolean;
  onAnswer: (answers: AiQuestionAnswer[]) => void;
  onSkip: () => void;
}

export function AiQuestionCard({ state, disabled = false, onAnswer, onSkip }: AiQuestionCardProps) {
  const [selectedByIdx, setSelectedByIdx] = useState<Record<number, string[]>>({});
  const [customByIdx, setCustomByIdx] = useState<Record<number, string>>({});

  if (state.status !== 'pending') {
    return (
      <div
        className="bg-muted/30 text-muted-foreground space-y-1 rounded border px-2 py-1.5 text-[11px]"
        data-testid="ai-question-card"
        data-status={state.status}
      >
        {state.status === 'answered' && state.answers && state.answers.length > 0 ? (
          state.answers.map((item) => (
            <div key={item.question} className="flex items-start gap-1.5">
              <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" aria-hidden />
              <span>
                <span className="text-foreground font-medium">{item.question}:</span>{' '}
                {item.selected.join(', ')}
              </span>
            </div>
          ))
        ) : (
          <span>{state.status === 'skipped' ? 'Skipped' : 'Cancelled'}</span>
        )}
      </div>
    );
  }

  const singleImmediate = state.questions.length === 1 && !state.questions[0]?.multiSelect;

  const toggleOption = (idx: number, option: string, multiSelect: boolean) => {
    setSelectedByIdx((current) => {
      const prev = current[idx] ?? [];
      if (!multiSelect) {
        return { ...current, [idx]: prev[0] === option ? [] : [option] };
      }
      const next = prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option];
      return { ...current, [idx]: next };
    });
  };

  const buildAnswers = (): AiQuestionAnswer[] =>
    state.questions
      .map((item, idx) => {
        const picked = selectedByIdx[idx] ?? [];
        const custom = (customByIdx[idx] ?? '').trim();
        const combined = item.multiSelect
          ? [...picked, ...(custom ? [custom] : [])]
          : picked.length > 0
            ? picked
            : custom
              ? [custom]
              : [];
        return { question: item.question, selected: combined };
      })
      .filter((item) => item.selected.length > 0);

  const canSubmit = singleImmediate
    ? (customByIdx[0] ?? '').trim().length > 0
    : buildAnswers().length > 0;

  const submitAll = () => {
    const answers = buildAnswers();
    if (answers.length > 0) onAnswer(answers);
  };

  return (
    <div
      className="bg-muted/30 space-y-2 rounded border p-2 text-xs"
      data-testid="ai-question-card"
      data-status="pending"
    >
      {state.questions.map((item, idx) => {
        const selected = selectedByIdx[idx] ?? [];
        const custom = customByIdx[idx] ?? '';
        return (
          <div key={`${item.question}-${idx}`} className="space-y-1.5">
            <p className="flex items-start gap-1.5 font-medium">
              <HelpCircle className="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{item.question}</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {item.options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={disabled}
                    data-testid="ai-question-option"
                    aria-pressed={isSelected}
                    className={`rounded border px-2 py-1 text-left text-[11px] transition-colors disabled:opacity-40 ${
                      isSelected
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'border-border bg-background hover:bg-accent'
                    }`}
                    onClick={() => {
                      if (singleImmediate) {
                        onAnswer([{ question: item.question, selected: [option] }]);
                      } else {
                        toggleOption(idx, option, Boolean(item.multiSelect));
                      }
                    }}
                  >
                    {item.multiSelect ? `${isSelected ? '☑ ' : '☐ '}${option}` : option}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="text"
                disabled={disabled}
                value={custom}
                placeholder="Other answer…"
                data-testid="ai-question-other"
                className="border-input bg-background min-w-0 flex-1 rounded border px-2 py-0.5 text-[11px]"
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomByIdx((current) => ({ ...current, [idx]: value }));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (singleImmediate && custom.trim()) {
                      onAnswer([{ question: item.question, selected: [custom.trim()] }]);
                    } else if (!singleImmediate && canSubmit) {
                      submitAll();
                    }
                  }
                }}
              />
              {singleImmediate ? (
                <button
                  type="button"
                  disabled={disabled || !canSubmit}
                  data-testid="ai-question-submit"
                  className="bg-primary text-primary-foreground rounded px-2 py-0.5 text-[11px] disabled:opacity-40"
                  onClick={() => {
                    const trimmed = custom.trim();
                    if (trimmed) {
                      onAnswer([{ question: item.question, selected: [trimmed] }]);
                    }
                  }}
                >
                  Send
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-1 pt-0.5">
        {!singleImmediate ? (
          <button
            type="button"
            disabled={disabled || !canSubmit}
            data-testid="ai-question-submit"
            className="bg-primary text-primary-foreground rounded px-2 py-0.5 text-[11px] disabled:opacity-40"
            onClick={submitAll}
          >
            Submit
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          data-testid="ai-question-skip"
          className="text-muted-foreground hover:bg-accent rounded px-2 py-0.5 text-[11px] disabled:opacity-40"
          onClick={onSkip}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
