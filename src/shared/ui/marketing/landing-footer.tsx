/**
 * Marketing footer — shared between the landing page and the public legal
 * pages so the bottom-of-screen experience stays consistent. Originally
 * inlined in `src/app/landing-content.tsx`; lifted here when the legal
 * page set landed so it could be reused.
 *
 * Stage void palette throughout. Light placeholders for unbuilt sections
 * (Product overview, About, Status) — the legal links are real.
 */

import Link from 'next/link';
import { Lockup } from '@/shared/ui/branding/lockup';

interface FooterColumn {
  title: string;
  items: Array<{ label: string; href: string | null }>;
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    items: [
      { label: 'Overview', href: null },
      { label: 'Aion', href: null },
      { label: 'Security', href: null },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'About', href: null },
      { label: 'Contact', href: 'mailto:hello@unusonic.com' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { label: 'Docs', href: null },
      { label: 'Status', href: null },
    ],
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Terms', href: '/legal/terms' },
      { label: 'SMS Policy', href: '/legal/sms' },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="relative py-16 px-6 border-t border-[oklch(1_0_0_/_0.06)]">
      <div className="max-w-6xl mx-auto grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-10">
        <div className="flex flex-col gap-3">
          <Link href="/" className="text-[var(--stage-text-primary)] inline-flex w-fit">
            <Lockup variant="horizontal" size="sm" status="idle" />
          </Link>
          <p className="text-xs text-[var(--stage-text-secondary)]/70 font-light max-w-xs">
            The event operating system.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-3">
            <h4 className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70">
              {col.title}
            </h4>
            {col.items.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-sm text-[var(--stage-text-secondary)]/80 font-light hover:text-[var(--stage-text-primary)] transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="text-sm text-[var(--stage-text-secondary)]/40 font-light"
                >
                  {item.label}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-[oklch(1_0_0_/_0.04)] flex flex-col sm:flex-row gap-2 justify-between text-xs text-[var(--stage-text-secondary)]/60">
        <span>© {new Date().getFullYear()} Unusonic LLC</span>
        <span>Built for event production.</span>
      </div>
    </footer>
  );
}
