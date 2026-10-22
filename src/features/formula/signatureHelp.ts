/** Signature-help tooltip for function calls (Task 4.5). */
import type { Extension } from '@codemirror/state';
import { StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { showTooltip, type Tooltip } from '@codemirror/view';

import { analyzeContext } from '@/core/xpath/context';
import { findFunction, type XPathFunction } from '@/core/xpath/functions';

import type { CompletionData } from './completions';

export interface SignatureParts {
  name: string;
  params: Array<{ text: string; active: boolean }>;
  returns: string;
  description: string;
}

/** Split a catalog signature into params for the active-argument marker. */
export function signatureParts(fn: XPathFunction, argIndex: number): SignatureParts {
  return {
    name: fn.name,
    params: fn.params.map((param, index) => ({
      text: `${param.optional ? `[${param.name}]` : param.name}`,
      active: index === argIndex,
    })),
    returns: fn.returns,
    description: fn.description,
  };
}

export function signatureDom(fn: XPathFunction, argIndex: number): HTMLElement {
  const parts = signatureParts(fn, argIndex);
  const dom = document.createElement('div');
  dom.className = 'cm-xls-signature';
  dom.dataset.testid = 'signature-help';

  const head = document.createElement('div');
  head.appendChild(document.createTextNode(`${parts.name}(`));
  parts.params.forEach((param, index) => {
    if (index > 0) head.appendChild(document.createTextNode(', '));
    const span = document.createElement('span');
    span.textContent = param.text;
    if (param.active) {
      span.className = 'cm-xls-signature-active';
      span.dataset.active = 'true';
    }
    head.appendChild(span);
  });
  head.appendChild(document.createTextNode(`) → ${parts.returns}`));
  dom.appendChild(head);

  const doc = document.createElement('div');
  doc.className = 'cm-xls-signature-doc';
  doc.textContent = parts.description;
  dom.appendChild(doc);
  return dom;
}

/**
 * A tooltip that tracks the active argument. The field recomputes on document
 * and selection changes and exposes itself through `showTooltip`.
 */
export function signatureHelp(getData: () => CompletionData): Extension {
  const tooltipFor = (state: EditorState): Tooltip | null => {
    const source = state.doc.toString();
    const head = state.selection.main.head;
    const analysis = analyzeContext(source, head, { variableMap: getData().variableMap });
    if (analysis.kind !== 'signature') return null;
    const fn = findFunction(analysis.funcName);
    if (!fn) return null;
    return {
      pos: head,
      above: true,
      create: () => ({ dom: signatureDom(fn, analysis.argIndex) }),
    };
  };

  const field = StateField.define<Tooltip | null>({
    create: (state) => tooltipFor(state),
    update: (value, transaction) => {
      if (!transaction.docChanged && !transaction.selection) return value;
      return tooltipFor(transaction.state);
    },
    provide: (facet) => showTooltip.computeN([facet], (state) => [state.field(facet)]),
  });

  return field;
}
