/**
 * Build Mode tools exposed to the model (Task 6.7). Schemas live in core; the
 * handlers apply them to the staging draft only (AD-11).
 */
import { applyToolCall } from '@/core/ai/applyTools';
import { TOOL_DESCRIPTIONS, TOOL_SCHEMAS, type ToolName } from '@/core/ai/tools';
import type { ToolResult } from '@/core/ai/applyTools';
import { useStagingStore } from '@/state/stagingStore';

import {
  ASK_QUESTION_DESCRIPTION,
  askQuestionInputSchema,
  type AskQuestionHandler,
} from './aiQuestion';
import { tool, type ToolSet } from './client';

export interface ToolTranscriptEntry {
  name: ToolName;
  ok: boolean;
  summary: string;
  errors: string[];
}

export type ToolListener = (entry: ToolTranscriptEntry) => void;

export interface BuildToolsOptions {
  onAskQuestion?: AskQuestionHandler;
}

function runTool(name: ToolName, input: unknown, onEntry: ToolListener): ToolResult {
  const staging = useStagingStore.getState();
  if (!staging.draft) {
    const result: ToolResult = {
      ok: false,
      summary: 'no active Build Mode draft',
      errors: ['start Build Mode before calling tools'],
    };
    onEntry({ name, ...result });
    return result;
  }
  const result = staging.applyTool(name, input);
  onEntry({ name, ...result });
  return result;
}

export function buildTools(
  onEntry: ToolListener = () => undefined,
  options?: BuildToolsOptions,
): ToolSet {
  return {
    insert_survey_rows: tool({
      description: TOOL_DESCRIPTIONS.insert_survey_rows,
      inputSchema: TOOL_SCHEMAS.insert_survey_rows,
      execute: async (input) => runTool('insert_survey_rows', input, onEntry),
    }),
    update_survey_cells: tool({
      description: TOOL_DESCRIPTIONS.update_survey_cells,
      inputSchema: TOOL_SCHEMAS.update_survey_cells,
      execute: async (input) => runTool('update_survey_cells', input, onEntry),
    }),
    upsert_choice_list: tool({
      description: TOOL_DESCRIPTIONS.upsert_choice_list,
      inputSchema: TOOL_SCHEMAS.upsert_choice_list,
      execute: async (input) => runTool('upsert_choice_list', input, onEntry),
    }),
    delete_survey_rows: tool({
      description: TOOL_DESCRIPTIONS.delete_survey_rows,
      inputSchema: TOOL_SCHEMAS.delete_survey_rows,
      execute: async (input) => runTool('delete_survey_rows', input, onEntry),
    }),
    ...(options?.onAskQuestion
      ? {
          ask_question: tool({
            description: ASK_QUESTION_DESCRIPTION,
            inputSchema: askQuestionInputSchema,
            execute: async (input, execOptions) =>
              options.onAskQuestion!(input, execOptions?.abortSignal),
          }),
        }
      : {}),
  };
}

/** Pure helper used by tests: apply one call without the SDK. */
export function applyStagedTool(name: ToolName, input: unknown): ToolResult {
  return runTool(name, input, () => undefined);
}

export { applyToolCall };
