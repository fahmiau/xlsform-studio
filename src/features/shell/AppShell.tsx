/** Full IDE layout shell (Task 2.1, PRD §6.1). */
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { applyTheme } from '@/lib/theme';
import { usePrefsStore } from '@/state/prefsStore';
import { useWorkbookStore } from '@/state/workbookStore';
import { useUiStore, type SheetTab } from '@/state/uiStore';
import { RecoveryDialog } from '@/features/file/RecoveryDialog';
import { useAutosave } from '@/features/file/useAutosave';
import { ChoicesDrawer } from '@/features/choices-drawer/ChoicesDrawer';
import { AiDrawer } from '@/features/ai/AiDrawer';
import { StagingBar } from '@/features/ai/StagingBar';
import { useStagingAutoReveal } from '@/features/ai/useStagingAutoReveal';
import { useLanguageViewBootstrap } from '@/features/languages/useLanguageView';
import { LintPanel } from '@/features/lint-panel/LintPanel';
import { SheetGrid } from '@/features/grid/SheetGrid';
import { CHOICES_GRID_CONFIG, SURVEY_GRID_CONFIG } from '@/features/grid/columns';
import { OutlinePanel } from '@/features/outline/OutlinePanel';
import { SettingsForm } from '@/features/settings-sheet/SettingsForm';

import { FormulaBarSlot } from './FormulaBarSlot';
import { SheetTabs } from './SheetTabs';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';

function LeftPanel() {
  const tab = useUiStore((state) => state.leftTab);
  const setLeftTab = useUiStore((state) => state.setLeftTab);

  return (
    <section className="flex h-full flex-col" data-testid="left-panel">
      <div className="flex gap-1 border-b px-2 py-1" role="tablist">
        {(['outline', 'lint'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={`rounded px-2 py-0.5 text-xs capitalize ${
              tab === name ? 'bg-accent font-medium' : 'text-muted-foreground'
            }`}
            onClick={() => setLeftTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'outline' ? <OutlinePanel /> : <LintPanel />}
      </div>
    </section>
  );
}

function RightPanel() {
  const tab = useUiStore((state) => state.rightTab);
  const setRightTab = useUiStore((state) => state.setRightTab);

  return (
    <section className="flex h-full flex-col" data-testid="right-panel">
      <div className="flex gap-1 border-b px-2 py-1" role="tablist">
        {(['choices', 'ai'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={`rounded px-2 py-0.5 text-xs capitalize ${
              tab === name ? 'bg-accent font-medium' : 'text-muted-foreground'
            }`}
            onClick={() => setRightTab(name)}
          >
            {name === 'ai' ? 'AI Assistant' : 'Choices'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'choices' ? <ChoicesDrawer /> : <AiDrawer />}
      </div>
    </section>
  );
}

function CenterPane({ sheet }: { sheet: SheetTab }) {
  const warnings = useWorkbookStore((state) => state.warnings);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {warnings.length > 0 ? (
        <div
          className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-900"
          data-testid="reader-warnings"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{warnings[0]}</span>
          {warnings.length > 1 ? <span>+{warnings.length - 1} more</span> : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {sheet === 'survey' ? (
          <SheetGrid key="survey" sheetName="survey" config={SURVEY_GRID_CONFIG} />
        ) : sheet === 'choices' ? (
          <SheetGrid key="choices" sheetName="choices" config={CHOICES_GRID_CONFIG} />
        ) : (
          <SettingsForm />
        )}
      </div>
      <StagingBar />
    </div>
  );
}

export function AppShell() {
  const theme = usePrefsStore((state) => state.theme);
  const leftPanel = usePrefsStore((state) => state.leftPanel);
  const rightPanel = usePrefsStore((state) => state.rightPanel);
  const layout = usePrefsStore((state) => state.layout);
  const setLayout = usePrefsStore((state) => state.setLayout);
  const hydrated = usePrefsStore((state) => state.hydrated);
  const activeSheet = useUiStore((state) => state.activeSheet);

  useAutosave();
  useLanguageViewBootstrap();
  useStagingAutoReveal();

  useEffect(() => {
    void usePrefsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const leftSize = layout.left ?? 18;
  const rightSize = layout.right ?? 18;
  const defaultLayout: Record<string, number> =
    leftPanel && rightPanel
      ? { left: leftSize, center: 100 - leftSize - rightSize, right: rightSize }
      : leftPanel
        ? { left: leftSize, center: 100 - leftSize }
        : rightPanel
          ? { center: 100 - rightSize, right: rightSize }
          : { center: 100 };

  return (
    <main className="flex h-full flex-col" data-testid="app-shell">
      <TopBar />
      <FormulaBarSlot />
      <div className="min-h-0 flex-1">
        {hydrated ? (
          <Group
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={(next) => setLayout({ ...layout, ...next })}
          >
            {leftPanel ? (
              <>
                <Panel id="left" defaultSize={`${leftSize}%`} minSize="10%">
                  <LeftPanel />
                </Panel>
                <Separator className="bg-border data-[separator]:hover:bg-accent w-1" />
              </>
            ) : null}
            <Panel id="center" defaultSize={`${defaultLayout.center}%`} minSize="30%">
              <CenterPane sheet={activeSheet} />
            </Panel>
            {rightPanel ? (
              <>
                <Separator className="bg-border data-[separator]:hover:bg-accent w-1" />
                <Panel id="right" defaultSize={`${rightSize}%`} minSize="10%">
                  <RightPanel />
                </Panel>
              </>
            ) : null}
          </Group>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            Loading preferences…
          </div>
        )}
      </div>
      <SheetTabs />
      <StatusBar />
      <RecoveryDialog />
    </main>
  );
}
