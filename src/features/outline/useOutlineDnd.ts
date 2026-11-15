/** Outline drag-and-drop planning + store mutation (Task 3.10). */
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { moveBlock } from '@/core/ops/rows';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import type { OutlineItem } from './flattenTree';

export type DropPlacement = 'before' | 'inside' | 'after';

export interface MovePlan {
  activeId: string;
  sourceStart: number;
  sourceEnd: number;
  targetIndex: number;
}

export interface MoveCheck {
  ok: boolean;
  reason?: string;
  plan?: MovePlan;
}

export function planOutlineMove(
  items: readonly OutlineItem[],
  activeId: string | null,
  overId: string | null,
): MoveCheck {
  if (!activeId || !overId) return { ok: false, reason: 'Drop on a row.' };
  const [placementPart, targetId] = overId.split(':');
  const placement = placementPart as DropPlacement;
  if (!targetId || !['before', 'inside', 'after'].includes(placement)) {
    return { ok: false, reason: 'Unknown drop target.' };
  }
  const source = items.find((item) => item.key === activeId);
  const target = items.find((item) => item.key === targetId);
  if (!source || !target) return { ok: false, reason: 'Row no longer exists.' };

  const sourceStart =
    source.kind === 'question' || source.kind === 'orphan' ? source.rowIndex : source.startIndex;
  const sourceEnd =
    source.kind === 'question' || source.kind === 'orphan' ? source.rowIndex : source.endIndex;
  if (sourceEnd < 0) {
    return { ok: false, reason: 'An unclosed group cannot be moved (XLS-003).' };
  }
  if (target.startIndex >= sourceStart && target.startIndex <= sourceEnd) {
    return { ok: false, reason: 'A block cannot move into itself.' };
  }
  if (placement === 'inside' && target.kind !== 'group' && target.kind !== 'repeat') {
    return { ok: false, reason: 'Only a group can contain another block.' };
  }
  if (placement === 'inside' && target.missingEnd) {
    return { ok: false, reason: 'Cannot drop into an unclosed group (XLS-003).' };
  }

  let targetIndex: number;
  if (placement === 'before') targetIndex = target.startIndex;
  else if (placement === 'after') {
    targetIndex = target.endIndex >= 0 ? target.endIndex + 1 : target.rowIndex + 1;
  } else {
    targetIndex = target.startIndex + 1;
  }

  const isNoop = targetIndex > sourceStart && targetIndex <= sourceEnd + 1;
  if (isNoop) return { ok: false, reason: 'The block is already there.' };

  return {
    ok: true,
    plan: {
      activeId,
      sourceStart,
      sourceEnd,
      targetIndex,
    },
  };
}

export function applyOutlineMove(plan: MovePlan): void {
  useWorkbookStore
    .getState()
    .apply(
      'Move outline block',
      (data) => moveBlock(data, 'survey', plan.sourceStart, plan.sourceEnd, plan.targetIndex),
      { sheet: 'survey', rowIds: [plan.activeId] },
    );
  useUiStore.getState().requestReveal('survey', plan.activeId);
}

export function useOutlineDnd(items: readonly OutlineItem[]) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; valid: boolean } | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const overId = event.over ? String(event.over.id) : null;
      if (!overId) {
        setOver(null);
        return;
      }
      const check = planOutlineMove(items, String(event.active.id), overId);
      setOver({ id: overId, valid: check.ok });
    },
    [items],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const overId = event.over ? String(event.over.id) : null;
      setActiveId(null);
      setOver(null);
      const check = planOutlineMove(items, String(event.active.id), overId);
      if (!check.ok || !check.plan) return;
      applyOutlineMove(check.plan);
    },
    [items],
  );

  return useMemo(
    () => ({
      sensors,
      collisionDetection: pointerWithin,
      activeId,
      over,
      handleDragStart,
      handleDragOver,
      handleDragEnd,
      handleDragCancel: () => {
        setActiveId(null);
        setOver(null);
      },
    }),
    [activeId, handleDragEnd, handleDragOver, handleDragStart, over, sensors],
  );
}
