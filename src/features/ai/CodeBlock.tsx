/**
 * Fenced code block with Copy and "Insert into Active Cell" (Task 6.5).
 * Insert goes through the workbook store, so it is one undo step.
 */
import { Check, Copy, CornerDownLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useUiStore } from '@/state/uiStore';

import { insertIntoActiveCell } from './insertText';

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const activeCell = useUiStore((state) => state.activeCell);
  const insertDisabled = !activeCell || activeCell.sheet === 'settings';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  };

  const insert = () => {
    const result = insertIntoActiveCell(code);
    if (result.ok) {
      toast.success('Inserted into the active cell', { description: 'Ctrl+Z undoes it.' });
    } else {
      toast.warning(result.reason ?? 'Could not insert here.');
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded border" data-testid="ai-code-block">
      <div className="bg-muted text-muted-foreground flex items-center gap-1 px-2 py-1 text-[11px]">
        <span className="font-mono">{language ?? 'text'}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="hover:bg-accent flex items-center gap-1 rounded px-1.5 py-0.5"
            onClick={() => void copy()}
            data-testid="ai-code-copy"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className="hover:bg-accent flex items-center gap-1 rounded px-1.5 py-0.5 disabled:opacity-40"
            onClick={insert}
            disabled={insertDisabled}
            title={insertDisabled ? 'Select a cell first' : 'Insert into the active cell'}
            data-testid="ai-code-insert"
          >
            <CornerDownLeft className="size-3" />
            Insert into Active Cell
          </button>
        </div>
      </div>
      <pre className="bg-background overflow-x-auto p-2 text-[11px]">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
