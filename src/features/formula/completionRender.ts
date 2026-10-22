/** Muted type/label/warning detail for completion items. */
import type { CompletionInfo } from '@codemirror/autocomplete';

import type { VariableMetadata } from '@/core/indexes/variables';
import type { XPathFunction } from '@/core/xpath/functions';

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function variableCompletionInfo(
  metadata: VariableMetadata,
  forwardReference: boolean,
): CompletionInfo {
  const dom = element('div', 'cm-xls-completion-info');
  dom.appendChild(element('span', 'cm-xls-completion-type', metadata.questionType));
  if (metadata.primaryLabel) {
    dom.appendChild(element('span', 'cm-xls-completion-label', metadata.primaryLabel));
  }
  if (forwardReference) {
    dom.appendChild(
      element(
        'div',
        'cm-xls-completion-warning',
        `⚠ Declared later in the form (row ${metadata.rowIndex + 1})`,
      ),
    );
  }
  return { dom };
}

export function functionCompletionInfo(fn: XPathFunction): CompletionInfo {
  const dom = element('div', 'cm-xls-completion-info');
  dom.appendChild(element('div', 'cm-xls-completion-signature', fn.signature));
  dom.appendChild(element('div', 'cm-xls-completion-label', fn.description));
  const link = document.createElement('a');
  link.href = fn.docsUrl;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = 'ODK docs';
  link.className = 'cm-xls-completion-docs';
  dom.appendChild(link);
  return { dom };
}
