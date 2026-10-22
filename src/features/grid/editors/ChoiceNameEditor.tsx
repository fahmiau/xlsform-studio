/** Manual choice-name editor (Task 3.4); committing marks the row locked. */
import { useEffect, useRef, useState } from 'react';
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { makeChoiceNameCell, type ChoiceNameCell } from '../cells/ChoiceNameCell';

type EditorProps = Parameters<ProvideEditorComponent<ChoiceNameCell>>[0];

export function ChoiceNameEditor({ value, onChange, onFinishedEditing }: EditorProps) {
  const [draft, setDraft] = useState(value.data.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => {
    const cell = makeChoiceNameCell({ ...value.data, value: draft, locked: draft.trim() !== '' });
    onChange(cell);
    onFinishedEditing(cell, movement);
  };

  return (
    <input
      ref={inputRef}
      className="bg-background text-foreground h-full w-full min-w-40 border px-1 font-mono text-sm outline-none"
      data-testid="choice-name-editor"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commit([1, 0]);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onFinishedEditing(undefined);
        }
      }}
    />
  );
}
