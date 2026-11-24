/** Manual choice-name editor (Task 3.4); committing marks the row locked. */
import { useRef, useState } from 'react';
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { makeChoiceNameCell, type ChoiceNameCell } from '../cells/ChoiceNameCell';
import {
  actionMovement,
  useConsumeDirectType,
  useDirectTypeInitialState,
  useFocusInputOnMount,
} from './directTypeBuffer';

type EditorProps = Parameters<ProvideEditorComponent<ChoiceNameCell>>[0];

export function ChoiceNameEditor({
  value,
  initialValue,
  onChange,
  onFinishedEditing,
}: EditorProps) {
  const isDirectType = initialValue !== undefined;
  const [draft, setDraft] = useDirectTypeInitialState(initialValue, value.data.value);
  const [focusTick, setFocusTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const userEdited = useRef(false);

  const makeCell = (text: string) =>
    makeChoiceNameCell({ ...value.data, value: text, locked: text.trim() !== '' });

  useFocusInputOnMount(inputRef, isDirectType, focusTick);

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

  const commit = (movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => {
    const cell = makeCell(draft);
    onChange(cell);
    onFinishedEditing(cell, movement ?? [0, 0]);
  };

  return (
    <input
      ref={inputRef}
      autoFocus
      className="bg-background text-foreground h-full w-full min-w-40 border px-1 font-mono text-sm outline-none"
      data-testid="choice-name-editor"
      value={draft}
      onChange={(event) => {
        userEdited.current = true;
        const next = event.target.value;
        setDraft(next);
        onChange(makeCell(next));
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit([0, 0]);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commit([event.shiftKey ? -1 : 1, 0]);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onFinishedEditing(undefined, [0, 0]);
        }
      }}
    />
  );
}
