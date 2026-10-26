/**
 * BYOK setup: three cards — paste a key, use a local model, or a custom
 * OpenAI-compatible endpoint (Task 6.2b). The happy path is paste → Save.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Laptop, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

import { newProviderInstanceId, usePrefsStore } from '@/state/prefsStore';

import { AiErrorBanner } from './AiErrorBanner';
import { setProviderSecret, tauriProxyTransport } from './aiIpc';
import { detectProvider } from './detectProvider';
import { describeAiError, type AiErrorInfo } from './errors';
import { defaultModel, listModels, probeLocal, type LocalProbeResult } from './listModels';
import { openExternalUrl } from './openExternal';
import { createProxyFetch } from './proxyFetch';
import { LOCAL_PRESETS, PASTE_PRESETS, presetById, type ProviderPreset } from './providers';
import type { AiConfig } from './useAiConfig';

const inputClass = 'border-input bg-background w-full rounded border px-2 py-1 text-xs';
const buttonClass =
  'rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40';

async function connect(
  preset: ProviderPreset,
  options: { apiKey?: string; baseUrl?: string; modelId?: string; label?: string },
): Promise<AiConfig> {
  const baseUrl = (options.baseUrl ?? preset.baseUrl).replace(/\/+$/, '');
  const keyless = !options.apiKey || preset.auth === 'none';
  const instanceId = newProviderInstanceId();
  await setProviderSecret(instanceId, {
    baseUrl,
    auth: keyless ? 'none' : preset.auth,
    ...(options.apiKey && !keyless ? { apiKey: options.apiKey } : {}),
  });

  const provider = {
    instanceId,
    presetId: preset.id,
    label: options.label ?? preset.label,
    modelId: options.modelId?.trim() || defaultModel(preset),
    ...(baseUrl !== preset.baseUrl ? { baseUrlOverride: baseUrl } : {}),
  };
  usePrefsStore.getState().upsertAiProvider(provider);

  const fetchImpl = createProxyFetch(instanceId, baseUrl, tauriProxyTransport);
  try {
    const models = await listModels(fetchImpl, preset, baseUrl, { refresh: true });
    const modelId = options.modelId?.trim() || defaultModel(preset, models) || provider.modelId;
    if (modelId) usePrefsStore.getState().updateAiProvider(instanceId, { modelId });
  } catch {
    // The binding is valid but the listing failed; the drawer shows the real
    // error on the first request and the model can still be typed manually.
  }
  const saved = usePrefsStore
    .getState()
    .ai.providers.find((entry) => entry.instanceId === instanceId)!;
  return { provider: saved, preset, baseUrl, fetchImpl };
}

export function SetupCards({ onConfigured }: { onConfigured?: (config: AiConfig) => void }) {
  const [key, setKey] = useState('');
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState('https://');
  const [customKey, setCustomKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [probes, setProbes] = useState<Record<string, LocalProbeResult | null>>({});

  const detected = useMemo(() => detectProvider(key), [key]);
  const preset = overrideId ? presetById(overrideId) : (detected?.preset ?? null);

  useEffect(() => {
    let alive = true;
    for (const local of LOCAL_PRESETS) {
      const probeId = `probe_${local.id}`;
      void setProviderSecret(probeId, { baseUrl: local.baseUrl, auth: 'none' })
        .then(() =>
          probeLocal(createProxyFetch(probeId, local.baseUrl, tauriProxyTransport), local),
        )
        .then((result) => {
          if (alive) setProbes((current) => ({ ...current, [local.id]: result }));
        })
        .catch(() => {
          if (alive) setProbes((current) => ({ ...current, [local.id]: null }));
        });
    }
    return () => {
      alive = false;
    };
  }, []);

  const run = async (action: () => Promise<AiConfig>) => {
    setBusy(true);
    setError(null);
    try {
      const config = await action();
      setKey('');
      toast.success('Provider configured');
      onConfigured?.(config);
    } catch (caught) {
      setError(describeAiError({ error: caught, ...(preset ? { preset } : {}) }));
    } finally {
      setBusy(false);
    }
  };

  const savePastedKey = () => {
    const chosen = preset;
    if (!chosen) {
      setError(describeAiError({ error: new Error('Pick a provider for this key.') }));
      return;
    }
    if (!key.trim() && chosen.auth !== 'none') {
      setError(describeAiError({ error: new Error('Paste an API key first.') }));
      return;
    }
    void run(() =>
      connect(chosen, { apiKey: key, ...(overrideId ? { label: chosen.label } : {}) }),
    );
  };

  const connectLocal = (local: ProviderPreset) => {
    void run(() => connect(local, {}));
  };

  const saveCustom = () => {
    const baseUrl = customUrl.trim();
    if (!/^https?:\/\/[^\s/]+/.test(baseUrl)) {
      setError(describeAiError({ error: new Error('Enter a valid http(s) base URL.') }));
      return;
    }
    const custom = presetById('custom');
    if (!custom) return;
    if (!customModel.trim()) {
      setError(describeAiError({ error: new Error('Enter the model ID to use.') }));
      return;
    }
    void run(() =>
      connect(custom, {
        baseUrl,
        modelId: customModel,
        ...(customKey.trim() ? { apiKey: customKey.trim() } : {}),
        label: 'Custom',
      }),
    );
  };

  return (
    <div className="h-full space-y-3 overflow-auto p-3" data-testid="ai-setup">
      {error ? (
        <AiErrorBanner
          info={error}
          onAction={() => {
            setError(null);
          }}
        />
      ) : null}

      <section className="space-y-2 rounded border p-3" data-testid="ai-setup-key">
        <h3 className="flex items-center gap-1 text-xs font-semibold">
          <KeyRound className="size-3.5" /> Paste an API key
        </h3>
        <p className="text-muted-foreground text-[11px]">
          The key is stored in your system keychain and never leaves this computer except to the
          provider you choose.
        </p>
        <input
          type="password"
          className={inputClass}
          placeholder="sk-… / AIza…"
          value={key}
          autoComplete="off"
          data-testid="ai-key-input"
          onChange={(event) => {
            setKey(event.target.value);
            setOverrideId(null);
          }}
        />
        {detected && !overrideId ? (
          <div className="flex items-center gap-2 text-[11px]" data-testid="ai-detected-chip">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span className="font-medium">{detected.preset.label} key</span>
            <select
              className="border-input bg-background ml-auto rounded border px-1 py-0.5 text-[11px]"
              value={detected.preset.id}
              data-testid="ai-detected-change"
              onChange={(event) => setOverrideId(event.target.value)}
            >
              {PASTE_PRESETS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {overrideId ? (
          <select
            className="border-input bg-background w-full rounded border px-1 py-1 text-xs"
            value={overrideId}
            data-testid="ai-manual-provider"
            onChange={(event) => setOverrideId(event.target.value)}
          >
            {PASTE_PRESETS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={busy || (!key.trim() && !overrideId)}
            onClick={savePastedKey}
            data-testid="ai-key-save"
          >
            {busy ? 'Connecting…' : 'Save and continue'}
          </button>
          {preset?.keyPageUrl ? (
            <button
              type="button"
              className="text-[11px] underline"
              onClick={() => void openExternalUrl(preset.keyPageUrl!)}
              data-testid="ai-get-key"
            >
              Get a key
            </button>
          ) : null}
        </div>
      </section>

      <section className="space-y-2 rounded border p-3" data-testid="ai-setup-local">
        <h3 className="flex items-center gap-1 text-xs font-semibold">
          <Laptop className="size-3.5" /> Use a local model
        </h3>
        {LOCAL_PRESETS.map((local) => {
          const probe = probes[local.id];
          return (
            <div key={local.id} className="flex items-center gap-2 text-[11px]">
              <span className="font-medium">{local.label.replace(' (local)', '')}</span>
              {probe === undefined ? (
                <span className="text-muted-foreground">Checking…</span>
              ) : probe?.running ? (
                <span className="text-emerald-700">
                  running · {probe.models.length} model{probe.models.length === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Not detected
                  {local.id === 'ollama' ? ' — install Ollama and run ollama serve' : ''}
                </span>
              )}
              <button
                type="button"
                className="ml-auto rounded border px-2 py-0.5 disabled:opacity-40"
                disabled={busy || !probe?.running}
                onClick={() => connectLocal(local)}
                data-testid={`ai-use-${local.id}`}
              >
                Use
              </button>
            </div>
          );
        })}
      </section>

      <section className="space-y-2 rounded border p-3" data-testid="ai-setup-custom">
        <button
          type="button"
          className="flex w-full items-center gap-1 text-xs font-semibold"
          onClick={() => setCustomOpen((open) => !open)}
        >
          <Settings2 className="size-3.5" /> Other / Custom
          <span className="text-muted-foreground ml-auto text-[11px]">
            {customOpen ? 'Hide' : 'OpenAI-compatible'}
          </span>
        </button>
        {customOpen ? (
          <div className="space-y-1.5">
            <label className="block text-[11px]">
              Base URL
              <input
                className={inputClass}
                value={customUrl}
                data-testid="ai-custom-url"
                onChange={(event) => setCustomUrl(event.target.value)}
              />
            </label>
            <label className="block text-[11px]">
              API key (optional)
              <input
                type="password"
                className={inputClass}
                value={customKey}
                autoComplete="off"
                data-testid="ai-custom-key"
                onChange={(event) => setCustomKey(event.target.value)}
              />
            </label>
            <label className="block text-[11px]">
              Model ID
              <input
                className={inputClass}
                value={customModel}
                placeholder="e.g. llama-3.3-70b"
                data-testid="ai-custom-model"
                onChange={(event) => setCustomModel(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={saveCustom}
              data-testid="ai-custom-save"
            >
              Save custom provider
            </button>
            <p className="text-muted-foreground flex items-start gap-1 text-[10px]">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              Azure OpenAI, Bedrock, and Vertex AI need different auth; reach them through
              OpenRouter or a LiteLLM gateway for v1.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
