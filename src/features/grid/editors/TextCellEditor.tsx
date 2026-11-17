/**
 * In-cell text editor (Step 3). Commits on Enter with `[0, 0]` movement so
 * focus stays on the edited cell instead of walking onto the trailing ghost row.
 */
import { useEffect, useRef, useState } from 'react';
import { GridCellKind, type ProvideEditorComponent, type TextCell } from '@glideapps/glide-data-grid';

type EditorProps = Parameters<ProvideEditorComponent<TextCell>>[0];

export function TextCellEditor({
  value,
  initialValue,
  onChange,
  onFinishedEditing,
}: EditorProps) {
  const startValue = initialValue ?? value.data ?? '';
  const [draft, setDraft] = useState(startValue);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seeded = useRef(false);

  // Seed Glide's overlay tempValue once on direct typing so outside clicks
  // commit the typed character instead of reverting to the previous text.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialValue !== undefined) {
      onChange({
        ...value,
        kind: GridCellKind.Text,
        data: initialValue,
        displayData: initialValue,
      });
    }
  }, [initialValue, onChange, value]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (initialValue !== undefined) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } else {
      el.select();
    }
    // Only position cursor on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const makeCell = (text: string): TextCell => ({
    ...value,
    kind: GridCellKind.Text,
    data: text,
    displayData: text,
  });

  const commit = (movement: readonly [-1 | 0 | 1, -1 | 0 | 1] = [0, 0]) => {
    const next = makeCell(draft);
    onChange(next);
    onFinishedEditing(next, movement);
  };

  const rows = Math.min(6, Math.max(1, draft.split('\n').length));

  return (
    <textarea
      ref={inputRef}
      rows={rows}
      className="bg-background text-foreground block h-full min-h-[32px] w-full resize-none border-0 px-2 py-1.5 text-[13px] leading-snug outline-none"
      data-testid="text-cell-editor"
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        onChange(makeCell(next));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          commit([0, 0]);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          commit([event.shiftKey ? -1 : 1, 0]);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onFinishedEditing(undefined, [0, 0]);
        }
      }}
    />
  );
}
