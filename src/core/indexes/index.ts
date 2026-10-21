/**
 * Composed indexes recomputed whenever document data changes (Task 1.7 /
 * AD-3). Pure and cheap enough for the main thread on the reference form.
 */
import type { WorkbookData } from '../model/types';
import { buildChoicesByList, type ChoicesIndex } from './choices';
import { buildGroupTree, type GroupTreeIndex } from './groupTree';
import { buildRowIndex } from './rowIndex';
import { buildVariableMap, type VariableMap, type VariableOptions } from './variables';

export interface AllIndexes {
  variables: VariableMap;
  choices: ChoicesIndex;
  groups: GroupTreeIndex;
  rowIndexes: {
    survey: Map<string, number>;
    choices: Map<string, number>;
    settings: Map<string, number>;
  };
}

export function buildAllIndexes(data: WorkbookData, options: VariableOptions = {}): AllIndexes {
  return {
    variables: buildVariableMap(data.survey, options),
    choices: buildChoicesByList(data.choices, data.survey),
    groups: buildGroupTree(data.survey, options),
    rowIndexes: {
      survey: buildRowIndex(data.survey),
      choices: buildRowIndex(data.choices),
      settings: buildRowIndex(data.settings),
    },
  };
}

export { buildChoicesByList, buildGroupTree, buildRowIndex, buildVariableMap };
export type { GroupNode, GroupTreeIndex, QuestionNode } from './groupTree';
export type { ChoicesIndex } from './choices';
export type { VariableMap, VariableMetadata } from './variables';
