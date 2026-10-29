/** Left-panel Outline Tree (Tasks 3.9/3.10). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';

import { buildGroupTree } from '@/core/indexes/groupTree';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { flattenOutline, type OutlineItem } from './flattenTree';
import { ChoicesOutline } from './ChoicesOutline';
import { OutlineNode } from './OutlineNode';
import { useOutlineDnd } from './useOutlineDnd';

const ROW_HEIGHT = 24;

export function OutlinePanel() {
  const activeSheet = useUiStore((state) => state.activeSheet);
  return activeSheet === 'choices' ? <ChoicesOutline /> : <SurveyOutline />;
}

function SurveyOutline() {
  const data = useWorkbookStore((state) => state.data);
  const indexes = useDerivedStore((state) => state.indexes);
  const collapsed = useUiStore((state) => state.collapsedGroupIds);
  const flashRowId = useUiStore((state) => state.flashRowId);
  const diagnosticsByRow = useDerivedStore((state) => state.diagnosticIndex.byRow);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const focusNonce = useUiStore((state) => state.outlineSearchNonce);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    const input = searchRef.current;
    if (focusNonce > 0 && input) {
      input.focus();
      input.select();
    }
  }, [focusNonce]);

  const items = useMemo(
    () =>
      flattenOutline(data.survey, indexes.groups, {
        collapsed,
        filter,
      }),
    [collapsed, data.survey, filter, indexes.groups],
  );

  const groupsById = useMemo(
    () => new Map(buildGroupTree(data.survey).groups.map((group) => [group.id, group])),
    [data.survey],
  );

  const dnd = useOutlineDnd(items);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const boundedIndex = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);
  const activeItem = boundedIndex >= 0 ? items[boundedIndex] : undefined;
  const draggingItem = dnd.activeId ? items.find((item) => item.key === dnd.activeId) : undefined;

  const jump = (item: OutlineItem) => {
    useUiStore.getState().requestReveal('survey', item.rowId);
    useUiStore.getState().flashRow(item.rowId);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      if (useUiStore.getState().flashRowId === item.rowId) {
        useUiStore.getState().flashRow(null);
      }
    }, 600);
  };

  const activate = (index: number) => {
    setActiveIndex(index);
    virtualizer.scrollToIndex(index, { align: 'auto' });
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
          placeholder="Search outline…"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          data-testid="outline-search"
          aria-label="Search outline"
        />
      </div>

      <DndContext
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        onDragStart={dnd.handleDragStart}
        onDragOver={dnd.handleDragOver}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto p-1 outline-none"
          tabIndex={0}
          role="tree"
          aria-label="Survey outline"
          data-testid="outline-tree"
          onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (items.length > 0)
                activate(Math.min(items.length - 1, Math.max(0, boundedIndex) + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (items.length > 0) activate(Math.max(0, boundedIndex - 1));
            } else if (event.key === 'Enter' && activeItem) {
              event.preventDefault();
              jump(activeItem);
            }
          }}
        >
          {items.length === 0 ? (
            <p className="text-muted-foreground p-2 text-xs">
              {filter ? 'No matching rows.' : 'No groups or repeats yet.'}
            </p>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = items[virtualRow.index];
                if (!item) return null;
                return (
                  <div
                    key={item.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <OutlineNode
                      item={item}
                      group={groupsById.get(item.rowId)}
                      active={boundedIndex === virtualRow.index || flashRowId === item.rowId}
                      dragging={dnd.activeId === item.key}
                      severity={
                        (diagnosticsByRow.get(item.rowId)?.errors ?? 0) > 0
                          ? 'error'
                          : (diagnosticsByRow.get(item.rowId)?.warnings ?? 0) > 0
                            ? 'warning'
                            : undefined
                      }
                      onActivate={() => setActiveIndex(virtualRow.index)}
                      onJump={() => jump(item)}
                      onToggle={() => useUiStore.getState().toggleGroupCollapsed(item.rowId)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DragOverlay>
          {draggingItem ? (
            <div className="bg-popover rounded border px-2 py-0.5 text-xs shadow-lg">
              {draggingItem.name || '(unnamed)'}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
