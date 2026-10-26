/**
 * Preferences → AI (Task 6.2c): multi-provider management, active provider,
 * model picker, masked key state, and advanced settings. Keys are write-only.
 */
import { useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { usePrefsStore, type AiProviderPrefs } from '@/state/prefsStore';

import { AiErrorBanner } from '@/features/ai/AiErrorBanner';
import { deleteProviderSecret, setProviderSecret } from '@/features/ai/aiIpc';
import { describeAiError, type AiErrorInfo } from '@/features/ai/errors';
import { listModels, type ModelOption } from '@/features/ai/listModels';
import { presetById } from '@/features/ai/providers';
import { useProviderStatus } from '@/features/ai/useProviderStatus';
import { configForProvider } from '@/features/ai/useAiConfig';

const inputClass = 'border-input bg-background rounded border px-2 py-1 text-xs';

function ProviderRow({ provider }: { provider: AiProviderPrefs }) {
  const activeInstanceId = usePrefsStore((state) => state.ai.activeInstanceId);
  const setActiveAiProvider = usePrefsStore((state) => state.setActiveAiProvider);
  const updateAiProvider = usePrefsStore((state) => state.updateAiProvider);
  const removeAiProvider = usePrefsStore((state) => state.removeAiProvider);
  const { status, refresh } = useProviderStatus(provider.instanceId);
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const preset = presetById(provider.presetId);
  const config = configForProvider(provider);

  if (!preset || !config) {
    return (
      <div className="flex items-center gap-2 rounded border border-rose-300 p-2 text-xs">
        <span>Unknown provider preset “{provider.presetId}”.</span>
        <button
          type="button"
          className="ml-auto underline"
          onClick={() => removeAiProvider(provider.instanceId)}
        >
          Remove
        </button>
      </div>
    );
  }

  const refreshModels = async () => {
    setBusy(true);
    setError(null);
    try {
      setOptions(await listModels(config.fetchImpl, preset, config.baseUrl, { refresh: true }));
    } catch (caught) {
      setError(describeAiError({ error: caught, preset }));
    } finally {
      setBusy(false);
    }
  };

  const saveSecret = async () => {
    if (!key.trim() && preset.auth !== 'none') {
      toast.warning('Enter the key again to re-bind this provider.');
      return;
    }
    setBusy(true);
    setError(null);
    const nextBase = (baseUrl.trim() || config.baseUrl).replace(/\/+$/, '');
    try {
      await setProviderSecret(provider.instanceId, {
        baseUrl: nextBase,
        auth: preset.auth === 'none' ? 'none' : preset.auth,
        ...(key.trim() ? { apiKey: key.trim() } : {}),
      });
      updateAiProvider(provider.instanceId, {
        ...(nextBase !== preset.baseUrl ? { baseUrlOverride: nextBase } : {}),
      });
      if (nextBase === preset.baseUrl) {
        const current = usePrefsStore
          .getState()
          .ai.providers.find((entry) => entry.instanceId === provider.instanceId);
        if (current?.baseUrlOverride) {
          updateAiProvider(provider.instanceId, { baseUrlOverride: undefined });
        }
      }
      setKey('');
      setBaseUrl('');
      refresh();
      toast.success('Provider updated');
    } catch (caught) {
      setError(describeAiError({ error: caught, preset }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="space-y-1.5 rounded border p-2"
      data-testid={`ai-provider-${provider.presetId}`}
    >
      <div className="flex items-center gap-2 text-xs">
        <input
          type="radio"
          name="active-ai-provider"
          checked={activeInstanceId === provider.instanceId}
          aria-label={`Make ${provider.label} active`}
          onChange={() => setActiveAiProvider(provider.instanceId)}
          data-testid={`ai-active-${provider.presetId}`}
        />
        <span className="font-medium">{provider.label}</span>
        <span className="text-muted-foreground">{preset.label}</span>
        <span className="ml-auto text-[11px]">
          {status?.hasKey ? (
            <span className="text-emerald-700">● key stored</span>
          ) : status?.bound ? (
            <span className="text-sky-700">● local</span>
          ) : (
            <span className="text-amber-700">⚠ not stored</span>
          )}
        </span>
        <button
          type="button"
          aria-label={`Remove ${provider.label}`}
          onClick={() => {
            void deleteProviderSecret(provider.instanceId)
              .catch(() => undefined)
              .then(() => {
                removeAiProvider(provider.instanceId);
                toast.info('Provider removed');
              });
          }}
          data-testid={`ai-remove-${provider.presetId}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <label className="flex items-center gap-2 text-[11px]">
        Model
        <input
          className={`${inputClass} flex-1`}
          value={provider.modelId}
          list={`models-${provider.instanceId}`}
          data-testid={`ai-model-${provider.presetId}`}
          onChange={(event) =>
            updateAiProvider(provider.instanceId, { modelId: event.target.value })
          }
        />
        <datalist id={`models-${provider.instanceId}`}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.tools ? ' · tools' : ''}
            </option>
          ))}
        </datalist>
        <button
          type="button"
          className="flex items-center gap-1 rounded border px-1.5 py-0.5 disabled:opacity-40"
          onClick={() => void refreshModels()}
          disabled={busy}
          data-testid={`ai-refresh-models-${provider.presetId}`}
        >
          <RefreshCw className="size-3" /> List
        </button>
      </label>

      <div className="flex items-center gap-2 text-[11px]">
        <input
          type="password"
          className={`${inputClass} flex-1`}
          placeholder={status?.hasKey ? '••••• stored — paste to replace' : 'Paste key'}
          value={key}
          autoComplete="off"
          data-testid={`ai-key-${provider.presetId}`}
          onChange={(event) => setKey(event.target.value)}
        />
        <button
          type="button"
          className="rounded border px-1.5 py-0.5 disabled:opacity-40"
          disabled={busy}
          onClick={() => void saveSecret()}
          data-testid={`ai-save-secret-${provider.presetId}`}
        >
          Save
        </button>
      </div>

      <details className="text-[11px]">
        <summary className="text-muted-foreground cursor-pointer">Advanced</summary>
        <div className="mt-1 space-y-1">
          <label className="flex items-center gap-2">
            Base URL
            <input
              className={`${inputClass} flex-1`}
              placeholder={config.baseUrl}
              value={baseUrl}
              data-testid={`ai-base-${provider.presetId}`}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <p className="text-muted-foreground">
            Changing the URL requires saving the key again (the binding lives in Rust).
          </p>
          <label className="flex items-center gap-2">
            Temperature
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              className={`${inputClass} w-20`}
              value={provider.temperature ?? ''}
              placeholder="default"
              data-testid={`ai-temperature-${provider.presetId}`}
              onChange={(event) => {
                const value = event.target.value === '' ? undefined : Number(event.target.value);
                updateAiProvider(provider.instanceId, {
                  ...(value === undefined
                    ? { temperature: undefined }
                    : { temperature: Math.min(2, Math.max(0, value)) }),
                });
              }}
            />
          </label>
        </div>
      </details>

      {error ? <AiErrorBanner info={error} onAction={() => setError(null)} /> : null}
    </div>
  );
}

export function AiSection() {
  const ai = usePrefsStore((state) => state.ai);
  return (
    <section className="space-y-1.5" data-testid="prefs-ai">
      <h3 className="text-muted-foreground font-medium">AI</h3>
      {ai.providers.length === 0 ? (
        <p className="text-muted-foreground">
          No provider configured. Open the AI drawer (Ctrl+J) and paste a key, or use a local model.
        </p>
      ) : (
        <div className="space-y-2">
          {ai.providers.map((provider) => (
            <ProviderRow key={provider.instanceId} provider={provider} />
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-[11px]">
        Keys are stored in the operating system keychain and are never written to preferences,
        recovery snapshots, or logs.
      </p>
    </section>
  );
}
