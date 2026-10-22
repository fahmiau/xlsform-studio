/** Bottom sheet tabs with live counts (Tasks 2.1/2.7). */
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore, type SheetTab } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

const SHEETS: readonly SheetTab[] = ['survey', 'choices', 'settings'];

export function SheetTabs() {
  const activeSheet = useUiStore((state) => state.activeSheet);
  const setActiveSheet = useUiStore((state) => state.setActiveSheet);
  const data = useWorkbookStore((state) => state.data);
  const lists = useDerivedStore((state) => state.indexes.choices.byList);

  const label = (sheet: SheetTab): string => {
    if (sheet === 'survey') return `survey (${data.survey.rows.length})`;
    if (sheet === 'choices') return `choices (${Object.keys(lists).length} lists)`;
    return 'settings';
  };

  return (
    <nav
      className="flex items-center gap-1 border-t px-2 py-1"
      aria-label="Sheets"
      data-testid="sheet-tabs"
    >
      {SHEETS.map((sheet) => (
        <button
          key={sheet}
          type="button"
          role="tab"
          aria-selected={activeSheet === sheet}
          data-testid={`sheet-tab-${sheet}`}
          className={`rounded px-3 py-1 text-xs ${
            activeSheet === sheet
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/60'
          }`}
          onClick={() => setActiveSheet(sheet)}
        >
          {label(sheet)}
        </button>
      ))}
      <span className="text-muted-foreground ml-auto text-xs">
        {data.passthrough.length > 0
          ? `${data.passthrough.length} passthrough sheet(s) preserved`
          : 'No passthrough sheets'}
      </span>
    </nav>
  );
}
