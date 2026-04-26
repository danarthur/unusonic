/**
 * Typographic primitives for legal documents. Stage Engineering rhythm
 * adapted for long-form prose: sentence-case headings, no exclamation
 * marks, tight letter-spacing, generous line-height for readable measure.
 */

import type { ReactNode } from 'react';

interface DocHeaderProps {
  title: string;
  /** Display string for the effective date (e.g. "April 27, 2026"). */
  effectiveDate: string;
  /** Optional one-line summary that sets context. */
  intro?: string;
}

export function DocHeader({ title, effectiveDate, intro }: DocHeaderProps) {
  return (
    <header className="mb-12">
      <p className="text-[10px] font-medium tracking-[0.24em] uppercase text-[var(--stage-text-secondary)]/60 mb-4">
        Legal
      </p>
      <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-[var(--stage-text-primary)] mb-3 leading-[1.15]">
        {title}
      </h1>
      <p className="text-xs text-[var(--stage-text-secondary)]/60 tracking-tight">
        Effective {effectiveDate}
      </p>
      {intro ? (
        <p className="mt-6 text-base text-[var(--stage-text-secondary)] leading-[1.7]">{intro}</p>
      ) : null}
    </header>
  );
}

interface SectionProps {
  /** Anchor id for direct links from the index. */
  id?: string;
  title: string;
  children: ReactNode;
}

export function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)] mb-3">
        {title}
      </h2>
      <div className="space-y-4 text-[15px] text-[var(--stage-text-secondary)] leading-[1.7]">
        {children}
      </div>
    </section>
  );
}

interface SubsectionProps {
  title: string;
  children: ReactNode;
}

export function Subsection({ title, children }: SubsectionProps) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]/90 mb-2">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

interface DocFootnoteProps {
  children: ReactNode;
}

export function DocFootnote({ children }: DocFootnoteProps) {
  return (
    <div className="mt-16 pt-6 border-t border-[oklch(1_0_0_/_0.06)] text-xs text-[var(--stage-text-secondary)]/70 leading-[1.6]">
      {children}
    </div>
  );
}

interface MutedProps {
  children: ReactNode;
}

/** Inline emphasis for clauses that read in a different register (defined terms, contact info). */
export function Muted({ children }: MutedProps) {
  return (
    <span className="text-[var(--stage-text-secondary)]/70">{children}</span>
  );
}
