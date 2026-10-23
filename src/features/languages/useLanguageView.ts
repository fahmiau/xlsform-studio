/**
 * Language view state helpers (Task 5.4). The view lives in `uiStore` so
 * switching is instant and never touches the document; the chosen view is
 * remembered per file path in `prefsStore`.
 */
import { useEffect } from 'react';

import type { LanguageViewState } from '@/core/languages/viewModes';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

export const ALL_LANGUAGES_VIEW: LanguageViewState = {
  mode: 'all',
  language: null,
  source: null,
  target: null,
};

/** Prefs key for a workbook: its path, or `''` for an untitled document. */
export function fileKey(filePath: string | null | undefined): string {
  return filePath ?? '';
}

/** Restore the per-file view once prefs are hydrated (and on file changes). */
export function useLanguageViewBootstrap(): void {
  const filePath = useWorkbookStore((state) => state.filePath);
  const hydrated = usePrefsStore((state) => state.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    const saved = usePrefsStore.getState().languageViews[fileKey(filePath)];
    useUiStore.getState().setLanguageViewState(saved ?? ALL_LANGUAGES_VIEW);
  }, [filePath, hydrated]);
}

/** Switch views for the active file and remember the choice. */
export function updateLanguageView(next: LanguageViewState): void {
  useUiStore.getState().setLanguageViewState(next);
  usePrefsStore.getState().setLanguageViewFor(fileKey(useWorkbookStore.getState().filePath), next);
}
