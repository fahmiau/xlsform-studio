/** One flattened outline row with drag handle and drop zones (Tasks 3.9/3.10). */
import { useDraggable } from '@dnd-kit/core';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  Hash,
  ListChecks,
  MapPin,
  Repeat,
} from 'lucide-react';

import { groupHiddenCount } from '@/core/ops/groups';
import type { GroupNode } from '@/core/indexes/groupTree';

import type { OutlineItem } from './flattenTree';
import { DropIndicator } from './DropIndicator';

function TypeIcon({ item }: { item: OutlineItem }) {
  if (item.kind === 'group' || item.kind === 'repeat') {
    if (item.kind === 'repeat') return <Repeat aria-hidden className="size-3.5 shrink-0" />;
    return item.collapsed ? (
      <Folder aria-hidden className="size-3.5 shrink-0" />
    ) : (
      <FolderOpen aria-hidden className="size-3.5 shrink-0" />
    );
  }
  if (item.kind === 'orphan') {
    return <AlertTriangle aria-hidden className="text-destructive size-3.5 shrink-0" />;
  }
  const type = item.type;
  if (type === 'select_one' || type === 'select_multiple' || type === 'rank') {
    return <ListChecks aria-hidden className="text-muted-foreground size-3.5 shrink-0" />;
  }
  if (type === 'integer' || type === 'decimal' || type === 'range') {
    return <Hash aria-hidden className="text-muted-foreground size-3.5 shrink-0" />;
  }
  if (type === 'date' || type === 'time' || type === 'dateTime') {
    return <Calendar aria-hidden className="text-muted-foreground size-3.5 shrink-0" />;
  }
  if (type === 'geopoint' || type === 'geotrace' || type === 'geoshape') {
    return <MapPin aria-hidden className="text-muted-foreground size-3.5 shrink-0" />;
  }
  return <FileText aria-hidden className="text-muted-foreground size-3.5 shrink-0" />;
}

export function OutlineNode({
  item,
  group,
  active,
  dragging,
  onJump,
  onToggle,
  onActivate,
  severity,
}: {
  item: OutlineItem;
  group?: GroupNode;
  active: boolean;
  dragging: boolean;
  onJump: () => void;
  onToggle: () => void;
  onActivate: () => void;
  severity?: 'error' | 'warning';
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.key,
    data: { item },
  });
  const isContainer = item.kind === 'group' || item.kind === 'repeat';
  const hidden = isContainer && group && item.collapsed ? groupHiddenCount(group) : 0;

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex h-6 items-center gap-1 rounded px-1 text-xs ${
        active ? 'bg-accent' : 'hover:bg-accent/60'
      } ${dragging ? 'opacity-60' : ''}`}
      data-testid={`outline-node-${item.rowId}`}
      data-kind={item.kind}
      onMouseDown={onActivate}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/4">
        <DropIndicator rowId={item.key} placement="before" valid />
      </div>
      {isContainer ? (
        <div className="pointer-events-none absolute inset-x-2 top-1/4 h-1/2">
          <DropIndicator rowId={item.key} placement="inside" valid={item.endIndex >= 0} />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4">
        <DropIndicator rowId={item.key} placement="after" valid />
      </div>

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none p-0.5"
        aria-label={`Drag ${item.name || 'row'}`}
        data-testid={`outline-drag-${item.rowId}`}
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical aria-hidden className="size-3" />
      </button>

      {isContainer ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-40"
          aria-label={item.collapsed ? 'Expand group' : 'Collapse group'}
          disabled={item.missingEnd}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          data-testid={`outline-toggle-${item.rowId}`}
        >
          {item.collapsed ? (
            <ChevronRight aria-hidden className="size-3" />
          ) : (
            <ChevronDown aria-hidden className="size-3" />
          )}
        </button>
      ) : (
        <span className="w-4" />
      )}

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        style={{ paddingLeft: item.depth * 8 }}
        onClick={(event) => {
          event.stopPropagation();
          onActivate();
          onJump();
        }}
        title={`${item.name || '(unnamed)'} — ${item.label || item.type}`}
      >
        <TypeIcon item={item} />
        <span className="shrink-0 font-mono">{item.name || '(unnamed)'}</span>
        <span className="text-muted-foreground min-w-0 truncate">
          {item.label || item.type || ''}
        </span>
      </button>

      {hidden > 0 ? (
        <span className="text-muted-foreground shrink-0 text-[10px]">({hidden} hidden)</span>
      ) : null}

      {severity ? (
        <span
          className={`size-1.5 shrink-0 rounded-full ${
            severity === 'error' ? 'bg-destructive' : 'bg-amber-500'
          }`}
          title={severity === 'error' ? 'Has errors' : 'Has warnings'}
          aria-label={severity === 'error' ? 'Has errors' : 'Has warnings'}
          data-testid={`outline-diagnostic-${item.rowId}`}
        />
      ) : null}
    </div>
  );
}
