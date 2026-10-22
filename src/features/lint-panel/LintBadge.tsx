/** Top-bar lint status badge (Task 4.10). */
import { AlertTriangle, BadgeCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePrefsStore } from '@/state/prefsStore';
import { useUiStore } from '@/state/uiStore';

import { useDiagnosticsIndex } from './useDiagnosticsIndex';

export function LintBadge() {
  const { counts } = useDiagnosticsIndex();
  const openLint = () => {
    usePrefsStore.getState().setPanelVisible('left', true);
    useUiStore.getState().setLeftTab('lint');
  };
  const label = `${counts.errors} Error${counts.errors === 1 ? '' : 's'}, ${counts.warnings} Warn`;
  const tone =
    counts.errors > 0
      ? 'text-destructive'
      : counts.warnings > 0
        ? 'text-amber-600'
        : 'text-emerald-600';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={openLint}
      className={tone}
      aria-label={`${label} — open lint panel`}
      title="Open lint panel (F8 jumps to the next problem)"
      data-testid="lint-badge"
    >
      {counts.errors === 0 && counts.warnings === 0 ? (
        <BadgeCheck aria-hidden />
      ) : (
        <AlertTriangle aria-hidden />
      )}
      <span className="text-xs" data-testid="lint-badge-counts">
        {counts.errors === 0 && counts.warnings === 0 ? '✓ 0 Errors' : label}
      </span>
    </Button>
  );
}
