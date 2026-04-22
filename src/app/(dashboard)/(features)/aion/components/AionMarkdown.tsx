'use client';

import { memo, useState, useCallback, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CitationPill } from './CitationPill';
import type { CitationKind } from '../actions/resolve-citation';

/**
 * react-markdown v10 sanitizes all link URLs through `urlTransform`, and the
 * default sanitizer rejects any scheme it doesn't recognize — including our
 * custom `citation:` scheme. That caused every citation link to fall through
 * to the plain-<a> fallback with a stripped href. This wrapper preserves
 * citation URLs verbatim and delegates everything else to the default
 * sanitizer so http/mailto/etc. still get their safety filter.
 */
const CITATION_URL_PREFIX = /^citation:/i;
function citationSafeUrlTransform(url: string): string {
  if (CITATION_URL_PREFIX.test(url)) return url;
  return defaultUrlTransform(url);
}

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
  // Pre-process inline citation tags into custom-scheme markdown links.
  // The `a` component override below intercepts `citation:` hrefs and renders
  // a <CitationPill> instead of a normal anchor. Doing this as a string
  // substitution (rather than a remark plugin) keeps the transformation
  // dependency-free and survives streaming partial content — once a tag is
  // complete, it renders; until then the raw text stays visible as-is.
  const processed = useMemo(() => replaceCitationTags(content), [content]);

  return (
    <div className="aion-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={citationSafeUrlTransform}
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
            const citation = parseCitationHref(href);
            if (citation) {
              return (
                <CitationPill
                  kind={citation.kind}
                  id={citation.id}
                  fallbackLabel={extractText(children)}
                />
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processed}
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

// ---------------------------------------------------------------------------
// Citation tag helpers
// ---------------------------------------------------------------------------

const CITATION_REGEX = /<citation\s+kind="(deal|entity|catalog)"\s+id="([0-9a-f-]{36})">([^<]{1,80})<\/citation>/gi;
const CITATION_HREF_REGEX = /^citation:(deal|entity|catalog):([0-9a-f-]{36})$/i;
const MD_LABEL_ESCAPE = /([\[\]\\])/g;

/**
 * Replace `<citation kind="..." id="...">Label</citation>` blocks with
 * `[Label](citation:<kind>:<id>)`. Bad matches pass through untouched — a
 * partial mid-stream chunk may look like `<citation kind="deal" id="...` and
 * we leave that visible until the close tag arrives.
 */
export function replaceCitationTags(input: string): string {
  return input.replace(CITATION_REGEX, (_full, kind: string, id: string, label: string) => {
    // Escape any characters that would otherwise break the markdown link
    // label. Labels come from Sonnet — assume they can contain brackets.
    const safeLabel = label.replace(MD_LABEL_ESCAPE, '\\$1');
    return `[${safeLabel}](citation:${kind.toLowerCase()}:${id.toLowerCase()})`;
  });
}

/**
 * Parse a citation href back into {kind, id}. Returns null for normal anchors.
 */
export function parseCitationHref(href: string | undefined): { kind: CitationKind; id: string } | null {
  if (!href) return null;
  const m = href.match(CITATION_HREF_REGEX);
  if (!m) return null;
  return { kind: m[1].toLowerCase() as CitationKind, id: m[2].toLowerCase() };
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
