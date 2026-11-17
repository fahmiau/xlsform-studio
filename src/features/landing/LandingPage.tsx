import * as L from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { nextTheme } from '@/lib/theme';
import { usePrefsStore } from '@/state/prefsStore';

import { IdeShowcase } from './IdeShowcase';

const REPO = 'https://github.com/fahmiau/xlsform-studio';
const DL = `${REPO}/releases/latest`;
const M = 'text-muted-foreground';
const CARD = 'bg-card text-card-foreground border-border rounded-lg border';
const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6';
const KBD = 'border-border bg-muted text-foreground rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium';
const GRID_BG =
  'bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem]';

const KEYS = [
  ['Ctrl+Space', 'Autocomplete'],
  ['Ctrl+Enter', 'Choices drawer'],
  ['F8', 'Next lint error'],
  ['Ctrl+Z', 'Atomic undo'],
  ['Ctrl+K', 'Commands'],
] as const;

const COMPARE = [
  ['Raw Excel', 'Silent typos in ${variable} or choice values break ODK Central uploads.', 'xlsform-studio', 'Checks XLS-001…011 in <15ms as you type.'],
  ['Raw Excel', 'Switching tabs to copy choice names slows down skip-logic authoring.', 'xlsform-studio', 'Context-aware autocomplete & side-by-side Choices drawer.'],
  ['Raw Excel', 'Find-and-replace corrupts partial question names inside formulas.', 'xlsform-studio', 'Token-aware rename across every formula in one Ctrl+Z step.'],
] as const;

const FEATURES = [
  [L.Braces, 'Formula Autocomplete', 'Ctrl+Space', 'Completes ${variables}, choice names & ODK functions in relevant, constraint, and calculation.'],
  [L.ShieldCheck, 'Real-time Linter', 'F8', 'Checks XLS-001…011 in <15ms locally; F8 jumps straight to the offending cell.'],
  [L.ListChecks, 'Side-by-Side Choices Drawer', 'Ctrl+Enter', 'Edits lists inline beside the survey row with auto-slugify and name locks.'],
  [L.Replace, 'Safe Rename Refactoring', 'Ctrl+Z', 'Token-aware renames across all XPath formulas in one atomic undo entry.'],
  [L.Languages, 'Multilingual Views', null, 'All, Single, or Side-by-side translation split views with untranslated counts.'],
  [L.FileSpreadsheet, 'Lossless .xlsx Round-Trip', null, 'Preserves custom columns, passthrough sheets, header text & styling.'],
] as const;

const PLANS = [
  {
    name: 'Web App (Browser)',
    sub: 'Instant access · Windows, macOS, Linux',
    badge: 'Browser',
    items: [
      [L.Check, 'Zero install; launch immediately in any modern browser.'],
      [L.Check, 'Full XLSForm grid, XLS-001…011 linter, ${variable} & choice autocomplete, Choices drawer, and multilingual views.'],
      [L.Check, '100% client-side execution — .xlsx files are parsed locally in memory and never uploaded to any server.'],
      [L.Shield, 'AI Assistant is omitted on the web so API keys are never stored in browser storage.'],
    ],
  },
  {
    name: 'Desktop App (Windows)',
    sub: 'Native Tauri v2 installer · Offline workstation',
    badge: 'Windows',
    items: [
      [L.Check, 'Works completely offline with direct OS file associations and atomic disk saves.'],
      [L.Check, 'Crash recovery snapshots on disk and native Excel file-lock detection.'],
      [L.Shield, 'Optional AI Assistant (BYOK or local Ollama / LM Studio) with API keys stored in Windows Credential Manager and proxied through Rust.'],
    ],
  },
] as const;

const Ext = ({ href, cls, id, t }: { href: string; cls: string; id?: string; t: string }) => (
  <a href={href} target="_blank" rel="noreferrer" className={cls} data-testid={id}>{t}</a>
);

