import type { CSSProperties } from 'react';
import * as L from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { nextTheme } from '@/lib/theme';
import { usePrefsStore } from '@/state/prefsStore';

import { IdeShowcase } from './IdeShowcase';

const REPO = 'https://github.com/fahmiau/xlsform-studio';
const DL = `${REPO}/releases/latest`;
const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6';
const KBD =
  'border-border border-b-2 bg-card text-foreground rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums';

const KEYS = [
  ['Ctrl+Space', 'Autocomplete'],
  ['Ctrl+Enter', 'Choices drawer'],
  ['F8', 'Next lint error'],
  ['Ctrl+Z', 'Atomic undo'],
  ['Ctrl+K', 'Commands'],
] as const;

const COMPARE = [
  [
    'Raw Excel',
    'Silent typos in ${variable} or choice values break ODK Central uploads.',
    'xlsform-studio',
    'Checks XLS-001…011 in <15ms as you type.',
    '<15 ms',
  ],
  [
    'Raw Excel',
    'Switching tabs to copy choice names slows down skip-logic authoring.',
    'xlsform-studio',
    'Context-aware autocomplete & side-by-side Choices drawer.',
    'Ctrl+Space',
  ],
  [
    'Raw Excel',
    'Find-and-replace corrupts partial question names inside formulas.',
    'xlsform-studio',
    'Token-aware rename across every formula in one Ctrl+Z step.',
    '1× Ctrl+Z',
  ],
] as const;

const FEATURES = [
  [
    L.Braces,
    'Formula Autocomplete',
    'Ctrl+Space',
    'Completes ${variables}, choice names & ODK functions in relevant, constraint, and calculation.',
  ],
  [
    L.ShieldCheck,
    'Real-time Linter',
    'F8',
    'Checks XLS-001…011 in <15ms locally; F8 jumps straight to the offending cell.',
  ],
  [
    L.ListChecks,
    'Side-by-Side Choices Drawer',
    'Ctrl+Enter',
    'Edits lists inline beside the survey row with auto-slugify and name locks.',
  ],
  [
    L.Replace,
    'Safe Rename Refactoring',
    'Ctrl+Z',
    'Token-aware renames across all XPath formulas in one atomic undo entry.',
  ],
  [
    L.Languages,
    'Multilingual Views',
    null,
    'All, Single, or Side-by-side translation split views with untranslated counts.',
  ],
  [
    L.FileSpreadsheet,
    'Lossless .xlsx Round-Trip',
    null,
    'Preserves custom columns, passthrough sheets, header text & styling.',
  ],
] as const;

const PLANS = [
  {
    name: 'Web App (Browser)',
    sub: 'Instant access · Windows, macOS, Linux',
    badge: 'Browser',
    Icon: L.Globe,
    featured: false,
    items: [
      'Zero install; launch immediately in any modern browser.',
      'Full XLSForm grid, XLS-001…011 linter, ${variable} & choice autocomplete, Choices drawer, and multilingual views.',
      '100% client-side execution — .xlsx files are parsed locally in memory and never uploaded to any server.',
    ],
    securityNote:
      'AI Assistant is omitted on the web so API keys are never stored in browser storage.',
  },
  {
    name: 'Desktop App (Windows)',
    sub: 'Native Tauri v2 installer · Offline workstation',
    badge: 'Windows',
    Icon: L.Monitor,
    featured: true,
    items: [
      'Works completely offline with direct OS file associations and atomic disk saves.',
      'Crash recovery snapshots on disk and native Excel file-lock detection.',
    ],
    securityNote:
      'Optional AI Assistant (BYOK or local Ollama / LM Studio) with API keys stored in Windows Credential Manager and proxied through Rust.',
  },
] as const;

function staggerStyle(step: number): CSSProperties {
  return { '--stagger': step } as CSSProperties;
}

function BrandMark() {
  return <img src="/favicon.svg" alt="" className="size-7 shrink-0" aria-hidden />;
}

