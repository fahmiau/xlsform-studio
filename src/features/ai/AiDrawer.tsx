/** AI Assistant drawer (Tasks 6.5/6.7): Chat | Build, provider quick-switch. */
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';

import { BuildView } from './BuildView';
import { ChatView } from './ChatView';
import { SetupCards } from './SetupCards';
import { useAiConfig } from './useAiConfig';

export function AiDrawer() {
  const config = useAiConfig();
  const aiMode = useUiStore((state) => state.aiMode);
  const setAiMode = useUiStore((state) => state.setAiMode);
  const setPreferencesOpen = useUiStore((state) => state.setPreferencesOpen);
  const providers = usePrefsStore((state) => state.ai.providers);
  const activeInstanceId = usePrefsStore((state) => state.ai.activeInstanceId);
  const setActiveAiProvider = usePrefsStore((state) => state.setActiveAiProvider);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="ai-drawer">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <div className="flex gap-0.5" role="tablist" aria-label="AI mode">
          {(['chat', 'build'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={aiMode === mode}
              className={`rounded px-2 py-0.5 text-[11px] capitalize ${
                aiMode === mode ? 'bg-accent font-medium' : 'text-muted-foreground'
              }`}
              onClick={() => setAiMode(mode)}
              data-testid={`ai-mode-${mode}`}
            >
              {mode}
            </button>
          ))}
        </div>

        {providers.length > 0 ? (
          <select
            className="border-input bg-background ml-auto max-w-[45%] rounded border px-1 py-0.5 text-[10px]"
            value={activeInstanceId ?? ''}
            aria-label="Active AI provider"
            data-testid="ai-provider-switch"
            onChange={(event) => setActiveAiProvider(event.target.value)}
          >
            {providers.map((provider) => (
              <option key={provider.instanceId} value={provider.instanceId}>
                {provider.label}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="text-muted-foreground ml-1 rounded px-1 text-[10px] hover:bg-accent"
          onClick={() => setPreferencesOpen(true)}
          data-testid="ai-manage"
        >
          Manage
        </button>
      </div>

      {config ? (
        <div className="min-h-0 flex-1">
          {aiMode === 'chat' ? <ChatView config={config} /> : <BuildView config={config} />}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <SetupCards />
        </div>
      )}
    </div>
  );
}
