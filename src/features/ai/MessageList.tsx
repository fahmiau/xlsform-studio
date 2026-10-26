/** Markdown renderer for assistant messages (Task 6.5, no raw HTML). */
import type { ReactElement, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from './CodeBlock';

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in node) {
    return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return '';
}

const components = {
  pre({ children }: { children?: ReactNode }) {
    const first = Array.isArray(children) ? children[0] : children;
    if (first && typeof first === 'object' && 'props' in first) {
      const props = (first as ReactElement<{ className?: string; children?: ReactNode }>).props;
      const language = /language-([\w-]+)/.exec(props.className ?? '')?.[1];
      return (
        <CodeBlock
          code={textOf(props.children).replace(/\n$/, '')}
          {...(language ? { language } : {})}
        />
      );
    }
    return <pre>{children}</pre>;
  },
  code({ children, className }: { children?: ReactNode; className?: string }) {
    if (className?.startsWith('language-')) {
      return <code className={className}>{children}</code>;
    }
    return <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">{children}</code>;
  },
  // Model-supplied links are never opened (plan 6.2b); render them as text.
  a({ children }: { children?: ReactNode }) {
    return <span className="decoration-dotted underline">{children}</span>;
  },
  img({ alt }: { alt?: string }) {
    return <span className="text-muted-foreground">[image: {alt ?? ''}]</span>;
  },
};

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-sm max-w-none text-xs leading-relaxed [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_h1]:my-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-medium">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export interface MessageListProps {
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  streaming: boolean;
}

export function MessageList({ messages, streaming }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <p className="text-muted-foreground p-3 text-xs" data-testid="ai-chat-empty">
        Ask about form structure, XPath, or validation. Chat Mode cannot change the workbook.
      </p>
    );
  }
  return (
    <div className="space-y-3 p-3" data-testid="ai-message-list">
      {messages.map((message) => (
        <div key={message.id} className="space-y-1" data-role={message.role}>
          <p className="text-muted-foreground text-[10px] font-medium uppercase">
            {message.role === 'user' ? 'You' : 'Assistant'}
          </p>
          {message.role === 'user' ? (
            <p className="whitespace-pre-wrap text-xs">{message.content}</p>
          ) : (
            <div>
              <MarkdownMessage content={message.content} />
              {streaming && message.content === '' ? (
                <span className="text-muted-foreground text-xs">Thinking…</span>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