const Ext = ({
  href,
  cls,
  id,
  children,
}: {
  href: string;
  cls: string;
  id?: string;
  children: React.ReactNode;
}) => (
  <a href={href} target="_blank" rel="noreferrer" className={cls} data-testid={id}>
    {children}
  </a>
);

export function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  const theme = usePrefsStore((s) => s.theme);
  const flip = () => usePrefsStore.getState().setTheme(nextTheme(theme));

  const iconLayer =
    '[grid-area:1/1] flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:scale-100 motion-reduce:blur-[0px]';
  const shown = 'scale-100 opacity-100 blur-[0px]';
  const hidden = 'scale-[0.25] opacity-0 blur-[4px]';

  return (
    <div
      className="bg-background text-foreground h-full scroll-pt-16 overflow-y-auto"
      data-testid="landing-page"
    >
      <a
        href="#main-content"
        className="bg-background text-foreground focus-visible:outline-[var(--brand-solid)] sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-2 focus:outline-offset-2"
      >
        Skip to content
      </a>

      <header className="border-border/75 bg-background/85 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-3 py-2.5`}>
          <span className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.01em]">
            <BrandMark />
            <span>xlsform-studio</span>
          </span>

          <nav aria-label="Primary" className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={flip}
              data-testid="landing-theme-toggle"
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-8 items-center gap-1.5 rounded-md ps-2.5 pe-3 text-xs font-medium capitalize transition-[color,background-color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-solid)] [&:not(:disabled):active]:scale-[0.96]"
            >
              <span className="grid size-4 place-items-center" aria-hidden>
                <span className={`${iconLayer} ${theme === 'dark' ? shown : hidden}`}>
                  <L.Moon className="size-4" strokeWidth={1.75} />
                </span>
                <span className={`${iconLayer} ${theme === 'light' ? shown : hidden}`}>
                  <L.Sun className="size-4" strokeWidth={1.75} />
                </span>
                <span className={`${iconLayer} ${theme === 'system' ? shown : hidden}`}>
                  <L.Monitor className="size-4" strokeWidth={1.75} />
                </span>
              </span>
              <span>Theme: {theme}</span>
            </button>

            <Ext
              href={REPO}
              cls="text-muted-foreground hover:text-foreground inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-solid)]"
            >
              <span>GitHub</span>
              <L.ArrowUpRight className="size-3.5 opacity-70" aria-hidden />
            </Ext>

            <Ext
              href={DL}
              cls={`${buttonVariants({ variant: 'outline', size: 'sm' })} text-xs`}
              id="download-desktop"
            >
              Download Desktop
            </Ext>

            <Button
              variant="secondary"
              size="sm"
              onClick={onLaunchApp}
              data-testid="launch-web-app"
              className="text-xs"
            >
              Open Web App
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="outline-none">
        {/* Hero + Integrated IDE Workbench Stage */}
        <section aria-label="Hero" className="relative overflow-hidden">
          <div
            aria-hidden
            className="landing-stage-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_18%,black,transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(ellipse_55%_45%_at_50%_0%,var(--brand-soft),transparent)] opacity-85 dark:opacity-55"
          />

          <div className={`${WRAP} relative pt-10 pb-8 sm:pt-14 sm:pb-12`}>
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <p
                style={staggerStyle(0)}
                className="landing-enter landing-surface bg-card text-muted-foreground inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-medium"
              >
                <span className="bg-[var(--status-valid)] size-1.5 rounded-full" aria-hidden />
                <span>Built for ODK, KoboToolbox, SurveyCTO &amp; CommCare form authors</span>
              </p>

              <h1
                style={staggerStyle(1)}
                className="landing-enter mt-5 text-3xl leading-[1.08] font-bold tracking-[-0.025em] text-balance sm:text-5xl lg:text-[3.25rem]"
              >
                Author complex XLSForms without Excel’s blind spots.
              </h1>

              <p
                style={staggerStyle(2)}
                className="landing-enter text-muted-foreground mt-4 max-w-[58ch] text-base leading-[1.6] text-pretty sm:text-lg"
              >
                IDE intelligence at spreadsheet speed: context-aware{' '}
                <code className="border-border bg-muted/80 text-foreground rounded border px-1.5 py-0.5 font-mono text-[0.875em]">
                  relevant
                </code>{' '}
                autocomplete, <span className="tabular-nums">&lt;15ms</span> validation, and
                lossless{' '}
                <code className="border-border bg-muted/80 text-foreground rounded border px-1.5 py-0.5 font-mono text-[0.875em]">
                  .xlsx
                </code>{' '}
                round-trip—100% local in your browser or offline on Windows.
              </p>

              <div
                style={staggerStyle(3)}
                className="landing-enter mt-7 flex flex-wrap items-center justify-center gap-3"
              >
                <Button
                  size="lg"
                  onClick={onLaunchApp}
                  data-testid="hero-launch-web-app"
                  className="group bg-[var(--brand-solid)] text-[var(--brand-foreground)] hover:bg-[var(--brand-solid-hover)] h-11 rounded-lg has-[>svg]:ps-5 has-[>svg]:pe-4 shadow-sm"
                >
                  <span>Launch Web Editor</span>
                  <L.ArrowRight
                    className="size-4 transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Button>

                <Ext
                  href={DL}
                  cls={`${buttonVariants({ variant: 'outline', size: 'lg' })} h-11 rounded-lg has-[>svg]:ps-4 has-[>svg]:pe-5`}
                  id="hero-download-desktop"
                >
                  <L.Download className="size-4" strokeWidth={1.75} aria-hidden />
                  <span>Download for Windows (.exe)</span>
                </Ext>
              </div>

              <div
                style={staggerStyle(4)}
                className="landing-enter mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs"
              >
                {KEYS.map(([k, desc]) => (
                  <span key={k} className="text-muted-foreground inline-flex items-center gap-1.5">
                    <kbd className={KBD}>{k}</kbd>
                    <span>{desc}</span>
                  </span>
                ))}
              </div>
            </div>

            <div style={staggerStyle(5)} className="landing-enter mt-10 sm:mt-12">
              <IdeShowcase />
            </div>
          </div>
        </section>

        {/* Supporting Sections */}
        <div className={`${WRAP} space-y-20 py-14 sm:py-20`}>
          {/* Pain points vs solutions — unified ledger */}
          <section aria-label="Pain points vs solutions">
            <div className="landing-elevated bg-muted/40 rounded-2xl p-1.5">
              <div className="border-border bg-card overflow-hidden rounded-[10px] border">
                <div className="border-border bg-[var(--surface-subtle)] hidden grid-cols-12 border-b text-xs font-medium md:grid">
                  <div className="border-border text-[var(--status-error)] col-span-6 flex items-center gap-2 border-e px-5 py-3">
                    <L.XCircle className="size-4 shrink-0" aria-hidden />
                    <span className="font-mono text-[11px] tracking-[0.04em] uppercase">
                      Raw Excel
                    </span>
                  </div>
                  <div className="text-[var(--status-valid)] col-span-6 flex items-center gap-2 px-5 py-3">
                    <L.CheckCircle2 className="size-4 shrink-0" aria-hidden />
                    <span className="font-mono text-[11px] tracking-[0.04em] uppercase">
                      xlsform-studio
                    </span>
                  </div>
                </div>

                <div className="divide-border divide-y">
                  {COMPARE.map(([badTitle, badBody, goodTitle, goodBody, proof]) => (
                    <article key={badBody} className="grid grid-cols-1 md:grid-cols-12">
                      <div className="border-border md:border-e md:col-span-6 flex flex-col justify-center gap-1 px-5 py-4">
                        <span className="text-[var(--status-error)] inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.04em] uppercase md:hidden">
                          <L.XCircle className="size-3.5" aria-hidden />
                          {badTitle}
                        </span>
                        <p className="text-muted-foreground text-sm leading-[1.55] text-pretty">
                          {badBody}
                        </p>
                      </div>

                      <div className="bg-[var(--surface-subtle)]/35 md:col-span-6 flex items-center justify-between gap-4 px-5 py-4">
                        <div className="min-w-0">
                          <span className="text-[var(--status-valid)] inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.04em] uppercase md:hidden">
                            <L.CheckCircle2 className="size-3.5" aria-hidden />
                            {goodTitle}
                          </span>
                          <p className="mt-0.5 text-sm leading-[1.55] font-medium text-pretty md:mt-0">
                            {goodBody}
                          </p>
                        </div>
                        <span className="border-border bg-card text-[var(--brand-text)] hidden shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums sm:inline-block">
                          {proof}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Core Features */}
          <section aria-label="Core Features">
            <div className="max-w-2xl">
              <h2 className="text-2xl leading-[1.2] font-bold tracking-[-0.015em] text-balance sm:text-[1.75rem]">
                Built for real XLSForm complexity
              </h2>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([Icon, title, key, body]) => (
                <article key={title} className="landing-surface-interactive bg-card rounded-xl p-6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="bg-[var(--brand-soft)] text-[var(--brand-text)] inline-flex size-9 items-center justify-center rounded-lg">
                      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                    </span>
                    {key && <kbd className={KBD}>{key}</kbd>}
                  </div>
                  <h3 className="mt-4 text-[15px] leading-[1.3] font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-[1.55] text-pretty">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* Web vs Desktop */}
          <section aria-label="Web vs. Desktop">
            <div className="max-w-2xl">
              <h2 className="text-2xl leading-[1.2] font-bold tracking-[-0.015em] text-balance sm:text-[1.75rem]">
                Web App vs. Desktop App
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-[1.55] text-pretty sm:text-base">
                Two ways to run xlsform-studio—both keep your forms local and private.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              {PLANS.map(({ name, sub, badge, Icon, featured, items, securityNote }) => (
                <article
                  key={name}
                  className={`landing-surface bg-card flex flex-col justify-between gap-6 rounded-2xl p-6 sm:p-7 ${
                    featured ? 'border-[var(--brand-border)]/80' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
                            featured
                              ? 'bg-[var(--brand-soft)] text-[var(--brand-text)]'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                        </span>
                        <div>
                          <h3 className="text-base leading-[1.3] font-semibold">{name}</h3>
                          <p className="text-muted-foreground mt-0.5 text-sm">{sub}</p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${
                          featured
                            ? 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand-text)]'
                            : 'border-border bg-muted text-muted-foreground'
                        }`}
                      >
                        {badge}
                      </span>
                    </div>

                    <ul className="mt-5 space-y-3 text-sm leading-[1.55]">
                      {items.map((text) => (
                        <li key={text} className="flex items-start gap-2.5">
                          <L.Check
                            className="text-[var(--status-valid)] mt-1 size-4 shrink-0"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div
                    className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm leading-[1.5] ${
                      featured
                        ? 'border-[var(--brand-border)]/60 bg-[var(--brand-soft)]/50'
                        : 'border-border/80 bg-[var(--surface-subtle)]'
                    }`}
                  >
                    <L.Shield
                      className={`mt-0.5 size-4 shrink-0 ${
                        featured
                          ? 'text-[var(--brand-text)]'
                          : 'text-[var(--muted-foreground-strong)]'
                      }`}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span
                      className={
                        featured ? 'text-foreground' : 'text-[var(--muted-foreground-strong)]'
                      }
                    >
                      {securityNote}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-border/75 border-t">
        <div
          className={`${WRAP} text-muted-foreground flex flex-wrap items-center justify-between gap-3 py-6 text-xs`}
        >
          <span>xlsform-studio · MIT · Offline-first XLSForm IDE</span>
          <div className="flex items-center gap-3">
            <Ext
              href={REPO}
              cls="hover:text-foreground rounded px-2 py-1.5 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-solid)]"
            >
              GitHub
            </Ext>
            <Ext
              href={DL}
              cls="hover:text-foreground rounded px-2 py-1.5 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-solid)]"
            >
              Releases
            </Ext>
          </div>
        </div>
      </footer>
    </div>
  );
}
