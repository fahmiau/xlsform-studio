import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as L from 'lucide-react';

interface StepDef {
  id: number;
  label: string;
  shortLabel: string;
  durationMs: number;
  hint: string;
}

const STEPS: readonly StepDef[] = [
  {
    id: 0,
    label: '1. Type ${variable}',
    shortLabel: 'Variable',
    durationMs: 2400,
    hint: 'Autocomplete matching questions',
  },
  {
    id: 1,
    label: '2. Catch typo',
    shortLabel: 'Lint catch',
    durationMs: 3000,
    hint: 'XLS-004 caught locally in 4 ms',
  },
  {
    id: 2,
    label: '3. Pick choice',
    shortLabel: 'Choices sync',
    durationMs: 2800,
    hint: 'Choices synced from water_source',
  },
  {
    id: 3,
    label: '4. Verified clean',
    shortLabel: 'Verified',
    durationMs: 3200,
    hint: 'Committed and verified in 4 ms',
  },
] as const;

const VARS = [
  ['water_source', 'select_one water_source', 'Main source of drinking water', 'Row 2'],
  ['water_treated', 'select_one yes_no', 'Do you treat water before drinking?', 'Row 4'],
  ['collect_mins', 'integer', 'Minutes to fetch water (round trip)', 'Row 5'],
] as const;

const CHOICES = [
  ['Piped into dwelling', 'piped_dwelling'],
  ['Tube well / borehole', 'borehole'],
  ['Public tap / standpipe', 'public_tap'],
  ['Other (specify)', 'other'],
] as const;

const ROWS = [
  [1, 'begin_group', 'household', 'Household Water & Sanitation', '', 'top'],
  [2, 'select_one water_source', 'water_source', 'Main source of drinking water', '', 'mid'],
  [3, 'text', 'water_other', 'Please specify other water source', '', 'mid'],
  [
    4,
    'select_one yes_no',
    'water_treated',
    'Do you treat water before drinking?',
    "${water_source} != 'piped_dwelling'",
    'mid',
  ],
  [
    5,
    'integer',
    'collect_mins',
    'Minutes to fetch water (round trip)',
    "${water_source} = 'borehole' or ${water_source} = 'public_tap'",
    'mid',
  ],
  [6, 'calculate', 'round_trip_hrs', 'Collection time (hours)', '', 'mid'],
  [7, 'end_group', 'household', '', '', 'bot'],
] as const;

const COLS =
  'grid-cols-[2.2rem_minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,1.65fr)]';
const RAIL = {
  top: 'top-1.5 bottom-0 rounded-t',
  mid: 'inset-y-0',
  bot: 'top-0 bottom-1.5 rounded-b',
} as const;

const TYPED_PREFIX = '${w';
const TYPO_EXTENSION = "ater_source} = 'othr'";
const TICK_MS = 50;

function readPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function XPath({ expr, invalidToken }: { expr: string; invalidToken?: string }) {
  return (
    <>
      {expr.split(/(\$\{[^}]*\}|'[^']*'|\bor\b|\band\b|!=|=)/g).map((part, i) => {
        if (!part) return null;
        if (part.startsWith('${')) {
          return (
            <span key={i} className="text-[var(--syntax-var)]">
              {part}
            </span>
          );
        }
        if (part.startsWith("'")) {
          const isBad = invalidToken !== undefined && part === invalidToken;
          return (
            <span
              key={i}
              className={
                isBad
                  ? 'text-[var(--status-error)] underline decoration-[var(--status-error)] decoration-wavy underline-offset-2'
                  : 'text-[var(--syntax-string)]'
              }
            >
              {part}
            </span>
          );
        }
        if (part === 'or' || part === 'and') {
          return (
            <span key={i} className="font-semibold text-[var(--brand-text)]">
              {part}
            </span>
          );
        }
        if (part === '=' || part === '!=') {
          return (
            <span key={i} className="text-muted-foreground">
              {part}
            </span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

interface FrameState {
  expr: string;
  showPopup: 'var' | 'choice' | null;
  varIdx: number;
  choiceIdx: number;
  showTypoDiagnostic: boolean;
  invalidToken?: string;
  activeKeyHint: string | null;
  lintOk: boolean;
  lintLabel: string;
  hintText: string;
}

function deriveFrameState(
  step: number,
  elapsedMs: number,
  settled: boolean,
  selectedChoice: string,
): FrameState {
  const duration = STEPS[step]?.durationMs ?? 2400;
  const p = settled ? 1 : Math.min(1, elapsedMs / duration);

  if (step === 0) {
    const varIdx = !settled && p < 0.35 ? 1 : 0;
    const accepting = !settled && p >= 0.82;
    return {
      expr: TYPED_PREFIX,
      showPopup: 'var',
      varIdx,
      choiceIdx: 3,
      showTypoDiagnostic: false,
      activeKeyHint: accepting ? '↵ Enter' : 'Ctrl+Space',
      lintOk: false,
      lintLabel: 'XLS-004 · 1 Error',
      hintText: STEPS[0]?.hint ?? '',
    };
  }

  if (step === 1) {
    if (settled) {
      return {
        expr: "${water_source} = 'othr'",
        showPopup: null,
        varIdx: 0,
        choiceIdx: 3,
        showTypoDiagnostic: true,
        invalidToken: "'othr'",
        activeKeyHint: 'F8 Diagnostic',
        lintOk: false,
        lintLabel: 'XLS-004 · 1 Error',
        hintText: "XLS-004: Unknown choice 'othr' in list water_source",
      };
    }

    if (p < 0.42) {
      const charCount = Math.max(1, Math.floor((p / 0.42) * TYPO_EXTENSION.length));
      const expr = TYPED_PREFIX + TYPO_EXTENSION.slice(0, charCount);
      return {
        expr,
        showPopup: null,
        varIdx: 0,
        choiceIdx: 3,
        showTypoDiagnostic: false,
        activeKeyHint: 'Typing XPath',
        lintOk: false,
        lintLabel: 'XLS-004 · 1 Error',
        hintText: 'Checking references as you type…',
      };
    }

    if (p < 0.84) {
      return {
        expr: "${water_source} = 'othr'",
        showPopup: null,
        varIdx: 0,
        choiceIdx: 3,
        showTypoDiagnostic: true,
        invalidToken: "'othr'",
        activeKeyHint: '4 ms check',
        lintOk: false,
        lintLabel: 'XLS-004 · 1 Error',
        hintText: "XLS-004: Unknown choice 'othr' in list water_source",
      };
    }

    const trimFrac = (p - 0.84) / 0.16;
    const remaining = Math.max(0, Math.round((1 - trimFrac) * 5));
    const suffix = "othr'".slice(0, remaining);
    return {
      expr: `\${water_source} = '${suffix}`,
      showPopup: null,
      varIdx: 0,
      choiceIdx: 3,
      showTypoDiagnostic: false,
      activeKeyHint: 'Ctrl+Space',
      lintOk: false,
      lintLabel: 'XLS-004 · 1 Error',
      hintText: 'Open choice completions for water_source',
    };
  }

  if (step === 2) {
    const choiceIdx = settled ? 3 : Math.min(3, Math.floor(p * 4.2));
    const accepting = !settled && p >= 0.85;
    return {
      expr: "${water_source} = '",
      showPopup: 'choice',
      varIdx: 0,
      choiceIdx,
      showTypoDiagnostic: false,
      activeKeyHint: accepting ? '↵ Enter' : '↑↓ Select choice',
      lintOk: false,
      lintLabel: 'XLS-004 · 1 Error',
      hintText: STEPS[2]?.hint ?? '',
    };
  }

  return {
    expr: `\${water_source} = '${selectedChoice}'`,
    showPopup: null,
    varIdx: 0,
    choiceIdx: Math.max(
      0,
      CHOICES.findIndex(([, name]) => name === selectedChoice),
    ),
    showTypoDiagnostic: false,
    activeKeyHint: null,
    lintOk: true,
    lintLabel: '✓ XLS-001…011 · 0 Problems (4 ms)',
    hintText: STEPS[3]?.hint ?? '',
  };
}

export function IdeShowcase() {
  const [reducedMotion, setReducedMotion] = useState(readPrefersReducedMotion);
  const [timeline, setTimeline] = useState({ step: 0, elapsedMs: 0, settled: false });
  const [playing, setPlaying] = useState(() => !readPrefersReducedMotion());
  const [hovered, setHovered] = useState(false);
  const [leftTab, setLeftTab] = useState<'outline' | 'lint'>('outline');
  const [selectedChoice, setSelectedChoice] = useState<string>('other');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      setReducedMotion(mql.matches);
      if (mql.matches) setPlaying(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!playing || hovered || reducedMotion) return;
    const id = window.setInterval(() => {
      setTimeline((prev) => {
        const duration = STEPS[prev.step]?.durationMs ?? 2400;
        const nextElapsed = prev.elapsedMs + TICK_MS;
        if (nextElapsed >= duration) {
          return {
            step: (prev.step + 1) % STEPS.length,
            elapsedMs: 0,
            settled: false,
          };
        }
        return { ...prev, elapsedMs: nextElapsed };
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, hovered, reducedMotion]);

  const { step, elapsedMs, settled } = timeline;

  const selectStep = (nextStep: number) => {
    setTimeline({ step: nextStep, elapsedMs: 0, settled: true });
    setPlaying(false);
    if (nextStep === 3) setSelectedChoice('other');
  };

  const handleTabKeyDown = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    let target: number | null = null;
    if (e.key === 'ArrowRight') target = (index + 1) % STEPS.length;
    else if (e.key === 'ArrowLeft') target = (index - 1 + STEPS.length) % STEPS.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = STEPS.length - 1;
    if (target === null) return;
    e.preventDefault();
    selectStep(target);
    tabRefs.current[target]?.focus();
  };

  const handleChoicePick = (choiceName: string) => {
    setSelectedChoice(choiceName);
    setTimeline({ step: 3, elapsedMs: 0, settled: true });
    setPlaying(false);
  };

  const handlePlayPause = () => {
    if (!playing) {
      setTimeline((prev) => ({ ...prev, elapsedMs: 0, settled: false }));
    }
    setPlaying((wasPlaying) => !wasPlaying);
  };

  const frame = deriveFrameState(step, elapsedMs, settled || reducedMotion, selectedChoice);
  const stepDuration = STEPS[step]?.durationMs ?? 2400;
  const progressPct =
    settled || reducedMotion ? 100 : Math.min(100, Math.round((elapsedMs / stepDuration) * 100));

  const iconLayer =
    '[grid-area:1/1] flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:scale-100 motion-reduce:blur-[0px]';
  const iconShown = 'scale-100 opacity-100 blur-[0px]';
  const iconHidden = 'scale-[0.25] opacity-0 blur-[4px]';

  return (
    <section
      aria-label="Interactive IDE showcase"
      className="space-y-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Authoring steps"
        >
          {STEPS.map((s, idx) => {
            const active = step === s.id;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                id={`showcase-tab-${s.id}`}
                aria-selected={active}
                aria-controls="showcase-workbench"
                tabIndex={active ? 0 : -1}
                data-testid={`showcase-step-${s.id}`}
                onClick={() => selectStep(s.id)}
                onKeyDown={(e) => handleTabKeyDown(idx, e)}
                className={`relative overflow-hidden rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums transition-[color,background-color,box-shadow,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-solid)] [&:not(:disabled):active]:scale-[0.96] ${
                  active
                    ? 'bg-card text-foreground landing-surface'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent'
                }`}
              >
                <span>{s.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="bg-[var(--brand-solid)] absolute inset-x-0 bottom-0 h-0.5 origin-left transition-[transform] duration-100 ease-linear"
                    style={{ transform: `scaleX(${progressPct / 100})` }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handlePlayPause}
          data-testid="showcase-play-pause"
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          className="landing-surface-interactive bg-card text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg ps-2.5 pe-3 py-1.5 text-xs font-medium transition-[color,box-shadow,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-solid)] [&:not(:disabled):active]:scale-[0.96]"
        >
          <span className="grid size-3.5 place-items-center" aria-hidden>
            <span className={`${iconLayer} ${playing ? iconShown : iconHidden}`}>
              <L.Pause className="size-3.5" strokeWidth={2} />
            </span>
            <span className={`${iconLayer} translate-x-px ${playing ? iconHidden : iconShown}`}>
              <L.Play className="size-3.5" strokeWidth={2} />
            </span>
          </span>
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>
      </div>

      {/* Concentric outer bezel (rounded-2xl + p-1.5 -> inner rounded-[10px]) */}
      <div
        id="showcase-workbench"
        role="tabpanel"
        aria-labelledby={`showcase-tab-${step}`}
        className="landing-elevated bg-muted/45 rounded-2xl p-1.5 text-start"
      >
        <div className="border-border bg-card text-card-foreground overflow-hidden rounded-[10px] border">
          {/* Mock IDE Top Toolbar */}
          <div className="border-border bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs">
            <div className="text-[var(--muted-foreground-strong)] flex items-center gap-1.5">
              <L.FilePlus2 className="size-3.5" aria-hidden />
              <L.FolderOpen className="size-3.5" aria-hidden />
              <L.Save className="size-3.5" aria-hidden />
              <span className="bg-border mx-0.5 h-3.5 w-px" />
              <L.Undo2 className="size-3.5" aria-hidden />
              <L.Redo2 className="size-3.5" aria-hidden />
              <span className="bg-muted/80 text-[var(--muted-foreground-strong)] ms-1 hidden items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex">
                <L.Plus className="size-3" aria-hidden /> Column
              </span>
              <span className="bg-muted/80 text-[var(--muted-foreground-strong)] hidden items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium md:inline-flex">
                <L.Languages className="size-3" aria-hidden /> EN · English
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <L.FileSpreadsheet className="text-[var(--brand-text)] size-3.5" aria-hidden />
              <span className="font-medium">household_water_survey.xlsx</span>
              <span className="bg-muted text-[var(--muted-foreground-strong)] rounded px-1.5 py-0.5 text-[10px]">
                Saved
              </span>
            </div>

            <div className="flex items-center gap-2">
              {frame.activeKeyHint && (
                <kbd className="border-border bg-card text-[var(--muted-foreground-strong)] hidden rounded border border-b-2 px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-block">
                  {frame.activeKeyHint}
                </kbd>
              )}
              <span
                data-testid="showcase-lint-pill"
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums transition-[background-color,color,border-color] duration-150 ease-out ${
                  frame.lintOk
                    ? 'border-[var(--status-valid-border)] bg-[var(--status-valid-soft)] text-[var(--status-valid)]'
                    : 'border-[var(--status-error-border)] bg-[var(--status-error-soft)] text-[var(--status-error)]'
                }`}
              >
                {frame.lintOk ? (
                  <L.BadgeCheck className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <L.AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                )}
                <span>{frame.lintLabel}</span>
              </span>
              <L.PanelLeft className="text-muted-foreground hidden size-3.5 sm:block" aria-hidden />
              <L.PanelRight
                className="text-muted-foreground hidden size-3.5 sm:block"
                aria-hidden
              />
            </div>
          </div>

          {/* CodeMirror-style Formula Bar */}
          <div className="border-border bg-card flex items-center gap-2 border-b px-3 py-1.5 text-xs">
            <span className="text-[var(--brand-text)] font-mono text-[11px] font-semibold italic">
              fx
            </span>
            <div className="border-input bg-background flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-md border px-2.5 font-mono text-xs">
              <span className="truncate">
                <XPath expr={frame.expr} invalidToken={frame.invalidToken} />
              </span>
              {!frame.lintOk && (
                <span
                  className="bg-[var(--brand-solid)] ms-0.5 inline-block h-3.5 w-[1.5px] shrink-0 motion-safe:animate-pulse"
                  aria-hidden
                />
              )}
            </div>
            <span className="text-muted-foreground hidden shrink-0 font-mono text-[11px] sm:inline">
              [Column: relevant]
            </span>
          </div>

          {/* 3-Pane IDE Workbench */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left Pane: Interactive Outline / Lint */}
            <aside className="border-border bg-[var(--surface-subtle)]/50 hidden flex-col border-e lg:col-span-2 lg:flex">
              <div className="border-border flex items-center gap-1 border-b px-2 py-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setLeftTab('outline')}
                  className={`rounded px-1.5 py-0.5 capitalize transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-solid)] ${
                    leftTab === 'outline'
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  outline
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('lint')}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 capitalize tabular-nums transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-solid)] ${
                    leftTab === 'lint'
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>lint</span>
                  <span
                    className={`rounded px-1 text-[10px] font-semibold ${
                      frame.lintOk
                        ? 'bg-[var(--status-valid-soft)] text-[var(--status-valid)]'
                        : 'bg-[var(--status-error-soft)] text-[var(--status-error)]'
                    }`}
                  >
                    {frame.lintOk ? '0' : '1'}
                  </span>
                </button>
              </div>

              {leftTab === 'outline' ? (
                <div className="space-y-0.5 p-2 text-[11px]">
                  <div className="flex items-center gap-1 font-medium">
                    <L.ChevronDown className="text-muted-foreground size-3" aria-hidden />
                    <span className="truncate">household</span>
                  </div>
                  {ROWS.slice(1, 6).map((r) => {
                    const active = r[0] === 3;
                    return (
                      <div
                        key={r[0]}
                        className={`flex items-center justify-between gap-1 rounded py-0.5 ps-4 pe-1.5 font-mono ${
                          active
                            ? 'bg-[var(--brand-soft)] text-[var(--brand-text)] font-medium'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span className="truncate">{r[2]}</span>
                        {active && (
                          <span
                            className={`shrink-0 rounded px-1 font-sans text-[9px] font-semibold ${
                              frame.lintOk
                                ? 'bg-[var(--status-valid-soft)] text-[var(--status-valid)]'
                                : 'bg-[var(--status-error-soft)] text-[var(--status-error)]'
                            }`}
                          >
                            {frame.lintOk ? 'if' : '!'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1.5 p-2 text-[11px]">
                  {frame.lintOk ? (
                    <div className="border-[var(--status-valid-border)] bg-[var(--status-valid-soft)] text-[var(--status-valid)] rounded-md border p-2">
                      <p className="font-medium">All checks passed</p>
                      <p className="mt-0.5 text-[10px] opacity-90">XLS-001…011 · 4 ms</p>
                    </div>
                  ) : (
                    <div className="border-[var(--status-error-border)] bg-[var(--status-error-soft)] text-[var(--status-error)] rounded-md border p-2">
                      <p className="font-mono text-[10px] font-semibold">XLS-004 · Row 3</p>
                      <p className="mt-0.5 leading-snug">
                        {frame.showTypoDiagnostic
                          ? "Unknown choice 'othr' in water_source"
                          : 'Incomplete relevant expression'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </aside>

            {/* Center Pane: Survey Grid + Popovers */}
            <div className="border-border min-w-0 overflow-x-auto lg:col-span-7 lg:border-e">
              <div className="min-w-[540px] pb-6 font-mono text-[11px]">
                <div
                  className={`bg-muted/50 text-muted-foreground border-border grid ${COLS} border-b font-medium`}
                >
                  <span className="border-border border-e px-2 py-1.5 text-center tabular-nums">
                    #
                  </span>
                  <span className="border-border border-e px-2 py-1.5">type</span>
                  <span className="border-border border-e px-2 py-1.5">name</span>
                  <span className="border-border border-e px-2 py-1.5 font-sans">
                    label::English (en)
                  </span>
                  <span className="px-2 py-1.5">relevant</span>
                </div>

                {ROWS.map(([n, type, name, label, rel, rail]) => {
                  const active = n === 3;
                  const isGroupRow = type === 'begin_group' || type === 'end_group';
                  return (
                    <div
                      key={n}
                      className={`border-border relative grid ${COLS} border-b ${
                        active
                          ? 'bg-[var(--brand-soft)]/50'
                          : isGroupRow
                            ? 'bg-muted/35'
                            : 'bg-card'
                      }`}
                    >
                      <span className="border-border text-muted-foreground relative flex items-center justify-center border-e py-1.5 tabular-nums">
                        <span
                          aria-hidden
                          className={`bg-[var(--rail-group)] absolute start-0 w-1 ${RAIL[rail]}`}
                        />
                        {n}
                      </span>
                      <span className="border-border truncate border-e px-2 py-1.5">{type}</span>
                      <span className="border-border truncate border-e px-2 py-1.5 font-medium">
                        {name}
                      </span>
                      <span className="border-border text-muted-foreground truncate border-e px-2 py-1.5 font-sans">
                        {label || '—'}
                      </span>
                      <div
                        className={`relative min-w-0 px-2 py-1.5 ${
                          active ? 'bg-background ring-2 ring-[var(--brand-solid)] ring-inset' : ''
                        }`}
                      >
                        {active ? (
                          <span data-testid="showcase-active-cell" className="block truncate">
                            <XPath expr={frame.expr} invalidToken={frame.invalidToken} />
                            {!frame.lintOk && (
                              <span
                                className="bg-[var(--brand-solid)] ms-0.5 inline-block h-3 w-[1.5px] align-middle motion-safe:animate-pulse"
                                aria-hidden
                              />
                            )}
                          </span>
                        ) : rel ? (
                          <span className="block truncate">
                            <XPath expr={rel} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}

                        {/* Autocomplete Popover */}
                        {active && frame.showPopup && (
                          <div
                            role="listbox"
                            aria-label={
                              frame.showPopup === 'var'
                                ? 'Variable completions'
                                : 'Choice completions'
                            }
                            data-testid="showcase-autocomplete"
                            className="showcase-popover landing-elevated bg-popover text-popover-foreground absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg"
                          >
                            <div className="border-border bg-[var(--surface-subtle)] text-[var(--muted-foreground-strong)] flex items-center justify-between border-b px-2 py-1 font-sans text-[10px] font-medium">
                              <span>
                                {frame.showPopup === 'var'
                                  ? 'Survey variables'
                                  : 'Choices from water_source'}
                              </span>
                              <span className="font-mono text-[9px] opacity-80">↑↓ · ↵</span>
                            </div>
                            <div className="p-1">
                              {frame.showPopup === 'var'
                                ? VARS.map(([k, qType, desc, rowLoc], idx) => {
                                    const hi = idx === frame.varIdx;
                                    return (
                                      <div
                                        key={k}
                                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors duration-100 ${
                                          hi
                                            ? 'bg-[var(--brand-soft)] text-foreground'
                                            : 'text-muted-foreground'
                                        }`}
                                      >
                                        <span className="flex min-w-0 items-center gap-1.5">
                                          <span className="text-[var(--syntax-var)] truncate font-medium">
                                            {k}
                                          </span>
                                          <span className="truncate font-sans text-[10px] opacity-80">
                                            {desc}
                                          </span>
                                        </span>
                                        <span className="shrink-0 font-mono text-[10px] opacity-75">
                                          {hi ? qType : rowLoc}
                                        </span>
                                      </div>
                                    );
                                  })
                                : CHOICES.map(([labelText, k], idx) => {
                                    const hi = idx === frame.choiceIdx;
                                    return (
                                      <div
                                        key={k}
                                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors duration-100 ${
                                          hi
                                            ? 'bg-[var(--amber-soft)] text-foreground'
                                            : 'text-muted-foreground'
                                        }`}
                                      >
                                        <span className="text-[var(--syntax-amber)] font-medium">
                                          {k}
                                        </span>
                                        <span className="truncate font-sans text-[10px]">
                                          {labelText}
                                        </span>
                                      </div>
                                    );
                                  })}
                            </div>
                          </div>
                        )}

                        {/* Live Inline Diagnostic Tooltip during Typo Catch */}
                        {active && frame.showTypoDiagnostic && (
                          <div
                            role="status"
                            data-testid="showcase-diagnostic"
                            className="showcase-popover landing-elevated border-[var(--status-error-border)] bg-[var(--status-error-soft)] text-[var(--status-error)] absolute top-full right-0 left-0 z-20 mt-1 rounded-lg border px-2.5 py-2 font-sans text-[11px]"
                          >
                            <div className="flex items-center gap-1.5 font-semibold">
                              <L.AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                              <span>XLS-004 · Unknown choice &apos;othr&apos;</span>
                            </div>
                            <p className="text-foreground/85 mt-0.5 text-[10px] leading-snug">
                              Not defined in list <code className="font-mono">water_source</code>.
                              Press <kbd className="font-mono font-semibold">Ctrl+Space</kbd> to
                              pick a valid option.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Pane: Interactive Smart Choices Drawer */}
            <aside
              className="bg-[var(--surface-subtle)]/40 flex flex-col justify-between lg:col-span-3"
              aria-label="Choices drawer preview"
            >
              <div>
                <div className="border-border space-y-1 border-b px-3 py-2">
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span className="flex items-center gap-1.5 font-medium">
                      <L.ListTree className="text-[var(--brand-text)] size-3.5" aria-hidden />
                      <span>water_source</span>
                    </span>
                    <span className="border-border bg-card text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]">
                      snake_case
                    </span>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-[11px] tabular-nums">
                    <span>select_one water_source</span>
                    <span>4 choices</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 font-mono text-[11px]">
                  <span className="bg-muted/50 text-muted-foreground border-border border-e border-b px-2.5 py-1 font-sans font-medium">
                    label::English (en)
                  </span>
                  <span className="bg-muted/50 text-muted-foreground border-border border-b px-2.5 py-1 font-medium">
                    name
                  </span>

                  {CHOICES.map(([labelText, name], idx) => {
                    const isSyncedChoice = frame.showPopup === 'choice' && idx === frame.choiceIdx;
                    const isCommittedChoice = frame.lintOk && name === selectedChoice;
                    const highlighted = isSyncedChoice || isCommittedChoice;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleChoicePick(name)}
                        data-testid={`showcase-choice-${name}`}
                        className={`col-span-2 grid grid-cols-2 text-start transition-colors duration-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand-solid)] ${
                          isCommittedChoice
                            ? 'bg-[var(--status-valid-soft)]/70'
                            : isSyncedChoice
                              ? 'bg-[var(--amber-soft)]'
                              : 'hover:bg-muted/40'
                        }`}
                      >
                        <span
                          className={`border-border truncate border-e border-b px-2.5 py-1.5 font-sans ${
                            highlighted ? 'text-foreground font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          {labelText}
                        </span>
                        <span
                          className={`border-border flex items-center justify-between gap-1 border-b px-2.5 py-1.5 ${
                            isCommittedChoice
                              ? 'text-[var(--status-valid)] font-semibold'
                              : isSyncedChoice
                                ? 'text-[var(--syntax-amber)] font-semibold ring-1 ring-[var(--amber-border)] ring-inset'
                                : 'text-foreground/90'
                          }`}
                        >
                          <span className="truncate">{name}</span>
                          {isCommittedChoice && (
                            <span className="bg-[var(--status-valid-soft)] text-[var(--status-valid)] shrink-0 rounded px-1 font-sans text-[9px] font-semibold tabular-nums">
                              1 ref
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-border bg-card/60 border-t px-3 py-2 text-[11px]">
                <p className="text-[var(--muted-foreground-strong)] leading-snug">
                  {frame.lintOk ? (
                    <>
                      Synced with <code className="text-foreground font-mono">water_other</code>.
                      Click any choice above to test live binding.
                    </>
                  ) : frame.showTypoDiagnostic ? (
                    <span className="text-[var(--status-error)] font-medium">
                      &apos;othr&apos; is missing from the 4 choices above.
                    </span>
                  ) : (
                    <>Click any choice row to bind it into the active formula.</>
                  )}
                </p>
              </div>
            </aside>
          </div>

          {/* IDE Bottom Status Bar */}
          <div className="border-border bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px] tabular-nums">
            <div className="flex items-center gap-1">
              <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 font-medium">
                survey (7)
              </span>
              <span className="text-[var(--muted-foreground-strong)] rounded px-2 py-0.5">
                choices (2 lists)
              </span>
              <span className="text-[var(--muted-foreground-strong)] rounded px-2 py-0.5">
                settings
              </span>
            </div>
            <span
              className="text-[var(--muted-foreground-strong)] font-mono"
              data-testid="showcase-status"
            >
              Row 3 · Column: relevant (XPath) · {frame.hintText}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
