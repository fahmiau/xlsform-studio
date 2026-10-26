/**
 * Floating Accept/Revert bar for staged Build Mode changes (Task 6.7, AD-11).
 * Accept applies the draft in one store call → one undo entry.
 */
import { useEffect } from 'react';
import { AlertTriangle, Check, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { isEditableTarget } from '@/lib/commands';
import { useStagingStore } from '@/state/stagingStore';

export function StagingBar() {
  const diff = useStagingStore((state) => state.diff);
  const lint = useStagingStore((state) => state.lint);
  const staged = useStagingStore((state) => state.draft !== null);
  const accept = useStagingStore((state) => state.accept);
  const revert = useStagingStore((state) => state.revert);

  useEffect(() => {
    if (!staged) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        revert();
        toast.info('AI changes reverted');
        return;
      }
      if (event.key === 'Enter' && !isEditableTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        accept();
        toast.success('AI changes applied', { description: 'Ctrl+Z undoes the whole change.' });
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [accept, revert, staged]);

  if (!staged || !diff) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-lg border bg-white/95 px-3 py-2 text-xs shadow-lg dark:bg-slate-900/95"
      data-testid="ai-staging-bar"
      role="status"
    >
      <div className="min-w-0">
        <p className="font-medium" data-testid="ai-staging-summary">
          AI applied {diff.summary.text}
        </p>
        {lint && lint.added.length > 0 ? (
          <p className="flex items-center gap-1 text-[11px] text-amber-700">
            <AlertTriangle className="size-3" />
            {lint.added.length} new lint issue{lint.added.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-700"
        onClick={() => {
          accept();
          toast.success('AI changes applied', { description: 'Ctrl+Z undoes the whole change.' });
        }}
        data-testid="ai-accept"
      >
        <Check className="size-3.5" /> Accept Changes (Enter)
      </button>
      <button
        type="button"
        className="border-border flex items-center gap-1 rounded border px-2 py-1 hover:bg-accent"
        onClick={() => {
          revert();
          toast.info('AI changes reverted');
        }}
        data-testid="ai-revert"
      >
        <Undo2 className="size-3.5" /> Revert (Esc)
      </button>
    </div>
  );
}
