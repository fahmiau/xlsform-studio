import { Fragment, useEffect, useState } from 'react';
import * as L from 'lucide-react';

const STEPS = [
  { id: 0, label: '1. Type ${variable}', expr: '${w', hint: 'Autocomplete matching questions' },
  { id: 1, label: '2. Match question', expr: "${water_source} = '", hint: 'Pick variable and operator' },
  { id: 2, label: '3. Pick choice value', expr: "${water_source} = '", hint: 'List choices from water_source' },
  { id: 3, label: '4. Instant lint check', expr: "${water_source} = 'other'", hint: 'Committed and verified in 4 ms' },
] as const;

const VARS = [
  ['water_source', 'select_one · Main source of drinking water', true],
  ['water_treated', 'select_one · Do you treat water before drinking?', false],
] as const;

const CHOICES = [
  ['Piped into dwelling', 'piped_dwelling', false],
  ['Tube well / borehole', 'borehole', false],
  ['Public tap / standpipe', 'public_tap', false],
  ['Other (specify)', 'other', true],
] as const;

const ROWS = [
  [1, 'begin_group', 'household', 'Household Water & Sanitation', '', 'top'],
  [2, 'select_one water_source', 'water_source', 'Main source of drinking water', '', 'mid'],
  [3, 'text', 'water_other', 'Please specify other water source', '', 'mid'],
  [4, 'select_one yes_no', 'water_treated', 'Do you treat water before drinking?', "${water_source} != 'piped_dwelling'", 'mid'],
  [5, 'integer', 'collect_mins', 'Minutes to fetch water (round trip)', "${water_source} = 'borehole' or ${water_source} = 'public_tap'", 'mid'],
  [6, 'end_group', 'household', '', '', 'bot'],
] as const;

const COLS = 'grid-cols-[2.2rem_minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,1.65fr)]';
const RAIL = { top: 'top-1 bottom-0 rounded-t', mid: 'inset-y-0', bot: 'top-0 bottom-1 rounded-b' } as const;

