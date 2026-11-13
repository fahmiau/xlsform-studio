/**
 * Live AI process tracking from AI SDK `fullStream` events (Chat & Build Mode).
 */

export type ProcessStepKind = 'thinking' | 'tool' | 'writing';
export type ProcessStepStatus = 'running' | 'done' | 'error' | 'stopped';

export interface ProcessStep {
  id: string;
  kind: ProcessStepKind;
  label: string;
  status: ProcessStepStatus;
  toolName?: string;
  detail?: string;
  errors?: string[];
}

export interface AiProcessState {
  running: boolean;
  activeLabel: string | null;
  steps: ProcessStep[];
}

export type StreamProcessPart =
  | { type: 'start' | 'start-step' | 'reasoning-start' | 'reasoning-delta' }
  | { type: 'tool-input-start'; id: string; toolName: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output?: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error?: unknown }
  | { type: 'text-delta'; text: string }
  | { type: 'finish' | 'abort' }
  | { type: 'error'; error: unknown }
  | { type: string };

const TOOL_LABELS: Record<string, string> = {
  insert_survey_rows: 'Inserting survey rows',
  update_survey_cells: 'Updating survey cells',
  upsert_choice_list: 'Updating choice list',
  delete_survey_rows: 'Deleting survey rows',
  ask_question: 'Waiting for your answer',
};

