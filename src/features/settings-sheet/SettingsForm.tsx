/** Settings sheet form view (Task 2.7, Q7 — form and grid views). */
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resolveColumn, type ColumnBase } from '@/core/model/columns';
import type { ColumnKey, WorkbookData } from '@/core/model/types';
import { findColumnKey } from '@/core/indexes/columns';
import { DEFAULT_LANGUAGE_ID, discoverLanguages } from '@/core/languages/discover';
import { addColumn } from '@/core/ops/columns';
import { setCells } from '@/core/ops/cells';
import { insertRows } from '@/core/ops/rows';
import { SheetGrid } from '@/features/grid/SheetGrid';
import { SETTINGS_GRID_CONFIG } from '@/features/grid/columns';
import { useWorkbookStore } from '@/state/workbookStore';

interface SettingDefinition {
  base: ColumnBase;
  canonical: ColumnKey;
  label: string;
  help: string;
}

const KNOWN_SETTINGS: readonly SettingDefinition[] = [
  {
    base: 'form_title',
    canonical: 'form_title',
    label: 'Form title',
    help: 'Shown in the form list and ODK Collect.',
  },
  {
    base: 'form_id',
    canonical: 'form_id',
    label: 'Form ID',
    help: 'Unique identifier; cannot change after data collection starts.',
  },
  {
    base: 'version',
    canonical: 'version',
    label: 'Version',
    help: 'Form version string or date (e.g. 2024010101).',
  },
  {
    base: 'default_language',
    canonical: 'default_language',
    label: 'Default language',
    help: 'Language used when no translation is selected.',
  },
  {
    base: 'style',
    canonical: 'style',
    label: 'Style',
    help: 'Optional theme, e.g. pages or theme-grid.',
  },
  {
    base: 'instance_name',
    canonical: 'instance_name',
    label: 'Instance name',
    help: 'XPath expression naming each submission.',
  },
  {
    base: 'allow_choice_duplicates',
    canonical: 'allow_choice_duplicates',
    label: 'Allow choice duplicates',
    help: 'Permit duplicate choice names within a list (yes/no).',
  },
];

interface LanguageOption {
  value: string;
  label: string;
}

/** `default_language` choices come from the shared language discovery (5.3). */
function languageOptions(data: WorkbookData): LanguageOption[] {
  return discoverLanguages(data)
    .filter((language) => language.id !== DEFAULT_LANGUAGE_ID)
    .map((language) => ({ value: language.display, label: language.display }));
}

function ensureSettingsRow(data: WorkbookData): WorkbookData {
  if (data.settings.rows.length > 0) return data;
  return insertRows(data, 'settings', 0, [{ cells: {} }]);
}

function writeSetting(
  data: WorkbookData,
  key: ColumnKey,
  base: ColumnBase,
  canonical: ColumnKey,
  value: string,
): WorkbookData {
  let next = ensureSettingsRow(data);
  const actual = base === 'custom' ? key : (findColumnKey(next.settings, base) ?? key);
  if (base !== 'custom' && !next.settings.columns.includes(actual)) {
    next = addColumn(next, 'settings', canonical);
  }
  if (!next.settings.columns.includes(actual)) {
    next = addColumn(next, 'settings', actual);
  }
  const rowId = next.settings.rows[0]?.id;
  if (!rowId) return data;
  return setCells(next, 'settings', [{ rowId, column: actual, value }]);
}

/** One labeled field; local state commits on blur or Enter (one undo step). */
function SettingField({
  definition,
  value,
  options,
  onCommit,
}: {
  definition: SettingDefinition;
  value: string;
  options?: LanguageOption[];
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  const commit = (next: string) => {
    if (next === value) return;
    onCommit(next);
  };

  const fieldId = `setting-${definition.base === 'custom' ? definition.canonical : definition.base}`;

  const common = {
    id: fieldId,
    'data-testid': fieldId,
    className:
      'border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none',
    value: draft,
    onBlur: () => commit(draft),
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (event.key === 'Enter') commit(draft);
    },
  } as const;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {definition.label}
      </label>
      {options ? (
        <select
          {...common}
          onChange={(event) => {
            setDraft(event.target.value);
            commit(event.target.value);
          }}
        >
          <option value="">(none)</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {value && !options.some((option) => option.value === value) ? (
            <option value={value}>{value}</option>
          ) : null}
        </select>
      ) : (
        <input {...common} type="text" onChange={(event) => setDraft(event.target.value)} />
      )}
      <p className="text-muted-foreground text-xs">{definition.help}</p>
    </div>
  );
}

