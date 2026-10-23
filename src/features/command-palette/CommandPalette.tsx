/**
 * `Ctrl+K` command palette (Task 5.6): fuzzy variables, choice lists, lint
 * problems, language views, and every registered command. Prefixes narrow the
 * search: `>` commands, `@` variables, `#` lists, `!` problems.
 */
import { useMemo, useState } from 'react';
import { Command } from 'cmdk';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { findColumnKey } from '@/core/indexes/columns';
import type { VariableMetadata } from '@/core/indexes/variables';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';
import { listCommands } from '@/lib/commands';
import { revealDiagnostic } from '@/features/lint-panel/reveal';
import { updateLanguageView } from '@/features/languages/useLanguageView';

import {
  commandItems,
  filterItems,
  languageViewItems,
  listItems,
  problemItems,
  variableItems,
  type ChoiceListInfo,
  type PaletteItem,
} from './sources';

const SECTION_LABELS: Record<PaletteItem['section'], string> = {
  commands: 'Commands',
  variables: 'Go to variable',
  lists: 'Go to choice list',
  problems: 'Lint problems',
  languages: 'Language views',
};

function revealVariable(variable: VariableMetadata): void {
  const data = useWorkbookStore.getState().data;
  const ui = useUiStore.getState();
  const column = findColumnKey(data.survey, 'name') ?? data.survey.columns[0] ?? 'name';
  ui.setActiveSheet('survey');
  ui.setSelectedRowIds([variable.rowId]);
  ui.setActiveCell({ sheet: 'survey', rowId: variable.rowId, column });
  ui.requestReveal('survey', variable.rowId);
}

function openList(list: ChoiceListInfo): void {
  const ui = useUiStore.getState();
  if (list.surveyRowId) {
    usePrefsStore.getState().setPanelVisible('right', true);
    ui.setActiveSheet('survey');
    ui.openChoicesDrawer(list.surveyRowId);
    return;
  }
  const data = useWorkbookStore.getState().data;
  const listKey = findColumnKey(data.choices, 'list_name') ?? 'list_name';
  const row = data.choices.rows.find(
    (candidate) => (candidate.cells[listKey] ?? '').trim() === list.name,
  );
  ui.setActiveSheet('choices');
  if (row) ui.requestReveal('choices', row.id);
}

export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const setOpen = useUiStore((state) => state.setPaletteOpen);
  const data = useWorkbookStore((state) => state.data);
  const indexes = useDerivedStore((state) => state.indexes);
  const languages = useDerivedStore((state) => state.languages);
  const diagnostics = useDerivedStore((state) => state.diagnostics);
  const [search, setSearch] = useState('');

  const items = useMemo(
    () => [
      ...commandItems(listCommands()),
      ...variableItems(indexes.variables.order, revealVariable),
      ...listItems(data, openList),
      ...problemItems(diagnostics, revealDiagnostic),
      ...languageViewItems(languages, updateLanguageView),
    ],
    [data, diagnostics, indexes.variables.order, languages],
  );

  const visible = useMemo(() => filterItems(items, search), [items, search]);
  const sections = (Object.keys(SECTION_LABELS) as PaletteItem['section'][]).filter((section) =>
    visible.some((item) => item.section === section),
  );

  const run = (item: PaletteItem) => {
    setOpen(false);
    item.run();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <DialogContent
        className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
        data-testid="command-palette"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search commands, variables, choice lists, lint problems, and language views.
        </DialogDescription>
        <Command shouldFilter={false} loop vimBindings={false}>
          <div className="flex items-center border-b px-3">
            <Command.Input
              autoFocus
              className="h-10 w-full bg-transparent text-sm outline-none"
              value={search}
              data-testid="command-input"
              placeholder="Search…  > commands  @ variables  # lists  ! problems"
              onValueChange={setSearch}
            />
          </div>
          <Command.List className="max-h-80 overflow-auto p-1 text-sm">
            <Command.Empty className="text-muted-foreground p-4 text-center text-xs">
              No matches.
            </Command.Empty>
            {sections.map((section) => {
              const sectionItems = visible.filter((item) => item.section === section);
              return (
                <Command.Group
                  key={section}
                  heading={SECTION_LABELS[section]}
                  className="text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium"
                >
                  {sectionItems.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      className="text-foreground flex cursor-default items-center gap-2 rounded px-2 py-1.5 data-[selected=true]:bg-accent"
                      onSelect={() => run(item)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.title}
                        {item.subtitle ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {item.shortcut ? (
                        <kbd className="text-muted-foreground border px-1 text-[10px]">
                          {item.shortcut}
                        </kbd>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
