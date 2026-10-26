/**
 * Build Mode tool schemas (Task 6.6, PRD §4.7).
 *
 * These mirror the PRD JSON shapes exactly. The AI SDK wraps them with
 * `tool()` in the feature layer; validation and application live here so they
 * stay pure and testable (AD-1).
 */
import { z } from 'zod';

export const labelMapSchema = z.record(z.string(), z.string());

export const insertSurveyRowSchema = z.object({
  type: z.string().min(1),
  name: z.string().optional(),
  label: labelMapSchema.optional(),
  hint: labelMapSchema.optional(),
  relevant: z.string().optional(),
  constraint: z.string().optional(),
  constraint_message: labelMapSchema.optional(),
  calculation: z.string().optional(),
  required: z.string().optional(),
  appearance: z.string().optional(),
  choice_filter: z.string().optional(),
});

export const insertSurveyRowsSchema = z.object({
  afterRowIndex: z.number().int().min(-1),
  rows: z.array(insertSurveyRowSchema).min(1),
});

export const updateSurveyCellsSchema = z.object({
  updates: z
    .array(
      z.object({
        targetName: z.string().min(1),
        changes: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
});

export const upsertChoiceListSchema = z.object({
  list_name: z.string().min(1),
  choices: z
    .array(
      z.object({
        name: z.string().optional(),
        label: labelMapSchema.optional(),
        filters: z.record(z.string(), z.string()).optional(),
      }),
    )
    .min(1),
  mode: z.enum(['replace', 'append']),
});

export const deleteSurveyRowsSchema = z.object({
  targetNames: z.array(z.string().min(1)).min(1),
});

export const TOOL_SCHEMAS = {
  insert_survey_rows: insertSurveyRowsSchema,
  update_survey_cells: updateSurveyCellsSchema,
  upsert_choice_list: upsertChoiceListSchema,
  delete_survey_rows: deleteSurveyRowsSchema,
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

export type ToolInput<T extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[T]>;

export type ToolCall = {
  [K in ToolName]: { name: K; input: ToolInput<K> };
}[ToolName];

export interface ParsedToolInput {
  ok: boolean;
  input?: unknown;
  errors: string[];
}

/** Validate model output against a build tool; never throws. */
export function parseToolInput(name: ToolName, input: unknown): ParsedToolInput {
  const result = TOOL_SCHEMAS[name].safeParse(input);
  if (result.success) return { ok: true, input: result.data, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`,
    ),
  };
}

/** Descriptions passed to the model. Keep them aligned with the PRD. */
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  insert_survey_rows:
    'Insert one or more XLSForm survey rows (including begin_group/end_group blocks) at a specific row index.',
  update_survey_cells:
    'Batch-update specific cells on existing survey rows by variable name or row ID.',
  upsert_choice_list:
    'Create or update a choice list in the choices sheet with auto-bound list_name.',
  delete_survey_rows: 'Delete survey rows by variable name or row ID.',
};
