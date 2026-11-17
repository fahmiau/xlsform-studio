/** Manual choice-name editor (Task 3.4); committing marks the row locked. */
import { useEffect, useRef, useState } from 'react';
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { makeChoiceNameCell, type ChoiceNameCell } from '../cells/ChoiceNameCell';

type EditorProps = Parameters<ProvideEditorComponent<ChoiceNameCell>>[0];

export function ChoiceNameEditor({
  value,
  initialValue,
  onChange,
  onFinishedEditing,
}: EditorProps) {
  const [draft, setDraft] = useState(initialValue ?? value.data.value);
  const inputRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialValue !== undefined) {
      onChange(
        makeChoiceNameCell({
          ...value.data,
          value: initialValue,
          locked: initialValue.trim() !== '',
        }),
      );
    }
  }, [initialValue, onChange, value.data]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (initialValue !== undefined) {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    } else {
      input.select();
    }
    // Only position cursor on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => {
    const cell = makeChoiceNameCell({ ...value.data, value: draft, locked: draft.trim() !== '' });
    onChange(cell);
    onFinishedEditing(cell, movement ?? [0, 0]);
  };

  return (
    <input
      ref={inputRef}
      className="bg-background text-foreground h-full w-full min-w-40 border px-1 font-mono text-sm outline-none"
      data-testid="choice-name-editor"
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        onChange(makeChoiceNameCell({ ...value.data, value: next, locked: next.trim() !== '' }));
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