export function SettingsForm() {
  const data = useWorkbookStore((state) => state.data);
  const [view, setView] = useState<'form' | 'grid'>('form');
  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (view === 'grid') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
          <ViewToggle view={view} onChange={setView} />
        </div>
        <div className="min-h-0 flex-1">
          <SheetGrid sheetName="settings" config={SETTINGS_GRID_CONFIG} />
        </div>
      </div>
    );
  }

  const settings = data.settings;
  const row = settings.rows[0];
  const languages = languageOptions(data);
  const customColumns = settings.columns.filter(
    (column) => resolveColumn(column).base === 'custom',
  );

  const commit = (definition: SettingDefinition, value: string) => {
    useWorkbookStore
      .getState()
      .apply(
        `Set ${definition.label.toLowerCase()}`,
        (current) =>
          writeSetting(
            current,
            findColumnKey(current.settings, definition.base) ?? definition.canonical,
            definition.base,
            definition.canonical,
            value,
          ),
        { sheet: 'settings' },
      );
  };

  const addSetting = () => {
    const key = newKey.trim();
    if (!key) {
      setError('Enter a key.');
      return;
    }
    if (settings.columns.includes(key)) {
      setError(`"${key}" already exists.`);
      return;
    }
    useWorkbookStore.getState().apply(
      `Add setting "${key}"`,
      (current) => {
        const withRow = ensureSettingsRow(current);
        const withColumn = addColumn(withRow, 'settings', key);
        const rowId = withColumn.settings.rows[0]?.id;
        return rowId
          ? setCells(withColumn, 'settings', [{ rowId, column: key, value: newValue }])
          : withColumn;
      },
      { sheet: 'settings' },
    );
    toast.success(`Added ${key}`);
    setAddOpen(false);
    setNewKey('');
    setNewValue('');
  };

  return (
    <div className="h-full overflow-auto p-4" data-testid="settings-form">
      <div className="mb-4 flex items-center gap-2">
        <ViewToggle view={view} onChange={setView} />
        <h2 className="text-sm font-semibold">Form settings</h2>
      </div>

      <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
        {KNOWN_SETTINGS.map((definition) => {
          const key = findColumnKey(settings, definition.base) ?? definition.canonical;
          const value = row?.cells[key] ?? '';
          return (
            <SettingField
              key={`${definition.base}:${value}`}
              definition={definition}
              value={value}
              options={definition.base === 'default_language' ? languages : undefined}
              onCommit={(next) => commit(definition, next)}
            />
          );
        })}
      </div>

      <div className="mt-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Custom settings</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            data-testid="add-setting"
          >
            + Add setting
          </Button>
        </div>
        {customColumns.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-xs" data-testid="no-custom-settings">
            No custom keys.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {customColumns.map((column) => (
              <div key={column} className="flex items-center gap-2">
                <span className="w-52 shrink-0 truncate text-sm font-medium" title={column}>
                  {column}
                </span>
                <SettingField
                  key={`${column}:${row?.cells[column] ?? ''}`}
                  definition={{ base: 'custom', canonical: column, label: column, help: '' }}
                  value={row?.cells[column] ?? ''}
                  onCommit={(next) => {
                    useWorkbookStore
                      .getState()
                      .apply(
                        `Set ${column}`,
                        (current) => writeSetting(current, column, 'custom', column, next),
                        { sheet: 'settings' },
                      );
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent data-testid="add-setting-dialog">
          <DialogHeader>
            <DialogTitle>Add setting</DialogTitle>
            <DialogDescription>
              Custom keys are written to the settings sheet as-is.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <input
              className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm"
              placeholder="key"
              value={newKey}
              autoFocus
              data-testid="add-setting-key"
              onChange={(event) => {
                setNewKey(event.target.value);
                setError(null);
              }}
            />
            <input
              className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm"
              placeholder="value"
              value={newValue}
              data-testid="add-setting-value"
              onChange={(event) => setNewValue(event.target.value)}
            />
            {error ? (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addSetting} data-testid="add-setting-confirm">
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'form' | 'grid';
  onChange: (view: 'form' | 'grid') => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5" role="tablist" aria-label="Settings view">
      {(['form', 'grid'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={view === mode}
          className={`rounded px-2 py-0.5 text-xs capitalize ${
            view === mode ? 'bg-accent font-medium' : 'text-muted-foreground'
          }`}
          onClick={() => onChange(mode)}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
