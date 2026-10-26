/**
 * Friendly AI error mapping (Tasks 6.2d / 6.3).
 *
 * One table for setup, test connection, chat, and build. Every row gives a
 * plain-language message plus at most one next action.
 */
import type { ProviderPreset } from './providers';

export type AiErrorAction =
  | 'replace-key'
  | 'open-billing'
  | 'open-model-picker'
  | 'ollama-serve'
  | 'retry'
  | 'keychain-docs'
  | 'none';

export interface AiErrorInfo {
  /** Short title for the banner. */
  title: string;
  /** One or two sentences of plain language. */
  message: string;
  action: AiErrorAction;
  /** Optional link target (provider key/billing page). */
  link?: string;
  /** Whether showing a Retry button makes sense. */
  retryable: boolean;
  /** Original provider detail, for the collapsible section. */
  detail?: string;
}

export interface AiErrorInput {
  /** HTTP status from the provider, when there was one. */
  status?: number;
  /** Provider response body (JSON or text). */
  body?: string;
  /** Transport / IPC error. */
  error?: unknown;
  preset?: ProviderPreset;
  modelId?: string;
}

function errorText(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const record = error as { detail?: unknown; message?: unknown; kind?: unknown };
    if (typeof record.detail === 'string') return record.detail;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.kind === 'string') return record.kind;
  }
  return '';
}

/** Pull `error.message` out of a provider JSON error, else a short excerpt. */
export function providerErrorDetail(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error && typeof parsed.error.message === 'string') return parsed.error.message;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Not JSON: show a trimmed text excerpt.
  }
  const trimmed = body.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 300) : undefined;
}

function quotaLike(status: number | undefined, body: string | undefined): boolean {
  if (status === 402) return true;
  if (status !== 429) return false;
  const text = (body ?? '').toLowerCase();
  return (
    text.includes('quota') ||
    text.includes('credit') ||
    text.includes('insufficient') ||
    text.includes('billing') ||
    text.includes('rate limit')
  );
}

export function describeAiError(input: AiErrorInput): AiErrorInfo {
  const { status, preset, modelId } = input;
  const detail = providerErrorDetail(input.body);
  const text = `${errorText(input.error)} ${input.body ?? ''}`.toLowerCase();
  const keyPage = preset?.keyPageUrl;
  const billingPage = preset?.billingUrl;

  // Local setup validation, not a provider failure: show the exact hint.
  const setupHint = [
    'valid http(s) base url',
    'enter the model id',
    'paste an api key',
    'pick a provider',
    'enter the key again',
  ].find((hint) => text.includes(hint));
  if (setupHint) {
    return {
      title: 'Check the setup',
      message: errorText(input.error),
      action: 'none',
      retryable: false,
    };
  }

  if (status === 401 || status === 403) {
    return {
      title: 'The key was rejected',
      message:
        'Check the key and paste it again. It may have been revoked or belong to another provider.',
      action: 'replace-key',
      ...(keyPage ? { link: keyPage } : {}),
      retryable: false,
      ...(detail ? { detail } : {}),
    };
  }

  if (quotaLike(status, input.body)) {
    return {
      title: 'Out of credits or rate limited',
      message: 'The provider refused this request. Check your plan or add credits, then try again.',
      action: 'open-billing',
      ...(billingPage ? { link: billingPage } : {}),
      retryable: true,
      ...(detail ? { detail } : {}),
    };
  }

  if (status === 404) {
    if (preset?.local) {
      return {
        title: 'Model not found',
        message: `That model is not installed locally. Run \`ollama pull ${modelId ?? '<model>'}\` and try again.`,
        action: 'open-model-picker',
        retryable: false,
        ...(detail ? { detail } : {}),
      };
    }
    return {
      title: 'Model not found',
      message: 'Pick another model. The provider may have retired this one.',
      action: 'open-model-picker',
      retryable: false,
      ...(detail ? { detail } : {}),
    };
  }

  if (
    text.includes('econnrefused') ||
    text.includes('connection refused') ||
    text.includes('error sending request')
  ) {
    if (preset?.local) {
      return {
        title: `${preset.label.replace(' (local)', '')} isn’t running`,
        message: 'Start the local server, then try again.',
        action: 'ollama-serve',
        retryable: true,
        ...(detail ? { detail } : {}),
      };
    }
    return {
      title: 'Could not reach the provider',
      message: 'The connection was refused. Check your network and the provider base URL.',
      action: 'retry',
      retryable: true,
      ...(detail ? { detail } : {}),
    };
  }

  if (
    text.includes('dns') ||
    text.includes('enotfound') ||
    text.includes('failed to fetch') ||
    text.includes('no route') ||
    text.includes('offline')
  ) {
    return {
      title: 'No internet connection',
      message: preset?.local
        ? 'Local providers still work without a connection.'
        : 'Connect to the internet, then try again. Local providers still work offline.',
      action: 'retry',
      retryable: true,
      ...(detail ? { detail } : {}),
    };
  }

  if (text.includes('keychain') || text.includes('keyring') || text.includes('credential store')) {
    return {
      title: 'System keychain not available',
      message:
        'This system has no credential store, so keys cannot be saved securely. Local models still work without one.',
      action: 'keychain-docs',
      retryable: false,
      ...(detail ? { detail } : {}),
    };
  }

  if (text.includes('abort')) {
    return {
      title: 'Stopped',
      message: 'Generation was stopped.',
      action: 'none',
      retryable: false,
    };
  }

  return {
    title: 'The AI request failed',
    message: 'Something went wrong talking to the provider. Try again.',
    action: 'retry',
    retryable: true,
    ...(detail ? { detail } : {}),
  };
}

/** Split an SDK error message like `401 {"error":...}` when possible. */
export function classifySdkError(error: unknown, preset?: ProviderPreset): AiErrorInfo {
  const text = errorText(error);
  const statusMatch = /\b(401|402|403|404|429)\b/.exec(text);
  const bodyStart = text.indexOf('{');
  const body = bodyStart >= 0 ? text.slice(bodyStart) : undefined;
  return describeAiError({
    ...(statusMatch?.[1] ? { status: Number(statusMatch[1]) } : {}),
    ...(body ? { body } : {}),
    error,
    ...(preset ? { preset } : {}),
  });
}
