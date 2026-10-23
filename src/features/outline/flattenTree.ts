/**
 * Flattens the survey into outline rows (Task 3.9). Pure so search, keyboard
 * navigation, and drag-and-drop all work on the same ordered model.
 */
import type { GroupTreeIndex } from '@/core/indexes/groupTree';
import { labelColumnFor } from '@/core/languages/discover';
import { resolveColumn } from '@/core/model/columns';
import { parseType } from '@/core/model/parseType';
import type { RowId, SheetData } from '@/core/model/types';

export type OutlineKind = 'group' | 'repeat' | 'question' | 'orphan';

export interface OutlineItem {
  key: string;
  rowId: RowId;
  kind: OutlineKind;
  depth: number;
  name: string;
  label: string;
  type: string;
  rowIndex: number;
  startIndex: number;
  /** -1 for questions and unclosed groups. */
  endIndex: number;
  collapsed: boolean;
  missingEnd: boolean;
}

export interface FlattenOptions {
  collapsed?: ReadonlySet<RowId>;
  filter?: string;
}

function primaryLabelKey(sheet: SheetData): string | undefined {
  return labelColumnFor(sheet);
}

function ancestorsOf(items: readonly OutlineItem[], item: OutlineItem): OutlineItem[] {
  const ancestors: OutlineItem[] = [];
  for (const candidate of items) {
    if (candidate.rowIndex >= item.rowIndex) break;
    if (candidate.kind !== 'group' && candidate.kind !== 'repeat') continue;
    const end = candidate.endIndex < 0 ? Number.POSITIVE_INFINITY : candidate.endIndex;
    if (item.rowIndex >= candidate.startIndex && item.rowIndex <= end) ancestors.push(candidate);
  }
  return ancestors;
}

export function flattenOutline(
  sheet: SheetData,
  groups: GroupTreeIndex,
  options: FlattenOptions = {},
): OutlineItem[] {
  const typeKey = sheet.columns.find((column) => resolveColumn(column).base === 'type') ?? 'type';
  const nameKey = sheet.columns.find((column) => resolveColumn(column).base === 'name') ?? 'name';
  const labelKey = primaryLabelKey(sheet);
  const groupByRowId = new Map(groups.groups.map((group) => [group.id, group]));
  const orphanSet = new Set(groups.orphans);
  const items: OutlineItem[] = [];

  sheet.rows.forEach((row, rowIndex) => {
    const rawType = row.cells[typeKey] ?? '';
    const parsed = parseType(rawType);
    const group = groupByRowId.get(row.id);
    const name = (row.cells[nameKey] ?? '').trim();
    const label = labelKey ? (row.cells[labelKey] ?? '').trim() : '';

    if (group) {
      items.push({
        key: row.id,
        rowId: row.id,
        kind: group.groupType,
        depth: group.depth,
        name: group.name || name,
        label,
        type: rawType,
        rowIndex,
        startIndex: group.startRowIndex,
        endIndex: group.endRowIndex,
        collapsed: options.collapsed?.has(row.id) ?? false,
        missingEnd: group.endRowIndex < 0,
      });
      return;
    }

    if (orphanSet.has(row.id)) {
      items.push({
        key: row.id,
        rowId: row.id,
        kind: 'orphan',
        depth: 0,
        name,
        label,
        type: rawType,
        rowIndex,
        startIndex: rowIndex,
        endIndex: rowIndex,
        collapsed: false,
        missingEnd: true,
      });
      return;
    }

    if (parsed.base === 'end_group' || parsed.base === 'end_repeat') return;

    items.push({
      key: row.id,
      rowId: row.id,
      kind: 'question',
      depth: groups.depthByRowIndex[rowIndex] ?? 0,
      name,
      label,
      type: parsed.base,
      rowIndex,
      startIndex: rowIndex,
      endIndex: rowIndex,
      collapsed: false,
      missingEnd: false,
    });
  });

  const filter = options.filter?.trim().toLowerCase();
  const visibleItems =
    options.collapsed && options.collapsed.size > 0 && !filter
      ? items.filter((item) => {
          for (const group of items) {
            if (group.kind !== 'group' && group.kind !== 'repeat') continue;
            if (!options.collapsed?.has(group.rowId)) continue;
            const end = group.endIndex < 0 ? Number.POSITIVE_INFINITY : group.endIndex;
            if (item.rowIndex > group.startIndex && item.rowIndex <= end) return false;
          }
          return true;
        })
      : items;

  if (!filter) return visibleItems;

  const matches = new Set<OutlineItem>();
  for (const item of visibleItems) {
    if (
      item.name.toLowerCase().includes(filter) ||
      item.label.toLowerCase().includes(filter) ||
      item.type.toLowerCase().includes(filter)
    ) {
      matches.add(item);
    }
  }
  if (matches.size === 0) return [];

  const visible = new Set<OutlineItem>(matches);
  for (const item of matches) {
    if (item.kind === 'group' || item.kind === 'repeat') {
      for (const candidate of visibleItems) {
        const end = item.endIndex < 0 ? Number.POSITIVE_INFINITY : item.endIndex;
        if (candidate.rowIndex > item.startIndex && candidate.rowIndex <= end) {
          visible.add(candidate);
        }
      }
    } else {
      for (const ancestor of ancestorsOf(visibleItems, item)) visible.add(ancestor);
    }
  }

  return visibleItems.filter((item) => visible.has(item));
}