export function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Running ${toolName}`;
}

export function createInitialProcessState(): AiProcessState {
  return {
    running: true,
    activeLabel: 'Thinking…',
    steps: [{ id: 'think-0', kind: 'thinking', label: 'Thinking', status: 'running' }],
  };
}

export function finalizeProcessState(
  state: AiProcessState,
  outcome: 'done' | 'stopped' | 'error',
): AiProcessState {
  return {
    running: false,
    activeLabel: null,
    steps: state.steps.map((step) =>
      step.status === 'running' ? { ...step, status: outcome } : step,
    ),
  };
}

function finishRunningKinds(steps: ProcessStep[], kinds: ProcessStepKind[]): ProcessStep[] {
  return steps.map((step) =>
    step.status === 'running' && kinds.includes(step.kind) ? { ...step, status: 'done' } : step,
  );
}

function findToolStepIndex(steps: ProcessStep[], toolCallId: string, toolName: string): number {
  const byId = steps.findIndex((step) => step.id === toolCallId);
  if (byId >= 0) return byId;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step?.kind === 'tool' && step.toolName === toolName && step.status === 'running') {
      return i;
    }
  }
  return -1;
}

function parseToolOutput(output: unknown): {
  ok: boolean;
  detail?: string;
  errors?: string[];
} {
  if (!output || typeof output !== 'object') return { ok: true };
  const record = output as Record<string, unknown>;
  const ok = typeof record.ok === 'boolean' ? record.ok : true;
  const detail = typeof record.summary === 'string' && record.summary ? record.summary : undefined;
  const errors = Array.isArray(record.errors)
    ? record.errors.filter((item): item is string => typeof item === 'string')
    : undefined;
  return {
    ok,
    ...(detail !== undefined ? { detail } : {}),
    ...(errors && errors.length > 0 ? { errors } : {}),
  };
}

function nextActiveLabelAfterTool(steps: ProcessStep[]): string {
  const runningTool = [...steps].reverse().find((s) => s.kind === 'tool' && s.status === 'running');
  return runningTool ? `${runningTool.label}…` : 'Thinking…';
}

function ensureThinkingStep(state: AiProcessState): AiProcessState {
  const last = state.steps[state.steps.length - 1];
  if (last?.kind === 'thinking' && last.status === 'running') {
    return { ...state, running: true, activeLabel: 'Thinking…' };
  }
  const steps = finishRunningKinds(state.steps, ['thinking', 'writing']);
  steps.push({
    id: `think-${steps.length}`,
    kind: 'thinking',
    label: 'Thinking',
    status: 'running',
  });
  return { running: true, activeLabel: 'Thinking…', steps };
}

export function applyStreamPart(
  state: AiProcessState,
  part: StreamProcessPart,
): { process: AiProcessState; textDelta: string } {
  switch (part.type) {
    case 'start':
    case 'start-step':
    case 'reasoning-start':
    case 'reasoning-delta':
      return { process: ensureThinkingStep(state), textDelta: '' };

    case 'tool-input-start': {
      const { id, toolName } = part as Extract<StreamProcessPart, { type: 'tool-input-start' }>;
      const label = formatToolLabel(toolName);
      const steps = finishRunningKinds(state.steps, ['thinking', 'writing']);
      if (!steps.some((step) => step.id === id)) {
        steps.push({ id, kind: 'tool', toolName, label, status: 'running' });
      }
      return {
        process: { running: true, activeLabel: `${label}…`, steps },
        textDelta: '',
      };
    }

    case 'tool-call': {
      const { toolCallId, toolName } = part as Extract<StreamProcessPart, { type: 'tool-call' }>;
      const label = formatToolLabel(toolName);
      const steps = finishRunningKinds(state.steps, ['thinking', 'writing']);
      if (findToolStepIndex(steps, toolCallId, toolName) < 0) {
        steps.push({ id: toolCallId, kind: 'tool', toolName, label, status: 'running' });
      }
      return {
        process: { running: true, activeLabel: `${label}…`, steps },
        textDelta: '',
      };
    }

    case 'tool-result': {
      const { toolCallId, toolName, output } = part as Extract<
        StreamProcessPart,
        { type: 'tool-result' }
      >;
      const parsed = parseToolOutput(output);
      const steps = [...state.steps];
      const index = findToolStepIndex(steps, toolCallId, toolName);
      const updatedStep: ProcessStep = {
        id: toolCallId,
        kind: 'tool',
        toolName,
        label: formatToolLabel(toolName),
        status: parsed.ok ? 'done' : 'error',
        ...(parsed.detail !== undefined ? { detail: parsed.detail } : {}),
        ...(parsed.errors !== undefined ? { errors: parsed.errors } : {}),
      };
      if (index >= 0) {
        steps[index] = { ...steps[index], ...updatedStep, id: steps[index]!.id };
      } else {
        steps.push(updatedStep);
      }
      return {
        process: { running: true, activeLabel: nextActiveLabelAfterTool(steps), steps },
        textDelta: '',
      };
    }

    case 'tool-error': {
      const { toolCallId, toolName, error } = part as Extract<
        StreamProcessPart,
        { type: 'tool-error' }
      >;
      const message = error instanceof Error ? error.message : String(error ?? 'Tool call failed');
      const steps = [...state.steps];
      const index = findToolStepIndex(steps, toolCallId, toolName);
      const updatedStep: ProcessStep = {
        id: toolCallId,
        kind: 'tool',
        toolName,
        label: formatToolLabel(toolName),
        status: 'error',
        errors: [message],
      };
      if (index >= 0) {
        steps[index] = { ...steps[index], ...updatedStep, id: steps[index]!.id };
      } else {
        steps.push(updatedStep);
      }
      return {
        process: { running: true, activeLabel: nextActiveLabelAfterTool(steps), steps },
        textDelta: '',
      };
    }

    case 'text-delta': {
      const { text } = part as Extract<StreamProcessPart, { type: 'text-delta' }>;
      if (!text) return { process: state, textDelta: '' };
      const steps = finishRunningKinds(state.steps, ['thinking']);
      const last = steps[steps.length - 1];
      if (!(last?.kind === 'writing' && last.status === 'running')) {
        steps.push({
          id: `write-${steps.length}`,
          kind: 'writing',
          label: 'Writing response',
          status: 'running',
        });
      }
      return {
        process: { running: true, activeLabel: 'Writing response…', steps },
        textDelta: text,
      };
    }

    case 'finish':
      return { process: finalizeProcessState(state, 'done'), textDelta: '' };

    case 'abort':
      return { process: finalizeProcessState(state, 'stopped'), textDelta: '' };

    case 'error':
      return { process: finalizeProcessState(state, 'error'), textDelta: '' };

    default:
      return { process: state, textDelta: '' };
  }
}

export async function consumeAiStream(
  fullStream: AsyncIterable<StreamProcessPart>,
  onUpdate: (delta: string, process: AiProcessState) => void,
  initial: AiProcessState = createInitialProcessState(),
): Promise<AiProcessState> {
  let process = initial;
  for await (const part of fullStream) {
    if (part.type === 'error') {
      const errorPart = part as Extract<StreamProcessPart, { type: 'error' }>;
      process = finalizeProcessState(process, 'error');
      onUpdate('', process);
      throw errorPart.error;
    }
    const next = applyStreamPart(process, part);
    if (next.process !== process || next.textDelta) {
      process = next.process;
      onUpdate(next.textDelta, process);
    }
  }
  return process.running ? finalizeProcessState(process, 'done') : process;
}
