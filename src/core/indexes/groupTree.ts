/**
 * Group/repeat tree for folding and the Outline panel (Task 1.7).
 * Never throws: unbalanced and mismatched tags are reported, not fatal.
 */
import { resolveColumn } from '../model/columns';
import { parseType } from '../model/parseType';
import type { RowId, SheetData } from '../model/types';
import type { VariableOptions } from './variables';

export interface QuestionNode {
  id: RowId;
  name: string;
  type: string;
  rowIndex: number;
}

export interface GroupNode {
  id: RowId;
  name: string;
  label: string;
  groupType: 'group' | 'repeat';
  startRowIndex: number;
  /** -1 when the group is never closed. */
  endRowIndex: number;
  depth: number;
  /** UI fold state lives in `uiStore`; always false in the derived index. */
  collapsed: boolean;
  children: Array<GroupNode | QuestionNode>;
}

export interface GroupTreeIndex {
  roots: GroupNode[];
  /** All groups in document order. */
  groups: GroupNode[];
  depthByRowIndex: Int16Array;
  matchingEnd: Map<RowId, RowId>;
  /** `end_*` rows without a matching open group. */
  orphans: RowId[];
}

interface OpenGroup {
  node: GroupNode;
  beginRowId: RowId;
}

function primaryLabelKey(sheet: SheetData, options: VariableOptions): string | undefined {
  const labelColumns = sheet.columns.filter((column) => resolveColumn(column).base === 'label');
  if (labelColumns.length === 0) return undefined;
  const preferred = options.defaultLanguage?.trim().toLowerCase();
  if (preferred) {
    const localized = labelColumns.find((column) => {
      const language = resolveColumn(column).language;
      return (
        language !== undefined &&
        (language.code?.toLowerCase() === preferred || language.name.toLowerCase() === preferred)
      );
    });
    if (localized) return localized;
  }
  return labelColumns.find((column) => !resolveColumn(column).language) ?? labelColumns[0];
}

export function buildGroupTree(sheet: SheetData, options: VariableOptions = {}): GroupTreeIndex {
  const depthByRowIndex = new Int16Array(sheet.rows.length);
  const matchingEnd = new Map<RowId, RowId>();
  const orphans: RowId[] = [];
  const roots: GroupNode[] = [];
  const groups: GroupNode[] = [];
  const stack: OpenGroup[] = [];
  const labelKey = primaryLabelKey(sheet, options);

  sheet.rows.forEach((row, rowIndex) => {
    const type = parseType(row.cells.type ?? '');
    const base = type.base;
    const depth = stack.length;
    depthByRowIndex[rowIndex] = depth;

    if (base === 'begin_group' || base === 'begin_repeat') {
      const node: GroupNode = {
        id: row.id,
        name: (row.cells.name ?? '').trim(),
        label: labelKey ? (row.cells[labelKey] ?? '') : '',
        groupType: base === 'begin_repeat' ? 'repeat' : 'group',
        startRowIndex: rowIndex,
        endRowIndex: -1,
        depth,
        collapsed: false,
        children: [],
      };
      const parent = stack[stack.length - 1];
      if (parent) parent.node.children.push(node);
      else roots.push(node);
      groups.push(node);
      stack.push({ node, beginRowId: row.id });
      return;
    }

    if (base === 'end_group' || base === 'end_repeat') {
      const expected = base === 'end_repeat' ? 'repeat' : 'group';
      const top = stack[stack.length - 1];
      if (top && top.node.groupType === expected) {
        stack.pop();
        top.node.endRowIndex = rowIndex;
        matchingEnd.set(top.beginRowId, row.id);
        depthByRowIndex[rowIndex] = stack.length;
      } else {
        orphans.push(row.id);
        depthByRowIndex[rowIndex] = Math.max(0, stack.length - 1);
      }
      return;
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.node.children.push({
        id: row.id,
        name: (row.cells.name ?? '').trim(),
        type: base,
        rowIndex,
      });
    }
  });

  return { roots, groups, depthByRowIndex, matchingEnd, orphans };
}
