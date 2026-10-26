/**
 * One banner for every AI failure mode (Task 6.2d). Displays the mapping from
 * `errors.ts` and offers exactly one next action.
 */
import { AlertTriangle } from 'lucide-react';

import { openExternalUrl } from './openExternal';
import type { AiErrorAction, AiErrorInfo } from './errors';

const ACTION_LABEL: Record<AiErrorAction, string | null> = {
  'replace-key': 'Replace key',
  'open-billing': 'Open billing',
  'open-model-picker': 'Choose model',
  'ollama-serve': 'Show command',
  retry: 'Retry',
  'keychain-docs': 'Learn more',
  none: null,
};

export interface AiErrorBannerProps {
  info: AiErrorInfo;
  onAction?: (action: AiErrorAction) => void;
  className?: string;
}

export function AiErrorBanner({ info, onAction, className = '' }: AiErrorBannerProps) {
  const label = ACTION_LABEL[info.action];
  return (
    <div
      className={`rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 ${className}`}
      data-testid="ai-error-banner"
      data-action={info.action}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium" data-testid="ai-error-title">
            {info.title}
          </p>
          <p data-testid="ai-error-message">{info.message}</p>
          {info.action === 'ollama-serve' ? (
            <code className="block font-mono text-[11px]" data-testid="ai-error-command">
              ollama serve
            </code>
          ) : null}
          {info.detail ? (
            <details className="text-amber-900/80">
              <summary className="cursor-pointer select-none">Provider detail</summary>
              <p className="mt-1 break-words font-mono text-[11px]">{info.detail}</p>
            </details>
          ) : null}
          {label ? (
            <button
              type="button"
              className="rounded border border-amber-400 bg-white/60 px-2 py-0.5 font-medium hover:bg-white"
              data-testid="ai-error-action"
              onClick={() => {
                if (info.link) void openExternalUrl(info.link);
                onAction?.(info.action);
              }}
            >
              {label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
