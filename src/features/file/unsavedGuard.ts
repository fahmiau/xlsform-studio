/** Modal guard for unsaved changes (Task 1.10). */
import { create } from 'zustand';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

interface UnsavedState {
  open: boolean;
  pending: ((choice: UnsavedChoice) => void) | null;
  request: () => Promise<UnsavedChoice>;
  answer: (choice: UnsavedChoice) => void;
}

export const useUnsavedGuard = create<UnsavedState>()((set, get) => ({
  open: false,
  pending: null,
  request: () =>
    new Promise<UnsavedChoice>((resolve) => {
      get().pending?.('cancel');
      set({ open: true, pending: resolve });
    }),
  answer: (choice) => {
    const pending = get().pending;
    set({ open: false, pending: null });
    pending?.(choice);
  },
}));

/** Ask the user; resolves `discard` when the app is clean. */
export async function requestUnsavedChoice(): Promise<UnsavedChoice> {
  return useUnsavedGuard.getState().request();
}
