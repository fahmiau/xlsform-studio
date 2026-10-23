/**
 * Pure palette data sources (Task 5.6). Keeping the search and the item
 * construction here makes filtering testable without mounting the dialog.
 */
import { findColumnKey } from '@/core/indexes/columns';
import type { VariableMetadata } from '@/core/indexes/variables';
import type { Language } from '@/core/languages/discover';
import type { LanguageViewState } from '@/core/languages/viewModes';
import type { DiagnosticIssue } from '@/core/lint';
import { parseType } from '@/core/model/parseType';
import type { RowId, WorkbookData } from '@/core/model/types';
import { shortcutLabel, type AppCommand } from '@/lib/commands';

export type PaletteSection = 'commands' | 'variables' | 'lists' | 'problems' | 'languages';
export type QueryPrefix = '>' | '@' | '#' | '!' | null;

export interface PaletteItem {
  id: string;
  section: PaletteSection;
  title: string;
  subtitle?: string;
  shortcut?: string;
  /** Extra text that participates in the fuzzy search. */
  keywords?: string;
  run: () => void;
}

export interface ParsedQuery {
  prefix: QueryPrefix;
  term: string;
}

const PREFIX_SECTION: Record<Exclude<QueryPrefix, null>, PaletteSection> = {
  '>': 'commands',
  '@': 'variables',
  '#': 'lists',
  '!': 'problems',
};

export function parseQuery(input: string): ParsedQuery {
  const first = input.charAt(0);
  if (first === '>' || first === '@' || first === '#' || first === '!') {
    return { prefix: first, term: input.slice(1).trim() };
  }
  return { prefix: null, term: input.trim() };
}

/**
 * Tiny fuzzy match: exact substring beats a subsequence (`hh_inc` still finds
 * `hh_income`). Returns 0 for no match so callers can filter cheaply.
 */
export function fuzzyScore(text: string, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  const haystack = text.toLowerCase();
  const direct = haystack.indexOf(needle);
  if (direct === 0) return 1;
  if (direct > 0) return 0.8;
  let index = 0;
  for (const char of needle) {
    if (char === ' ') continue;
    index = haystack.indexOf(char, index);
    if (index < 0) return 0;
    index += 1;
  }
  return 0.4;
}

/** Filter by the typed prefix and the fuzzy term over title/subtitle/keywords. */
export function filterItems(items: readonly PaletteItem[], input: string): PaletteItem[] {
  const { prefix, term } = parseQuery(input);
  const section = prefix ? PREFIX_SECTION[prefix] : null;
  return items.filter((item) => {
    if (section && item.section !== section) return false;
    const haystack = [item.title, item.subtitle, item.keywords].filter(Boolean).join(' ');
    return fuzzyScore(haystack, term) > 0;
  });
}

export function commandItems(commands: readonly AppCommand[]): PaletteItem[] {
  return commands
    .filter((command) => !command.when || command.when())
    .map((command) => ({
      id: `command:${command.id}`,
      section: 'commands' as const,
      title: command.title,
      subtitle: 'Command',
      keywords: command.id,
      ...(command.shortcut ? { shortcut: shortcutLabel(command.shortcut) } : {}),
      run: () => {
        void command.run();
      },
    }));
}

export function variableItems(
  variables: readonly VariableMetadata[],
  reveal: (variable: VariableMetadata) => void,
): PaletteItem[] {
  return variables.map((variable) => ({
    id: `variable:${variable.rowId}`,
    section: 'variables' as const,
    title: variable.name,
    subtitle: [variable.questionType, variable.primaryLabel].filter(Boolean).join(' · '),
    keywords: variable.groupPath.join(' '),
    run: () => reveal(variable),
  }));
}

export interface ChoiceListInfo {
  name: string;
  choiceCount: number;
  /** First survey row bound to the list, when there is one. */
  surveyRowId?: RowId;
  /** Survey question name, for search. */
  questionName?: string;
}

/** Distinct choice lists in first-seen order, with their survey binding. */
export function collectChoiceLists(data: WorkbookData): ChoiceListInfo[] {
  const listKey = findColumnKey(data.choices, 'list_name') ?? 'list_name';
  const typeKey = findColumnKey(data.survey, 'type') ?? 'type';
  const nameKey = findColumnKey(data.survey, 'name') ?? 'name';
  const lists = new Map<string, ChoiceListInfo>();

  for (const row of data.choices.rows) {
    const name = (row.cells[listKey] ?? '').trim();
    if (!name) continue;
    const entry = lists.get(name);
    if (entry) entry.choiceCount += 1;
    else lists.set(name, { name, choiceCount: 1 });
  }

  for (const row of data.survey.rows) {
    const listName = parseType(row.cells[typeKey] ?? '').listName;
    if (!listName) continue;
    const questionName = (row.cells[nameKey] ?? '').trim();
    const entry = lists.get(listName);
    if (!entry) {
      lists.set(listName, {
        name: listName,
        choiceCount: 0,
        surveyRowId: row.id,
        ...(questionName ? { questionName } : {}),
      });
    } else if (!entry.surveyRowId) {
      entry.surveyRowId = row.id;
      if (questionName) entry.questionName = questionName;
    }
  }

  return [...lists.values()];
}

export function listItems(data: WorkbookData, open: (list: ChoiceListInfo) => void): PaletteItem[] {
  return collectChoiceLists(data).map((list) => ({
    id: `list:${list.name}`,
    section: 'lists' as const,
    title: list.name,
    subtitle: `${list.choiceCount} choice${list.choiceCount === 1 ? '' : 's'}`,
    ...(list.questionName ? { keywords: list.questionName } : {}),
    run: () => open(list),
  }));
}

export function problemItems(
  diagnostics: readonly DiagnosticIssue[],
  reveal: (issue: DiagnosticIssue) => void,
): PaletteItem[] {
  return diagnostics.map((issue, index) => ({
    id: `problem:${index}:${issue.ruleId}`,
    section: 'problems' as const,
    title: issue.message,
    subtitle: `${issue.ruleId} · ${issue.sheet}`,
    keywords: `${issue.ruleId} ${issue.sheet}`,
    run: () => reveal(issue),
  }));
}

const VIEW_LABEL: Record<LanguageViewState['mode'], string> = {
  all: 'All languages',
  single: 'Single language',
  split: 'Translation split',
};

export function languageViewItems(
  languages: readonly Language[],
  apply: (view: LanguageViewState) => void,
): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      id: 'language-view:all',
      section: 'languages' as const,
      title: `View: ${VIEW_LABEL.all}`,
      subtitle: 'Show every localized column',
      keywords: 'language view all',
      run: () => apply({ mode: 'all', language: null, source: null, target: null }),
    },
  ];

  for (const language of languages) {
    items.push({
      id: `language-view:single:${language.id}`,
      section: 'languages' as const,
      title: `View: ${language.display}`,
      subtitle: VIEW_LABEL.single,
      keywords: `language view ${language.display} ${language.code ?? ''}`,
      run: () =>
        apply({
          mode: 'single',
          language: language.id,
          source: null,
          target: null,
        }),
    });
  }

  const [first, second] = languages;
  if (first && second && first.id !== second.id) {
    items.push({
      id: 'language-view:split',
      section: 'languages' as const,
      title: `View: ${VIEW_LABEL.split} (${first.display} + ${second.display})`,
      subtitle: 'Source on the left, translation on the right',
      keywords: 'language view translation split',
      run: () =>
        apply({
          mode: 'split',
          language: null,
          source: first.id,
          target: second.id,
        }),
    });
  }

  return items;
}
