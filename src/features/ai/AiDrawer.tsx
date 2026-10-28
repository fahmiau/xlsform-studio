/** AI Assistant drawer (Tasks 6.5/6.7): Chat | Build, provider quick-switch. */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
          <Select
            value={activeInstanceId ?? ''}
            onValueChange={(instanceId) => setActiveAiProvider(instanceId)}
          >
            <SelectTrigger
              size="sm"
              className="ml-auto h-6 max-w-[45%] px-1.5 text-[10px]"
              aria-label="Active AI provider"
              data-testid="ai-provider-switch"
            >
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem
                  key={provider.instanceId}
                  value={provider.instanceId}
                  className="text-xs"
                >
                  {provider.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
