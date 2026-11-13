/**
 * Inline live AI process indicator (status + step list) for Chat and Build Mode.
 */
import { Check, Loader2, Square, X } from 'lucide-react';

import type { AiProcessState, ProcessStep, ProcessStepStatus } from './aiProcess';

function StepIcon({ status }: { status: ProcessStepStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="text-primary size-3 shrink-0 animate-spin" aria-hidden />;
    case 'done':
      return <Check className="size-3 shrink-0 text-emerald-600" aria-hidden />;
    case 'error':
      return <X className="size-3 shrink-0 text-rose-600" aria-hidden />;
    case 'stopped':
      return <Square className="text-muted-foreground size-2.5 shrink-0" aria-hidden />;
  }
}

function StepList({ steps }: { steps: ProcessStep[] }) {
  return (
    <ul className="space-y-1" data-testid="ai-process-steps">
      {steps.map((step) => (
        <li
          key={step.id}
          className="space-y-0.5 text-[11px]"
          data-testid="ai-process-step"
          data-step-status={step.status}
        >
          <div className="flex items-center gap-1.5">
            <StepIcon status={step.status} />
            <span
              className={
                step.status === 'running'
                  ? 'text-foreground font-medium'
                  : step.status === 'error'
                    ? 'text-rose-700'
                    : 'text-muted-foreground'
              }
            >
              {step.label}
              {step.status === 'running' ? '…' : ''}
            </span>
            {step.detail ? (
              <span className="text-muted-foreground truncate">— {step.detail}</span>
            ) : null}
          </div>
          {step.errors && step.errors.length > 0 ? (
            <ul className="list-disc pl-5 text-rose-700">
              {step.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function finishedSummary(steps: ProcessStep[]): string {
  if (steps.some((step) => step.status === 'stopped')) return 'Stopped';
  if (steps.some((step) => step.status === 'error')) return 'Failed';
  const count = steps.length;
  return `Process · ${count} ${count === 1 ? 'step' : 'steps'}`;
}

export function AiProcessStatus({ process }: { process?: AiProcessState }) {
  if (!process || process.steps.length === 0) return null;

  if (process.running) {
    return (
      <div
        className="bg-muted/40 space-y-1.5 rounded border px-2 py-1.5 text-[11px]"
        data-testid="ai-process-status"
        data-running="true"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-1.5" data-testid="ai-process-active">
          <Loader2 className="text-primary size-3 shrink-0 animate-spin" aria-hidden />
          <span className="font-medium">{process.activeLabel ?? 'Working…'}</span>
        </div>
        <StepList steps={process.steps} />
      </div>
    );
  }

  const toolSteps = process.steps.filter(
    (step) => step.kind === 'tool' && step.toolName !== 'ask_question',
  );
  if (toolSteps.length > 0) {
    return (
      <div className="space-y-1" data-testid="ai-process-status" data-running="false">
        <div className="space-y-1" data-testid="ai-tool-transcript">
          {toolSteps.map((step) => (
            <details key={step.id} className="rounded border px-2 py-1 text-[11px]">
              <summary className="cursor-pointer">
                <span className={step.status === 'done' ? 'text-emerald-700' : 'text-rose-700'}>
                  {step.status === 'done' ? '✓' : '✕'} {step.toolName ?? step.label}
                </span>
                {step.detail ? ` — ${step.detail}` : ''}
              </summary>
              {step.errors && step.errors.length > 0 ? (
                <ul className="mt-1 list-disc pl-4 text-rose-700">
                  {step.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </details>
          ))}
        </div>
        {process.steps.some((step) => step.status === 'stopped') ? (
          <p className="text-muted-foreground text-[11px]">Stopped</p>
        ) : null}
      </div>
    );
  }

  return (
    <details
      className="text-muted-foreground text-[11px]"
      data-testid="ai-process-status"
      data-running="false"
    >
      <summary className="cursor-pointer select-none">{finishedSummary(process.steps)}</summary>
      <div className="mt-1 pl-1">
        <StepList steps={process.steps} />
      </div>
    </details>
  );
}
