/**
 * Shared interactive question / choice schemas, parser, and helpers for
 * Chat Mode (`xlsform-choices` blocks) and Build Mode (`ask_question` tool).
 */
import { z } from 'zod';

export const questionItemSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  multiSelect: z.boolean().optional(),
});

export const askQuestionInputSchema = z.object({
  questions: z.array(questionItemSchema).min(1).max(4),
});

export type QuestionItem = z.infer<typeof questionItemSchema>;
export type AskQuestionInput = z.infer<typeof askQuestionInputSchema>;

export interface AiQuestionAnswer {
  question: string;
  selected: string[];
}

export interface AiQuestionState {
  id: string;
  questions: QuestionItem[];
  status: 'pending' | 'answered' | 'skipped' | 'cancelled';
  answers?: AiQuestionAnswer[];
}

export interface AskQuestionToolResult {
  ok: boolean;
  summary: string;
  skipped: boolean;
  answers: AiQuestionAnswer[];
}

export type AskQuestionHandler = (
  input: AskQuestionInput,
  signal?: AbortSignal,
) => Promise<AskQuestionToolResult>;

export const ASK_QUESTION_DESCRIPTION =
  'Ask the user 1 to 4 concise clarifying questions with 2 to 8 selectable options before continuing.';

const singleQuestionShorthandSchema = questionItemSchema;

export function parseQuestionBlock(raw: string): QuestionItem[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const full = askQuestionInputSchema.safeParse(parsed);
    if (full.success) return full.data.questions;
    const single = singleQuestionShorthandSchema.safeParse(parsed);
    if (single.success) return [single.data];
    return null;
  } catch {
    return null;
  }
}

export interface SplitQuestionResult {
  text: string;
  questions: QuestionItem[];
  streamingIncomplete: boolean;
}

const COMPLETE_BLOCK_RE = /```xlsform-choices\s*\r?\n([\s\S]*?)```/g;
const INCOMPLETE_BLOCK_RE = /```xlsform-choices(?:\s*\r?\n[\s\S]*)?$/;

export function splitQuestionBlocks(content: string, streaming = false): SplitQuestionResult {
  const questions: QuestionItem[] = [];
  let text = content.replace(COMPLETE_BLOCK_RE, (match, body: string) => {
    const parsed = parseQuestionBlock(body.trim());
    if (!parsed) return match;
    questions.push(...parsed);
    return '';
  });

  let streamingIncomplete = false;
  if (streaming) {
    const incomplete = INCOMPLETE_BLOCK_RE.exec(text);
    if (incomplete) {
      streamingIncomplete = true;
      text = text.slice(0, incomplete.index);
    }
  }

  return {
    text: text.trim(),
    questions,
    streamingIncomplete,
  };
}

export function formatAnswersAsMessage(answers: AiQuestionAnswer[]): string {
  if (answers.length === 1) {
    const [only] = answers;
    if (only) {
      return `${only.question}: ${only.selected.join(', ')}`;
    }
  }
  return answers.map((item) => `- ${item.question}: ${item.selected.join(', ')}`).join('\n');
}
