/**
 * App command registry (PRD §6.2, Task 1.10). Shared by the keyboard shortcut
 * handler now and by the command palette in Stage 5.
 */

export interface ShortcutSpec {
  /** `KeyboardEvent.code`, e.g. `KeyS`, `F5`, `BracketLeft`. */
  code: string;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface AppCommand {
  id: string;
  title: string;
  shortcut?: ShortcutSpec;
  /** Runs the command. Errors are the caller's responsibility (toasts). */
  run: () => void | Promise<void>;
  /** Optional availability check; disabled commands do not run or match. */
  when?: () => boolean;
  /** Allow the shortcut while focus is in an input/textarea/contenteditable. */
  allowInInput?: boolean;
}

const registry = new Map<string, AppCommand>();

export function registerCommands(commands: readonly AppCommand[]): () => void {
  const ids = commands.map((command) => command.id);
  for (const command of commands) registry.set(command.id, command);
  return () => {
    for (const id of ids) registry.delete(id);
  };
}

export function listCommands(): AppCommand[] {
  return [...registry.values()];
}

export function getCommand(id: string): AppCommand | undefined {
  return registry.get(id);
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutSpec): boolean {
  if (event.code !== shortcut.code) return false;
  if ((event.ctrlKey || event.metaKey) !== Boolean(shortcut.ctrlOrMeta)) return false;
  if (event.shiftKey !== Boolean(shortcut.shift)) return false;
  if (event.altKey !== Boolean(shortcut.alt)) return false;
  return true;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

/** First registered command whose shortcut matches and whose `when` passes. */
export function findCommandForEvent(event: KeyboardEvent): AppCommand | undefined {
  for (const command of registry.values()) {
    if (!command.shortcut || !matchesShortcut(event, command.shortcut)) continue;
    if (command.when && !command.when()) continue;
    return command;
  }
  return undefined;
}

/** Test helper: clears the module-level registry. */
export function __clearCommandsForTests(): void {
  registry.clear();
}
