/**
 * One capture-phase keyboard listener (R3, Task 1.10). Shortcuts are matched on
 * `event.code` so non-QWERTY layouts keep working, and WebView accelerators are
 * swallowed even when no command owns them.
 */
import {
  findCommandForEvent,
  isEditableTarget,
  matchesShortcut,
  type ShortcutSpec,
} from './commands';

/** Accelerators WebView2/WebKit handle themselves; the app owns them. */
export const RESERVED_ACCELERATORS: readonly ShortcutSpec[] = [
  { code: 'KeyR', ctrlOrMeta: true },
  { code: 'KeyR', ctrlOrMeta: true, shift: true },
  { code: 'F5' },
  { code: 'KeyP', ctrlOrMeta: true },
  { code: 'KeyJ', ctrlOrMeta: true },
  { code: 'KeyG', ctrlOrMeta: true, shift: true },
  { code: 'KeyG', ctrlOrMeta: true },
  { code: 'KeyF', ctrlOrMeta: true },
];

export function isReservedAccelerator(event: KeyboardEvent): boolean {
  return RESERVED_ACCELERATORS.some((spec) => matchesShortcut(event, spec));
}

export interface ShortcutHandleOptions {
  /** Defaults to `window`. */
  target?: Window;
}

/**
 * Installs the listener and returns a disposer. Call once from the app shell.
 */
export function installShortcuts(options: ShortcutHandleOptions = {}): () => void {
  const target = options.target ?? window;

  const onKeyDown = (event: KeyboardEvent) => {
    const command = findCommandForEvent(event);
    if (command) {
      if (isEditableTarget(event.target) && !command.allowInInput) return;
      event.preventDefault();
      event.stopPropagation();
      void command.run();
      return;
    }
    if (isReservedAccelerator(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  target.addEventListener('keydown', onKeyDown, { capture: true });
  return () => target.removeEventListener('keydown', onKeyDown, { capture: true });
}
