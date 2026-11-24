/**
 * In-cell text editor (Step 3). Commits on Enter with `[0, 0]` movement so
 * focus stays on the edited cell instead of walking onto the trailing ghost row.
 */
import { useRef, useState } from 'react';
import {
  GridCellKind,
  type ProvideEditorComponent,
  type TextCell,
} from '@glideapps/glide-data-grid';

import {
  actionMovement,
  useConsumeDirectType,
  useDirectTypeInitialState,
  useFocusInputOnMount,
} from './directTypeBuffer';

type EditorProps = Parameters<ProvideEditorComponent<TextCell>>[0];

export function TextCellEditor({ value, initialValue, onChange, onFinishedEditing }: EditorProps) {
  const isDirectType = initialValue !== undefined;
  const [draft, setDraft] = useDirectTypeInitialState(initialValue, value.data ?? '');
  const [focusTick, setFocusTick] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userEdited = useRef(false);

  const makeCell = (text: string): TextCell => ({
    ...value,
    kind: GridCellKind.Text,
    data: text,
    displayData: text,
  });

  useFocusInputOnMount(inputRef, isDirectType, focusTick);

  // Seed Glide's overlay tempValue once on direct typing so outside clicks
  // commit the typed character instead of reverting to the previous text.
  useConsumeDirectType((pending) => {
    const initialText = pending?.text ?? initialValue;
    if (initialText !== undefined && !userEdited.current) {
      if (pending && pending.text !== draft) {
        setDraft(pending.text);
        setFocusTick((tick) => tick + 1);
      }
      onChange(makeCell(initialText));
    }
    if (!pending?.trailingAction) return;
    const movement = actionMovement(pending.trailingAction);
    onFinishedEditing(movement ? makeCell(pending.text) : undefined, movement ?? [0, 0]);
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
      autoFocus
      rows={rows}
      className="bg-background text-foreground block h-full min-h-[32px] w-full resize-none border-0 px-2 py-1.5 text-[13px] leading-snug outline-none"
      data-testid="text-cell-editor"
      value={draft}
      onChange={(event) => {
        userEdited.current = true;
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
