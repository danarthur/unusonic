/**
 * Layout shell for the legal pages. Stage void palette (matches the
 * marketing landing) — legal docs are an extension of the Unusonic brand
 * surface, not a recipient-facing portal that should inherit workspace
 * theming.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Lockup } from '@/shared/ui/branding/lockup';
import { LandingFooter } from '@/shared/ui/marketing/landing-footer';

interface LegalShellProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Terms', href: '/legal/terms' },
  { label: 'SMS Policy', href: '/legal/sms' },
];

export function LegalShell({ children }: LegalShellProps) {
  return (
    <div className="relative bg-stage-void min-h-screen text-[var(--stage-text-primary)]">
      <div className="fixed inset-0 z-0 bg-[var(--stage-void)] pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>
      <div className="relative z-10">
        <header className="border-b border-[oklch(1_0_0_/_0.06)] px-6 py-5">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-6">
            <Link href="/" className="inline-flex w-fit text-[var(--stage-text-primary)]">
              <Lockup variant="horizontal" size="sm" status="idle" />
            </Link>
            <nav className="hidden sm:flex items-center gap-5">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs text-[var(--stage-text-secondary)]/80 hover:text-[var(--stage-text-primary)] transition-colors tracking-tight"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="px-6 py-14">
          <article className="max-w-3xl mx-auto">{children}</article>
        </main>

        <LandingFooter />
      </div>
    </div>
  );
}
