/**
 * One-click Add Language (Task 5.5). Name + ISO 639 code with a local search,
 * a preview of the columns that will be created, and an opt-in conversion of
 * unsuffixed `label`/`hint` columns into the new language.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { isoLanguageName, searchIsoCodes } from '@/core/languages/isoCodes';
import { localizedHeader, resolveColumn } from '@/core/model/columns';
import { addLanguage } from '@/core/ops/languages';
import { useWorkbookStore } from '@/state/workbookStore';

export function AddLanguageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const data = useWorkbookStore((state) => state.data);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [convertDefault, setConvertDefault] = useState(false);

  const canConvert = useMemo(
    () =>
      (['survey', 'choices'] as const).some((sheet) =>
        data[sheet].columns.some((column) => {
          const resolved = resolveColumn(column);
          return resolved.isLocalizable && !resolved.language;
        }),
      ),
    [data],
  );

  const previewName = name.trim() || 'Language';
  const previewCode = code.trim();
  const preview = (['label', 'hint', 'constraint_message'] as const).map((base) =>
    localizedHeader(base, {
      name: previewName,
      ...(previewCode ? { code: previewCode } : {}),
    }),
  );

  const reset = () => {
    setName('');
    setCode('');
    setConvertDefault(false);
  };

  const submit = () => {
    try {
      useWorkbookStore.getState().apply(
        'Add language',
        (current) =>
          addLanguage(current, {
            name,
            ...(previewCode ? { code: previewCode } : {}),
            convertDefault: convertDefault && canConvert,
          }).data,
        { sheet: 'survey' },
      );
      toast.success(`Added ${previewCode ? `${previewName} (${previewCode})` : previewName}`);
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error('Language not added', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="add-language-dialog">
        <DialogHeader>
          <DialogTitle>Add language</DialogTitle>
          <DialogDescription>
            Creates translated label, hint, and constraint-message columns in both sheets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-xs">
          <label className="block space-y-1">
            <span>Language name</span>
            <input
              className="border-input bg-background w-full rounded border px-2 py-1"
              value={name}
              data-testid="language-name"
              placeholder="Indonesian"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span>ISO 639 code</span>
            <input
              className="border-input bg-background w-full rounded border px-2 py-1 font-mono"
              value={code}
              list="iso-language-codes"
              data-testid="language-code"
              placeholder="id"
              onChange={(event) => {
                const next = event.target.value;
                setCode(next);
                const known = isoLanguageName(next);
                if (known) setName(known);
              }}
            />
            <datalist id="iso-language-codes">
              {searchIsoCodes('', 60).map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </datalist>
          </label>

          <div className="bg-muted/40 rounded border p-2" data-testid="language-preview">
            <div className="text-muted-foreground mb-0.5">Columns preview</div>
            {preview.map((header) => (
              <div key={header} className="font-mono">
                {header}
              </div>
            ))}
            <div className="font-mono">
              {localizedHeader('label', { name: previewName })} (choices)
            </div>
          </div>

          {canConvert ? (
            <label className="flex items-start gap-1.5">
              <input
                type="checkbox"
                checked={convertDefault}
                data-testid="convert-default"
                onChange={(event) => setConvertDefault(event.target.checked)}
              />
              <span>
                Convert the existing unsuffixed columns into this language instead of adding new
                ones.
              </span>
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={name.trim() === ''} data-testid="add-language-submit">
            Add language
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
