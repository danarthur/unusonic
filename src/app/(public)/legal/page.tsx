/**
 * Legal hub — landing page for /legal. Lists all current legal documents
 * with a one-line description so prospects, recipients, and reviewers can
 * orient quickly.
 */

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { LegalShell } from './_components/LegalShell';

export const metadata = {
  title: 'Legal — Unusonic',
  description: 'Privacy, terms, and messaging policies for the Unusonic platform.',
};

interface DocLink {
  href: string;
  title: string;
  description: string;
  effective: string;
}

const DOCS: DocLink[] = [
  {
    href: '/legal/privacy',
    title: 'Privacy Policy',
    description: 'How Unusonic collects, uses, and protects personal information.',
    effective: 'April 27, 2026',
  },
  {
    href: '/legal/terms',
    title: 'Terms of Service',
    description: 'The agreement between Unusonic and our customers.',
    effective: 'April 27, 2026',
  },
  {
    href: '/legal/sms',
    title: 'SMS Policy',
    description: 'How Unusonic sends text messages and how recipients can opt out.',
    effective: 'April 27, 2026',
  },
];

export default function LegalIndexPage() {
  return (
    <LegalShell>
      <p className="text-[10px] font-medium tracking-[0.24em] uppercase text-[var(--stage-text-secondary)]/60 mb-4">
        Legal
      </p>
      <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-[var(--stage-text-primary)] mb-4 leading-[1.15]">
        Policies and agreements
      </h1>
      <p className="text-base text-[var(--stage-text-secondary)] leading-[1.7] mb-12">
        The documents that govern how Unusonic operates: how we handle your data, what you and we
        agree to when you use the platform, and how messaging on your behalf works.
      </p>

      <ul className="space-y-3">
        {DOCS.map((doc) => (
          <li key={doc.href}>
            <Link
              href={doc.href}
              className="group block rounded-xl border border-[oklch(1_0_0_/_0.06)] bg-[oklch(1_0_0_/_0.02)] hover:bg-[oklch(1_0_0_/_0.04)] hover:border-[oklch(1_0_0_/_0.10)] px-5 py-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">
                    {doc.title}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--stage-text-secondary)] leading-relaxed">
                    {doc.description}
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--stage-text-secondary)]/55 tracking-tight">
                    Effective {doc.effective}
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 shrink-0 mt-0.5 text-[var(--stage-text-secondary)]/50 group-hover:text-[var(--stage-text-primary)] transition-colors" />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-16 pt-6 border-t border-[oklch(1_0_0_/_0.06)] text-sm text-[var(--stage-text-secondary)]/70 leading-relaxed">
        Questions about any of these documents?{' '}
        <a
          href="mailto:legal@unusonic.com"
          className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
        >
          legal@unusonic.com
        </a>
      </div>
    </LegalShell>
  );
}
