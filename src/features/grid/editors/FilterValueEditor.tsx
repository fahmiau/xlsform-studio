/** Cascading-filter parent choice picker for custom filter columns. */
import { useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { findColumnKey } from '@/core/indexes/columns';
import { primaryLabelColumn } from '@/core/languages/discover';
import { useDerivedStore } from '@/state/derivedStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { makeEnumCell, type EnumCell } from '../cells/EnumCell';
import {
  actionMovement,
  useConsumeDirectType,
  useDirectTypeInitialState,
  useFocusInputOnMount,
} from './directTypeBuffer';
import { filterByFuzzy } from './fuzzy';

type EditorProps = Parameters<ProvideEditorComponent<EnumCell>>[0];

interface ParentChoiceOption {
  kind: 'choice';
  name: string;
  label: string;
}

interface ClearOption {
  kind: 'clear';
}

type PickerOption = ParentChoiceOption | ClearOption;

function loadParentChoices(parentListName: string): ParentChoiceOption[] {
  if (!parentListName) return [];
  const data = useWorkbookStore.getState().data;
  const rows = useDerivedStore.getState().indexes.choices.byList[parentListName] ?? [];
  const nameKey = findColumnKey(data.choices, 'name') ?? 'name';
  const labelKey = primaryLabelColumn(data.choices, data);
  const seen = new Set<string>();
  const options: ParentChoiceOption[] = [];
  for (const row of rows) {
    const name = (row.cells[nameKey] ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const label = labelKey ? (row.cells[labelKey] ?? '').trim() : '';
    options.push({ kind: 'choice', name, label });
  }
  return options;
}

export function FilterValueEditor({
  value,
  initialValue,
  onChange,
  onFinishedEditing,
}: EditorProps) {
  const isDirectType = initialValue !== undefined;
  const parentListName = value.data.parentListName ?? '';
  const options = useMemo(() => loadParentChoices(parentListName), [parentListName]);
  const [query, setQuery] = useDirectTypeInitialState(initialValue, '');
  const [activeIndex, setActiveIndex] = useState(() => {
    if (isDirectType) return 0;
    const idx = options.findIndex((opt) => opt.name === value.data.value);
    return idx >= 0 ? idx : 0;
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredChoices = useMemo(
    () => filterByFuzzy(query, options, (opt) => `${opt.name} ${opt.label}`),
    [options, query],
  );

  const visibleItems: PickerOption[] = useMemo(() => {
    const items: PickerOption[] = [...filteredChoices];
    if (value.data.value && query === '') {
      items.push({ kind: 'clear' });
    }
    return items;
  }, [filteredChoices, query, value.data.value]);

  useFocusInputOnMount(inputRef, true);

  useConsumeDirectType((pending) => {
    if (!pending?.trailingAction) return;
    const movement = actionMovement(pending.trailingAction);
    if (!movement) {
      onFinishedEditing(undefined, [0, 0]);
      return;
    }
    const matched = filterByFuzzy(pending.text, options, (opt) => `${opt.name} ${opt.label}`)[0];
    finish(matched?.name ?? pending.text.trim(), movement);
  });

  function finish(nextValue: string, movement: readonly [-1 | 0 | 1, -1 | 0 | 1] = [0, 0]) {
    const cell = makeEnumCell({ ...value.data, value: nextValue });
    onChange(cell);
    onFinishedEditing(cell, movement);
  }

  function commitActive(movement: readonly [-1 | 0 | 1, -1 | 0 | 1] = [0, 0]) {
    const item = visibleItems[activeIndex];
    if (item?.kind === 'choice') {
      finish(item.name, movement);
      return;
    }
    if (item?.kind === 'clear') {
      finish('', movement);
      return;
    }
    finish(query.trim(), movement);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (visibleItems.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((index) =>
        event.key === 'ArrowDown'
          ? (index + 1) % visibleItems.length
          : (index - 1 + visibleItems.length) % visibleItems.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commitActive([0, 0]);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      commitActive([event.shiftKey ? -1 : 1, 0]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onFinishedEditing(undefined, [0, 0]);
      return;
    }
    if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
      setActiveIndex(0);
    }
  }

  return (
    <Command
      shouldFilter={false}
      className="bg-popover text-popover-foreground w-[280px] overflow-hidden rounded-md border shadow-lg"
      data-testid="filter-value-editor"
      loop
    >
      <div className="border-b px-2 py-1 text-[11px] font-medium">
        Parent choice{parentListName ? ` (${parentListName})` : ''}
      </div>
      <Command.Input
        ref={inputRef}
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search parent choice…"
        className="border-b bg-transparent px-2 py-1.5 text-sm outline-none"
        data-testid="filter-value-editor-input"
        autoFocus
      />
      <Command.List className="max-h-64 overflow-auto p-1">
        {visibleItems.length === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">
            No parent choices in {parentListName || 'list'} — press Enter to use the raw value.
          </div>
        ) : null}
        {visibleItems.map((item, index) =>
          item.kind === 'choice' ? (
            <Command.Item
              key={item.name}
              value={item.name}
              onSelect={() => finish(item.name)}
              onMouseEnter={() => setActiveIndex(index)}
              aria-selected={index === activeIndex}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                index === activeIndex ? 'bg-accent' : ''
              }`}
            >
              <span className="font-mono">{item.name}</span>
              {item.label ? (
                <span className="text-muted-foreground truncate text-[11px]">{item.label}</span>
              ) : null}
            </Command.Item>
          ) : (
            <Command.Item
              key="__clear__"
              value="__clear__"
              onSelect={() => finish('')}
              onMouseEnter={() => setActiveIndex(index)}
              aria-selected={index === activeIndex}
              className={`text-muted-foreground cursor-pointer rounded border-t px-2 py-1 text-xs ${
                index === activeIndex ? 'bg-accent' : ''
              }`}
            >
              Clear value
            </Command.Item>
          ),
        )}
      </Command.List>
    </Command>
  );
}
