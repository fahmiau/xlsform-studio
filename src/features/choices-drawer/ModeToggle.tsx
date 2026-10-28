/** Naming mode toggle: snake_case, numeric, or a custom prefix (Task 3.5). */
import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
      <Select
        value={mode.kind}
        onValueChange={(kind) => {
          if (kind === 'snake') onChange({ kind: 'snake' });
          else if (kind === 'numeric') onChange({ kind: 'numeric' });
          else if (kind === 'camel') onChange({ kind: 'camel' });
          else if (kind === 'passthrough') onChange({ kind: 'passthrough' });
          else onChange({ kind: 'prefix', prefix: prefixDraft || 'opt' });
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={`Choice naming mode for ${listName}`}
          data-testid="mode-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="snake" className="text-xs">
            Text codes
          </SelectItem>
          <SelectItem value="numeric" className="text-xs">
            Numbers
          </SelectItem>
          <SelectItem value="prefix" className="text-xs">
            Prefix
          </SelectItem>
          <SelectItem value="camel" className="text-xs">
            camelCase
          </SelectItem>
          <SelectItem value="passthrough" className="text-xs">
            Passthrough
          </SelectItem>
        </SelectContent>
      </Select>
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
