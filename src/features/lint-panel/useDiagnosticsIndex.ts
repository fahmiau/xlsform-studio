/** Selector for the derived diagnostics index (Task 4.10). */
import type { DiagnosticsIndex } from '@/core/lint';
import { useDerivedStore } from '@/state/derivedStore';

export function useDiagnosticsIndex(): DiagnosticsIndex {
  return useDerivedStore((state) => state.diagnosticIndex);
}
