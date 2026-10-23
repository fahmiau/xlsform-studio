/** Naming mode toggle: snake_case, numeric, or a custom prefix (Task 3.5). */
import { useState } from 'react';

import type { ListMode } from '@/core/slug/slugify';

export function ModeToggle({
  listName,
  mode,
  onChange,
}: {
  listName: string;
  mode: ListMode;
  onChange: (mode: ListMode) => void;
}) {
  const prefix = mode.kind === 'prefix' ? mode.prefix : 'opt';
  const [prefixDraft, setPrefixDraft] = useState(prefix);

  return (
    <div className="flex items-center gap-1 text-xs" data-testid="mode-toggle">
      <select
        aria-label={`Choice naming mode for ${listName}`}
        className="border-input bg-background rounded border px-1 py-0.5"
        value={mode.kind}
        data-testid="mode-select"
        onChange={(event) => {
          const kind = event.target.value;
          if (kind === 'snake') onChange({ kind: 'snake' });
          else if (kind === 'numeric') onChange({ kind: 'numeric' });
          else if (kind === 'camel') onChange({ kind: 'camel' });
          else if (kind === 'passthrough') onChange({ kind: 'passthrough' });
          else onChange({ kind: 'prefix', prefix: prefixDraft || 'opt' });
        }}
      >
        <option value="snake">Text codes</option>
        <option value="numeric">Numbers</option>
        <option value="prefix">Prefix</option>
        <option value="camel">camelCase</option>
        <option value="passthrough">Passthrough</option>
      </select>
      {mode.kind === 'prefix' ? (
        <input
          key={prefix}
          aria-label="Choice name prefix"
          className="border-input bg-background w-16 rounded border px-1 py-0.5 font-mono"
          value={prefixDraft}
          data-testid="mode-prefix"
          onChange={(event) => setPrefixDraft(event.target.value)}
          onBlur={() => onChange({ kind: 'prefix', prefix: prefixDraft || 'opt' })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onChange({ kind: 'prefix', prefix: prefixDraft || 'opt' });
              event.currentTarget.blur();
            }
          }}
        />
      ) : null}
    </div>
  );
}