function XPath({ expr }: { expr: string }) {
  return (
    <>
      {expr.split(/(\$\{[^}]*\}|'[^']*')/g).map((part, i) => {
        if (part.startsWith('${')) return <span key={i} className="text-emerald-600 dark:text-emerald-400">{part}</span>;
        if (part.startsWith("'")) return <span key={i} className="text-amber-600 dark:text-amber-400">{part}</span>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function IdeShowcase() {
  const [step, setStep] = useState(0);
  const [choiceIdx, setChoiceIdx] = useState(3);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!playing || hovered) return;
    const id = window.setInterval(
      () =>
        setStep((s) => {
          const next = (s + 1) % STEPS.length;
          if (next === 2) setChoiceIdx(0);
          return next;
        }),
      2600,
    );
    return () => window.clearInterval(id);
  }, [playing, hovered]);

  useEffect(() => {
    if (step !== 2 || !playing || hovered) return;
    const id = window.setInterval(() => setChoiceIdx((c) => (c < 3 ? c + 1 : 3)), 450);
    return () => window.clearInterval(id);
  }, [step, playing, hovered]);

  const current = STEPS[step] ?? STEPS[0];
  const lintOk = step === 3;
  const activeChoiceName = CHOICES[choiceIdx]?.[1] ?? 'other';
  const popupItems =
    step === 0
      ? VARS.map(([k, m, hi]) => [k, m, hi, true] as const)
      : CHOICES.map(([l, k], idx) => [k, l, idx === choiceIdx, false] as const);

  return (
    <section aria-label="Interactive IDE showcase" className="space-y-3" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Authoring steps">
          {STEPS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={step === s.id} data-testid={`showcase-step-${s.id}`}
              onClick={() => { setStep(s.id); setChoiceIdx(3); setPlaying(false); }}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${step === s.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setPlaying((p) => !p)} data-testid="showcase-play-pause" aria-label={playing ? 'Pause animation' : 'Play animation'}
          className="border-border bg-card text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium">
          {playing ? <L.Pause className="size-3.5" aria-hidden /> : <L.Play className="size-3.5" aria-hidden />}
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <div className="border-border bg-card text-card-foreground overflow-hidden rounded-lg border shadow-sm">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <L.FilePlus2 className="size-3.5" aria-hidden /><L.FolderOpen className="size-3.5" aria-hidden /><L.Save className="size-3.5" aria-hidden />
            <span className="bg-border mx-0.5 h-3.5 w-px" />
            <L.Undo2 className="size-3.5" aria-hidden /><L.Redo2 className="size-3.5" aria-hidden />
            <span className="border-border bg-muted ml-1 hidden items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] sm:inline-flex"><L.Plus className="size-3" aria-hidden /> Column</span>
            <span className="bg-muted hidden items-center gap-1 rounded px-1.5 py-0.5 text-[11px] md:inline-flex"><L.Languages className="size-3" aria-hidden /> EN · English</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <L.FileSpreadsheet className="text-muted-foreground size-3.5" aria-hidden />
            <span className="font-medium">household_water_survey.xlsx</span>
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">Saved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span data-testid="showcase-lint-pill" className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-medium ${lintOk ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}`}>
              {lintOk ? <L.BadgeCheck className="size-3" aria-hidden /> : <L.AlertTriangle className="size-3" aria-hidden />}
              {lintOk ? '✓ XLS-001…011 · 0 Problems (4 ms)' : 'XLS-004 · 1 Error'}
            </span>
            <L.PanelLeft className="text-muted-foreground hidden size-3.5 sm:block" aria-hidden /><L.PanelRight className="text-muted-foreground hidden size-3.5 sm:block" aria-hidden />
          </div>
        </div>

        <div className="border-border flex items-center gap-2 border-b px-3 py-1 text-xs">
          <span className="text-muted-foreground font-mono italic">fx</span>
          <div className="border-input bg-background flex h-7 min-w-0 flex-1 items-center rounded border px-2 font-mono text-xs">
            <XPath expr={current.expr} />
            {!lintOk && <span className="bg-foreground ml-0.5 inline-block h-3.5 w-px animate-pulse" aria-hidden />}
          </div>
          <span className="text-muted-foreground shrink-0 text-[11px]">[Column: relevant]</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          <aside className="border-border hidden flex-col border-r lg:col-span-2 lg:flex">
            <div className="border-border flex gap-1 border-b px-2 py-1 text-[11px]">
              <span className="bg-accent rounded px-1.5 py-0.5 font-medium">outline</span><span className="text-muted-foreground px-1.5 py-0.5">lint</span>
            </div>
            <div className="space-y-0.5 p-1.5 text-[11px]">
              <div className="flex items-center gap-1 font-medium"><L.ChevronDown className="text-muted-foreground size-3" aria-hidden /><span className="truncate">household</span></div>
              {ROWS.slice(1, 5).map((r) => (
                <div key={r[0]} className={`truncate rounded py-0.5 pl-4 font-mono ${r[0] === 3 ? 'bg-accent font-medium' : 'text-muted-foreground'}`}>{r[2]}</div>
              ))}
            </div>
          </aside>

          <div className="border-border min-w-0 overflow-x-auto lg:col-span-7 lg:border-r">
            <div className="min-w-[540px] pb-32 font-mono text-[11px]">
              <div className={`bg-muted/60 text-muted-foreground border-border grid ${COLS} border-b font-medium`}>
                <span className="border-border border-r px-2 py-1 text-center">#</span>
                <span className="border-border border-r px-2 py-1">type</span><span className="border-border border-r px-2 py-1">name</span>
                <span className="border-border border-r px-2 py-1">label::English (en)</span><span className="px-2 py-1">relevant</span>
              </div>
              {ROWS.map(([n, type, name, label, rel, rail]) => {
                const active = n === 3;
                return (
                  <div key={n} className={`border-border relative grid ${COLS} border-b ${active ? 'bg-accent/40' : ''}`}>
                    <span className="border-border text-muted-foreground relative flex items-center justify-center border-r py-1.5">
                      <span aria-hidden className={`absolute left-0 w-1 bg-sky-500 ${RAIL[rail]}`} />{n}
                    </span>
                    <span className="border-border truncate border-r px-2 py-1.5">{type}</span>
                    <span className="border-border truncate border-r px-2 py-1.5 font-medium">{name}</span>
                    <span className="border-border text-muted-foreground truncate border-r px-2 py-1.5 font-sans">{label || '—'}</span>
                    <div className={`relative min-w-0 px-2 py-1.5 ${active ? 'bg-background ring-ring ring-2 ring-inset' : ''}`}>
                      {active ? (
                        <span data-testid="showcase-active-cell"><XPath expr={current.expr} />{!lintOk && <span className="bg-foreground ml-0.5 inline-block h-3 w-px align-middle" aria-hidden />}</span>
                      ) : rel ? <span className="block truncate"><XPath expr={rel} /></span> : <span className="text-muted-foreground/50">—</span>}
                      {active && (step === 0 || step === 2) && (
                        <div role="listbox" aria-label={step === 0 ? 'Variable completions' : 'Choice completions'} data-testid="showcase-autocomplete"
                          className="border-border bg-popover text-popover-foreground absolute top-full right-0 left-0 z-20 mt-0.5 rounded-md border p-1 shadow-md">
                          <div className="text-muted-foreground px-1.5 py-0.5 font-sans text-[10px] font-medium">
                            {step === 0 ? 'Survey variables' : 'Choices from water_source'}
                          </div>
                          {popupItems.map(([k, m, hi, isVar]) => (
                            <div key={k} className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 ${hi ? 'bg-accent text-accent-foreground' : ''}`}>
                              <span className={`font-medium ${isVar ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{k}</span>
                              <span className="text-muted-foreground truncate font-sans text-[10px]">{m}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="bg-muted/20 flex flex-col lg:col-span-3" aria-label="Choices drawer preview">
            <div className="border-border space-y-1 border-b px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-1 text-xs">
                <span className="flex items-center gap-1 font-medium"><L.ListTree className="text-muted-foreground size-3.5" aria-hidden />water_source</span>
                <span className="border-border bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]">snake_case</span>
              </div>
              <div className="text-muted-foreground flex items-center justify-between text-[11px]"><span>select_one water_source</span><span>+ Add choice · 4 choices</span></div>
            </div>
            <div className="grid grid-cols-2 font-mono text-[11px]">
              <span className="bg-muted/60 text-muted-foreground border-border border-r border-b px-2 py-1 font-sans font-medium">label::English (en)</span>
              <span className="bg-muted/60 text-muted-foreground border-border border-b px-2 py-1 font-medium">name</span>
              {CHOICES.map(([label, name]) => {
                const hi =
                  (step === 2 && name === activeChoiceName) || (step === 3 && name === 'other');
                return (
                  <Fragment key={name}>
                    <span className={`border-border border-r border-b px-2 py-1.5 font-sans transition-colors ${hi ? 'bg-amber-500/10 font-medium' : 'text-muted-foreground'}`}>{label}</span>
                    <span className={`border-border border-b px-2 py-1.5 transition-colors ${hi ? 'bg-amber-500/10 font-semibold text-amber-700 ring-1 ring-amber-500/40 ring-inset dark:text-amber-300' : ''}`}>{name}</span>
                  </Fragment>
                );
              })}
            </div>
          </aside>
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-2.5 py-1 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 font-medium">survey (6)</span>
            <span className="text-muted-foreground rounded px-2 py-0.5">choices (2 lists)</span>
            <span className="text-muted-foreground rounded px-2 py-0.5">settings</span>
          </div>
          <span className="text-muted-foreground font-mono" data-testid="showcase-status">Row 3 · Column: relevant (XPath) · {current.hint}</span>
        </div>
      </div>
    </section>
  );
}