export function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  const theme = usePrefsStore((s) => s.theme);
  const ThemeIcon = theme === 'dark' ? L.Moon : theme === 'light' ? L.Sun : L.Monitor;
  const flip = () => usePrefsStore.getState().setTheme(nextTheme(theme));
  const ghost = `${buttonVariants({ variant: 'ghost', size: 'sm' })} capitalize`;

  return (
    <div className="bg-background text-foreground h-full overflow-y-auto" data-testid="landing-page">
      <header className="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-3 py-3`}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <L.FileSpreadsheet className="size-5" aria-hidden />
            xlsform-studio
          </span>
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={flip} className={ghost} data-testid="landing-theme-toggle">
              <ThemeIcon className="size-4" aria-hidden />
              Theme: {theme}
            </button>
            <Ext href={REPO} cls={ghost} t="GitHub" />
            <Ext href={DL} cls={buttonVariants({ variant: 'outline', size: 'sm' })} id="download-desktop" t="Download Desktop" />
            <Button size="sm" onClick={onLaunchApp} data-testid="launch-web-app">Open Web App</Button>
          </nav>
        </div>
      </header>

      <section aria-label="Hero" className="border-border relative overflow-hidden border-b">
        <div aria-hidden className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]`} />
        <div className={`${WRAP} relative py-12 sm:py-16`}>
          <p className={`border-border bg-card ${M} inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium`}>
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            Built for ODK, KoboToolbox, SurveyCTO &amp; CommCare form authors
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            Author complex XLSForms without Excel&apos;s blind spots.
          </h1>
          <p className={`${M} mt-4 max-w-2xl text-base sm:text-lg`}>
            IDE intelligence at spreadsheet speed: context-aware <code className="text-foreground font-mono text-sm">relevant</code> autocomplete, &lt;15ms validation, and lossless <code className="text-foreground font-mono text-sm">.xlsx</code> round-trip—100% local in your browser or offline on Windows.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onLaunchApp} data-testid="hero-launch-web-app">Launch Web Editor</Button>
            <Ext href={DL} cls={buttonVariants({ variant: 'outline', size: 'lg' })} id="hero-download-desktop" t="Download for Windows (.exe)" />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {KEYS.map(([k, desc]) => (
              <span key={k} className={`${M} inline-flex items-center gap-1.5`}><kbd className={KBD}>{k}</kbd>{desc}</span>
            ))}
          </div>
        </div>
      </section>

      <main className={`${WRAP} space-y-14 py-10 sm:py-14`}>
        <IdeShowcase />

        <section aria-label="Pain points vs solutions" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COMPARE.map(([badTitle, badBody, goodTitle, goodBody]) => (
            <article key={badBody} className={`${CARD} flex flex-col justify-between gap-3 p-4`}>
              <div>
                <span className="text-destructive font-mono text-[11px] font-medium uppercase">{badTitle}</span>
                <p className={`${M} mt-1 text-sm`}>{badBody}</p>
              </div>
              <div className="border-border border-t pt-3">
                <span className="font-mono text-[11px] font-medium text-emerald-600 uppercase dark:text-emerald-400">{goodTitle}</span>
                <p className="mt-1 text-sm font-medium">{goodBody}</p>
              </div>
            </article>
          ))}
        </section>

        <section aria-label="Core Features">
          <h2 className="text-2xl font-bold tracking-tight">Built for real XLSForm complexity</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([Icon, title, key, body]) => (
              <article key={title} className={`${CARD} p-5`}>
                <div className="flex items-center justify-between gap-2">
                  <Icon className="size-5" aria-hidden />
                  {key && <kbd className={KBD}>{key}</kbd>}
                </div>
                <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                <p className={`${M} mt-1 text-sm`}>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-label="Web vs. Desktop">
          <h2 className="text-2xl font-bold tracking-tight">Web App vs. Desktop App</h2>
          <p className={`${M} mt-1.5 text-sm`}>Two ways to run xlsform-studio—both keep your forms local and private.</p>
          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
            {PLANS.map((plan) => (
              <article key={plan.name} className={`${CARD} p-6`}>
                <h3 className="flex items-center justify-between gap-2 text-base font-semibold">
                  {plan.name}
                  <span className="border-border bg-muted text-muted-foreground rounded border px-2 py-0.5 text-xs font-medium">{plan.badge}</span>
                </h3>
                <p className={`${M} mt-1 text-sm`}>{plan.sub}</p>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {plan.items.map(([Icon, text]) => (
                    <li key={text} className="flex items-start gap-2.5">
                      <Icon className={`${M} mt-0.5 size-4 shrink-0`} aria-hidden />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className={`${WRAP} ${M} flex items-center justify-between gap-3 py-6 text-xs`}>
          <span>xlsform-studio · MIT · Offline-first XLSForm IDE</span>
          <div className="flex gap-4">
            <Ext href={REPO} cls="hover:text-foreground" t="GitHub" />
            <Ext href={DL} cls="hover:text-foreground" t="Releases" />
          </div>
        </div>
      </footer>
    </div>
  );
}
