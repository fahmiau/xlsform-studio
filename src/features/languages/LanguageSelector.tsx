/**
 * Toolbar language selector (Task 5.4, PRD wireframe `[Lang: ID + EN v]`).
 * Display-only: chooses which localized columns the grids show and remembers
 * the view per file. It never mutates the workbook.
 */
import { useMemo, useState } from 'react';
import { Languages, Plus } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { findLanguage, type Language } from '@/core/languages/discover';
import {
  splitPair,
  translationSummary,
  type LanguageViewMode,
  type LanguageViewState,
} from '@/core/languages/viewModes';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { AddLanguageDialog } from './AddLanguageDialog';
import { updateLanguageView } from './useLanguageView';

const MODE_LABELS: Record<LanguageViewMode, string> = {
  all: 'All languages',
  single: 'Single language',
  split: 'Translation split',
};

function columnCount(language: Language): number {
  return language.columns.survey.length + language.columns.choices.length;
}

function shortLabel(language: Language | undefined): string {
  if (!language) return '—';
  return language.code ? language.code.toUpperCase() : language.name;
}

export function LanguageSelector() {
  const languages = useDerivedStore((state) => state.languages);
  const view = useUiStore((state) => state.languageView);
  const data = useWorkbookStore((state) => state.data);
  const [open, setOpen] = useState(false);
  const addOpen = useUiStore((state) => state.addLanguageOpen);
  const setAddOpen = useUiStore((state) => state.setAddLanguageOpen);

  const { source, target } = useMemo(() => splitPair(languages, view), [languages, view]);
  const untranslated = useMemo(() => {
    if (view.mode !== 'split' || !source) return 0;
    return (
      translationSummary(data.survey, languages, source.id, target?.id).count +
      translationSummary(data.choices, languages, source.id, target?.id).count
    );
  }, [data.choices, data.survey, languages, source, target, view.mode]);

  const summary =
    view.mode === 'all'
      ? 'All'
      : view.mode === 'single'
        ? shortLabel(findLanguage(languages, view.language) ?? languages[0])
        : `${shortLabel(source)} + ${shortLabel(target)}`;

  const apply = (next: LanguageViewState) => updateLanguageView(next);

  return (
    <div className="relative">
      <button
        type="button"
        className="hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Language view"
        data-testid="language-selector"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <Languages aria-hidden className="size-4" />
        <span data-testid="language-view-summary">{summary}</span>
        {view.mode === 'split' && untranslated > 0 ? (
          <span
            className="rounded bg-amber-200 px-1 text-[10px] text-amber-900"
            data-testid="untranslated-count"
          >
            {untranslated} untranslated
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="bg-background absolute right-0 z-40 mt-1 w-72 space-y-2 rounded border p-2 text-xs shadow-lg"
          role="dialog"
          aria-label="Language view"
          data-testid="language-view-menu"
        >
          <fieldset className="space-y-1">
            <legend className="text-muted-foreground mb-1">View</legend>
            {(['all', 'single', 'split'] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="language-view-mode"
                  checked={view.mode === mode}
                  data-testid={`language-mode-${mode}`}
                  onChange={() =>
                    apply({
                      mode,
                      language: view.language ?? languages[0]?.id ?? null,
                      source: view.source ?? source?.id ?? null,
                      target: view.target ?? target?.id ?? null,
                    })
                  }
                />
                {MODE_LABELS[mode]}
              </label>
            ))}
          </fieldset>

          {view.mode === 'split' ? (
            <div className="grid grid-cols-2 gap-1">
              <label className="space-y-0.5">
                <span className="text-muted-foreground">Source</span>
                <Select
                  value={source?.id ?? ''}
                  onValueChange={(id) => apply({ ...view, source: id || null })}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full text-xs"
                    aria-label="Source language"
                    data-testid="language-source"
                  >
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((language) => (
                      <SelectItem key={language.id} value={language.id} className="text-xs">
                        {language.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-0.5">
                <span className="text-muted-foreground">Target</span>
                <Select
                  value={target?.id ?? ''}
                  onValueChange={(id) => apply({ ...view, target: id || null })}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full text-xs"
                    aria-label="Target language"
                    data-testid="language-target"
                  >
                    <SelectValue placeholder="Target" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((language) => (
                      <SelectItem key={language.id} value={language.id} className="text-xs">
                        {language.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          ) : null}

          <ul className="max-h-48 space-y-0.5 overflow-auto">
            {languages.length === 0 ? (
              <li className="text-muted-foreground">No localized columns yet.</li>
            ) : (
              languages.map((language) => (
                <li key={language.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-accent ${
                      view.mode === 'single' && view.language === language.id ? 'bg-accent' : ''
                    }`}
                    data-testid={`language-item-${language.id}`}
                    onClick={() => apply({ ...view, mode: 'single', language: language.id })}
                  >
                    <span>{language.display}</span>
                    <span className="text-muted-foreground">{columnCount(language)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-1 rounded px-1 py-0.5 text-left"
            data-testid="add-language"
            onClick={() => {
              setAddOpen(true);
              setOpen(false);
            }}
          >
            <Plus aria-hidden className="size-3" /> Add language
          </button>
        </div>
      ) : null}

      <AddLanguageDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
