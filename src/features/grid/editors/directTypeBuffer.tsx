/**
 * Buffers fast direct-typing keystrokes while Glide's lazy-loaded overlay
 * editor mounts and takes DOM focus (prevents dropped leading characters).
 */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

export type DirectTypeAction = 'enter' | 'tab' | 'shift-tab' | 'escape';

export interface DirectTypeSnapshot {
  cell: readonly [number, number];
  text: string;
  trailingAction?: DirectTypeAction;
}

export interface DirectTypeKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface DirectTypeController {
  start: (cell: readonly [number, number], char: string) => void;
  pushKey: (event: DirectTypeKeyEvent) => boolean;
  isActive: () => boolean;
  isActiveFor: (cell: readonly [number, number]) => boolean;
  peekText: (fallback: string) => string;
  consume: () => DirectTypeSnapshot | null;
  clear: () => void;
}

export function createDirectTypeController(): DirectTypeController {
  let state: {
    cell: [number, number];
    text: string;
    trailingAction?: DirectTypeAction;
  } | null = null;

  return {
    start(cell, char) {
      state = { cell: [cell[0], cell[1]], text: char };
    },
    pushKey(event) {
      if (!state) return false;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        state = null;
        return false;
      }
      if (event.key === 'Escape') {
        state.trailingAction = 'escape';
        return true;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        state.trailingAction = 'enter';
        return true;
      }
      if (event.key === 'Tab') {
        state.trailingAction = event.shiftKey ? 'shift-tab' : 'tab';
        return true;
      }
      if (event.key === 'Backspace') {
        if (!state.trailingAction) state.text = state.text.slice(0, -1);
        return true;
      }
      if (event.key.length === 1) {
        if (!state.trailingAction) state.text += event.key;
        return true;
      }
      return true;
    },
    isActive() {
      return state !== null;
    },
    isActiveFor(cell) {
      return state !== null && state.cell[0] === cell[0] && state.cell[1] === cell[1];
    },
    peekText(fallback) {
      return state ? state.text : fallback;
    },
    consume() {
      if (!state) return null;
      const snapshot: DirectTypeSnapshot = {
        cell: [state.cell[0], state.cell[1]],
        text: state.text,
        ...(state.trailingAction ? { trailingAction: state.trailingAction } : {}),
      };
      state = null;
      return snapshot;
    },
    clear() {
      state = null;
    },
  };
}

const DirectTypeContext = createContext<DirectTypeController | null>(null);

export function DirectTypeProvider({
  controller,
  children,
}: {
  controller: DirectTypeController;
  children: ReactNode;
}) {
  return <DirectTypeContext.Provider value={controller}>{children}</DirectTypeContext.Provider>;
}

export function useDirectTypeController(): DirectTypeController | null {
  return useContext(DirectTypeContext);
}

export function actionMovement(
  action: DirectTypeAction,
): readonly [-1 | 0 | 1, -1 | 0 | 1] | undefined {
  if (action === 'enter') return [0, 0];
  if (action === 'tab') return [1, 0];
  if (action === 'shift-tab') return [-1, 0];
  return undefined;
}

export function useDirectTypeInitialState(initialValue: string | undefined, fallback: string) {
  const directType = useDirectTypeController();
  return useState(() =>
    initialValue !== undefined ? (directType?.peekText(initialValue) ?? initialValue) : fallback,
  );
}

export function useFocusInputOnMount(
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  collapseToEnd: boolean,
  depsKey?: unknown,
): void {
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (collapseToEnd) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } else {
      el.select();
    }
  }, [collapseToEnd, depsKey, inputRef]);
}

export function useConsumeDirectType(
  onConsume: (pending: DirectTypeSnapshot | null) => void,
): void {
  const directType = useDirectTypeController();
  const consumed = useRef(false);
  const callbackRef = useRef(onConsume);
  useLayoutEffect(() => {
    callbackRef.current = onConsume;
  });
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    callbackRef.current(directType?.consume() ?? null);
  }, [directType]);
}
