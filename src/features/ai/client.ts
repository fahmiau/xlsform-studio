/**
 * The single wrapper over the AI SDK stream/tool APIs (Task 6.3).
 * An SDK major upgrade should only touch this file.
 */
import {
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UserContent,
} from 'ai';

export { stepCountIs, tool };
export type { LanguageModel, ModelMessage, ToolSet, UserContent };

export interface ChatStreamOptions {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  signal?: AbortSignal;
  temperature?: number;
}

/** Chat Mode parameters. Deliberately has no `tools` key (Task 6.5). */
export function chatStreamParams(options: ChatStreamOptions) {
  return {
    model: options.model,
    system: options.system,
    messages: options.messages,
    abortSignal: options.signal,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  };
}

export function streamChat(options: ChatStreamOptions) {
  return streamText(chatStreamParams(options));
}

export interface BuildStreamOptions extends ChatStreamOptions {
  tools: ToolSet;
  /** Step cap for the tool loop (Task 6.7). */
  maxSteps?: number;
}

export function buildStreamParams(options: BuildStreamOptions) {
  return {
    ...chatStreamParams(options),
    tools: options.tools,
    stopWhen: stepCountIs(options.maxSteps ?? 8),
  };
}

export function streamBuild(options: BuildStreamOptions) {
  return streamText(buildStreamParams(options));
}
