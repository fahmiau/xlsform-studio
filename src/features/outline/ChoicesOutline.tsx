/** Choice-list Outline for the choices sheet (C3). No groups, no drag-and-drop. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Search } from 'lucide-react';

import { findColumnKey } from '@/core/indexes/columns';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { flattenChoices, type ChoiceListItem } from './flattenChoices';
import { handleOutlineSearchNonce } from './outlineSearchFocus';

export function ChoicesOutline() {
  const byList = useDerivedStore((state) => state.indexes.choices.byList);
  const data = useWorkbookStore((state) => state.data);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const focusNonce = useUiStore((state) => state.outlineSearchNonce);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    const input = searchRef.current;
    if (input && handleOutlineSearchNonce(focusNonce)) {
      input.focus();
      input.select();
    }
  }, [focusNonce]);

  const items = useMemo(() => flattenChoices(byList, filter), [byList, filter]);
  const boundedIndex = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);
  const activeItem = boundedIndex >= 0 ? items[boundedIndex] : undefined;

  const jump = (item: ChoiceListItem) => {
    const nameKey = findColumnKey(data.choices, 'name') ?? 'name';
    const ui = useUiStore.getState();
    ui.setActiveCell({ sheet: 'choices', rowId: item.rowId, column: nameKey });
    ui.requestReveal('choices', item.rowId);
    ui.flashRow(item.rowId);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      if (useUiStore.getState().flashRowId === item.rowId) {
        useUiStore.getState().flashRow(null);
      }
    }, 600);
  };

  const activate = (index: number) => {
    setActiveIndex(index);
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <section className="flex h-full min-h-0 flex-col" data-testid="outline-panel">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <Search aria-hidden className="text-muted-foreground size-3.5" />
        <input
          ref={searchRef}
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setActiveIndex(0);
          }}
          placeholder="Search lists…"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          data-testid="outline-search"
          aria-label="Search choice lists"
        />
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-auto p-1 outline-none"
        tabIndex={0}
        role="listbox"
        aria-label="Choice lists"
        data-testid="outline-tree"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (items.length > 0)
              activate(Math.min(items.length - 1, Math.max(0, boundedIndex) + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (items.length > 0) activate(Math.max(0, boundedIndex - 1));
          } else if (event.key === 'Enter' && activeItem) {
            // Let a focused row button's own click handle Enter once.
            if (event.target instanceof HTMLButtonElement) return;
            event.preventDefault();
            jump(activeItem);
          }
        }}
      >
        {items.length === 0 ? (
          <p
            className="text-muted-foreground p-2 text-xs"
            role="status"
            data-testid="outline-empty"
          >
            {filter ? 'No matching lists.' : 'No choice lists yet.'}
          </p>
        ) : (
          items.map((item, index) => (
            <button
              key={item.listName}
              type="button"
              role="option"
              aria-selected={boundedIndex === index}
              aria-label={`${item.listName}, ${item.count} ${
                item.count === 1 ? 'choice' : 'choices'
              }`}
              data-testid={`outline-choice-list-${item.listName}`}
              className={`flex h-6 w-full items-center gap-1 rounded px-1 text-left text-xs ${
                boundedIndex === index ? 'bg-accent' : 'hover:bg-accent/60'
              }`}
              onClick={() => {
                setActiveIndex(index);
                jump(item);
              }}
              onFocus={() => setActiveIndex(index)}
            >
              <ListChecks aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-mono">{item.listName}</span>
              <span className="text-muted-foreground shrink-0 text-[10px]">{item.count}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
