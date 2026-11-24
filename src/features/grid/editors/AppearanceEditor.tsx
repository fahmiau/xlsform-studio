/** `appearance` editor filtered by the row's base type (Task 3.1). */
import { useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { appearanceSuggestions } from '@/core/model/appearances';

import { makeEnumCell, type EnumCell } from '../cells/EnumCell';
import {
  actionMovement,
  useConsumeDirectType,
  useDirectTypeInitialState,
  useFocusInputOnMount,
} from './directTypeBuffer';
import { filterByFuzzy } from './fuzzy';

type EditorProps = Parameters<ProvideEditorComponent<EnumCell>>[0];

export function AppearanceEditor({
  value,
  initialValue,
  onChange,
  onFinishedEditing,
}: EditorProps) {
  const isDirectType = initialValue !== undefined;
  const [query, setQuery] = useDirectTypeInitialState(initialValue, '');
  const [focusTick, setFocusTick] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const userEdited = useRef(false);

  useFocusInputOnMount(inputRef, isDirectType, focusTick);

  useConsumeDirectType((pending) => {
    if (pending && !userEdited.current && pending.text !== query) {
      setQuery(pending.text);
      setActiveIndex(0);
      setFocusTick((tick) => tick + 1);
    }
    if (!pending?.trailingAction) return;
    const movement = actionMovement(pending.trailingAction);
    if (!movement) {
      onFinishedEditing(undefined, [0, 0]);
      return;
    }
    const items = filterByFuzzy(
      pending.text,
      appearanceSuggestions(value.data.baseType ?? ''),
      (entry) => `${entry.name} ${entry.description}`,
    );
    const chosen = items[0]?.name ?? pending.text.trim();
    if (chosen) finish(chosen, movement);
  });

  const suggestions = useMemo(
    () => appearanceSuggestions(value.data.baseType ?? ''),
    [value.data.baseType],
  );
  const filtered = useMemo(
    () => filterByFuzzy(query, suggestions, (entry) => `${entry.name} ${entry.description}`),
    [query, suggestions],
  );

  function finish(appearance: string, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) {
    const cell = makeEnumCell({ ...value.data, value: appearance });
    onChange(cell);
    onFinishedEditing(cell, movement ?? [0, 0]);
  }

  function commitActive(movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) {
    const entry = filtered[activeIndex];
    if (entry) finish(entry.name, movement);
    else if (query.trim()) finish(query.trim(), movement);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (filtered.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((index) =>
        event.key === 'ArrowDown'
          ? (index + 1) % filtered.length
          : (index - 1 + filtered.length) % filtered.length,
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
    }
  }

  return (
    <Command
      shouldFilter={false}
      className="bg-popover text-popover-foreground w-[320px] overflow-hidden rounded-md border shadow-lg"
      data-testid="appearance-editor"
      loop
    >
      <div className="border-b px-2 py-1 text-[11px] font-medium">
        Appearance{value.data.baseType ? ` for ${value.data.baseType}` : ''}
      </div>
      <Command.Input
        ref={inputRef}
        value={query}
        onValueChange={(value) => {
          userEdited.current = true;
          setQuery(value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search appearances…"
        className="border-b bg-transparent px-2 py-1.5 text-sm outline-none"
        data-testid="appearance-editor-input"
        autoFocus
      />
      <Command.List className="max-h-64 overflow-auto p-1">
        {filtered.length === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">
            No matching appearance — press Enter to use the raw value.
          </div>
        ) : null}
        {filtered.map((entry, index) => (
          <Command.Item
            key={entry.name}
            value={entry.name}
            onSelect={() => finish(entry.name)}
            onMouseEnter={() => setActiveIndex(index)}
            aria-selected={index === activeIndex}
            className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
              index === activeIndex ? 'bg-accent' : ''
            }`}
          >
            <span className="font-mono">{entry.name}</span>
            <span className="text-muted-foreground truncate text-[11px]">{entry.description}</span>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
