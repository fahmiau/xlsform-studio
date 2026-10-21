import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

import { useWorkbookStore } from '@/state/workbookStore';
import type { SheetData } from '@/core/model/types';
import { basename } from './fileActions';

function SheetStat({ sheet, testId }: { sheet: SheetData; testId: string }) {
  return (
    <div className="rounded-lg border p-4" data-testid={testId}>
      <div className="text-muted-foreground text-xs font-medium uppercase">{sheet.sheetName}</div>
      <div className="mt-1 flex items-baseline gap-4">
        <span className="text-2xl font-semibold">{sheet.rows.length}</span>
        <span className="text-muted-foreground text-xs">rows</span>
        <span className="text-2xl font-semibold">{sheet.columns.length}</span>
        <span className="text-muted-foreground text-xs">columns</span>
      </div>
      <div className="text-muted-foreground mt-1 truncate text-xs">
        {sheet.columns.slice(0, 6).join(', ')}
        {sheet.columns.length > 6 ? ', …' : ''}
      </div>
    </div>
  );
}

/**
 * Temporary Stage 1 panel: sheet counts, passthrough tabs, and reader
 * warnings. Stage 2 replaces it with the grid.
 */
export function WorkbookSummary() {
  const data = useWorkbookStore((state) => state.data);
  const filePath = useWorkbookStore((state) => state.filePath);
  const warnings = useWorkbookStore((state) => state.warnings);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6" data-testid="summary">
      <header className="flex items-center gap-3">
        <FileSpreadsheet className="text-muted-foreground size-5" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold" data-testid="summary-file-name">
            {basename(filePath)}
          </h2>
          <p className="text-muted-foreground text-xs">
            {filePath ?? 'Not saved yet'} · {data.sheetOrder.length} sheet(s)
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SheetStat sheet={data.survey} testId="summary-survey" />
        <SheetStat sheet={data.choices} testId="summary-choices" />
        <SheetStat sheet={data.settings} testId="summary-settings" />
      </div>

      {data.passthrough.length > 0 ? (
        <div className="rounded-lg border p-4" data-testid="summary-passthrough">
          <h3 className="text-sm font-medium">Passthrough sheets</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {data.passthrough.map((sheet) => sheet.sheetName).join(', ')} — preserved on save.
          </p>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-4"
          data-testid="summary-warnings"
        >
          <h3 className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="size-4" aria-hidden />
            {warnings.length} reader warning(s)
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
