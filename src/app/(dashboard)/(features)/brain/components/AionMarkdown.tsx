'use client';

import { memo, useState, useCallback, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// Register common languages (tree-shakeable)
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);

// ---------------------------------------------------------------------------
// Code block with syntax highlighting, always-visible copy, language badge
// ---------------------------------------------------------------------------

function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace(/^language-/, '') || '';
  const rawText = typeof children === 'string' ? children : extractText(children);

  const highlighted = useMemo(() => {
    if (!rawText) return '';
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(rawText, { language: lang }).value;
      }
      return hljs.highlightAuto(rawText).value;
    } catch {
      return '';
    }
  }, [rawText, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rawText]);

  return (
    <div className="relative">
      {/* Header bar — always visible */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[oklch(1_0_0_/_0.04)]">
        <span className="stage-label font-mono text-[var(--stage-text-tertiary)] select-none">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'p-1 rounded-[4px] transition-colors duration-[80ms] inline-flex items-center gap-1',
            'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
            'hover:bg-[oklch(1_0_0_/_0.06)]',
          )}
          aria-label="Copy code"
        >
          {copied ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
          <span className="text-label">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {/* Code content with syntax highlighting */}
      {highlighted ? (
        <code
          className={cn(className, 'hljs')}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <code className={className}>{children}</code>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AionMarkdown
// ---------------------------------------------------------------------------

export const AionMarkdown = memo(function AionMarkdown({ content }: { content: string }) {
  return (
    <div className="aion-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <pre>{children}</pre>;
          },
          code({ className, children, ...props }) {
            const isBlock = className?.startsWith('language-') || isBlockCode(props);
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return <code className={className} {...props}>{children}</code>;
          },
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBlockCode(props: Record<string, unknown>): boolean {
  const node = props.node as { position?: { start?: { line?: number } } } | undefined;
  return !!node;
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children ?? '');
  }
  return '';
}
