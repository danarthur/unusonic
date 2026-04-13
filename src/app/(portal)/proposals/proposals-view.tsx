'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { FileText, Eye, Clock, Check, Copy, ExternalLink, Send, Pen, X as XIcon, AlertTriangle } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

interface Proposal {
  id: string;
  dealId: string;
  dealTitle: string;
  status: string;
  publicUrl: string;
  createdAt: string;
  acceptedAt: string | null;
  signedAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  depositPaidAt: string | null;
  expiresAt: string | null;
}

interface ProposalsViewProps {
  proposals: Proposal[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  signed: 'Signed',
  expired: 'Expired',
  declined: 'Declined',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-tertiary)]',
  sent: 'bg-[oklch(0.75_0.12_250/0.2)] text-[oklch(0.75_0.12_250)]',
  viewed: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
  accepted: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
  signed: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
  expired: 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-tertiary)]',
  declined: 'bg-[oklch(0.65_0.15_25/0.2)] text-[oklch(0.65_0.15_25)]',
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  draft: Pen,
  sent: Send,
  viewed: Eye,
  accepted: Check,
  signed: Check,
  expired: AlertTriangle,
  declined: XIcon,
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return format(new Date(iso), 'MMM d');
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(iso);
}

/* ── Component ───────────────────────────────────────────────────── */

export function ProposalsView({ proposals }: ProposalsViewProps) {
  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <FileText className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No proposals yet. Proposals for your deals will appear here.
        </p>
      </div>
    );
  }

  // Summary
  const sent = proposals.filter(p => p.status !== 'draft').length;
  const viewed = proposals.filter(p => p.viewCount > 0).length;
  const signed = proposals.filter(p => p.signedAt).length;
  const depositsPaid = proposals.filter(p => p.depositPaidAt).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      <h1 className="sr-only">Proposals</h1>
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Sent" value={String(sent)} />
        <StatCard label="Viewed" value={String(viewed)} />
        <StatCard label="Signed" value={String(signed)} />
        <StatCard label="Deposits" value={String(depositsPaid)} />
      </div>

      {/* Proposal list */}
      <div className="flex flex-col gap-2">
        {proposals.map(p => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </motion.div>
  );
}

/* ── Stat Card ───────────────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div data-surface="elevated" className="flex flex-col gap-1 p-3 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)]">
      <span className="stage-label text-[var(--stage-text-tertiary)]">{label}</span>
      <span className="text-lg font-semibold tracking-tight text-[var(--stage-text-primary)]">{value}</span>
    </div>
  );
}

/* ── Proposal Card ───────────────────────────────────────────────── */

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(proposal.publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div data-surface="elevated" className="flex flex-col gap-3 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
            {proposal.dealTitle}
          </h3>
          <p className="text-xs text-[var(--stage-text-tertiary)] mt-0.5">
            Created {formatDate(proposal.createdAt)}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 stage-badge-text px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[proposal.status] ?? STATUS_STYLES.draft}`}>
          {STATUS_ICONS[proposal.status] && (() => { const I = STATUS_ICONS[proposal.status]; return <I className="size-2.5" />; })()}
          {STATUS_LABELS[proposal.status] ?? proposal.status}
        </span>
      </div>

      {/* Activity indicators */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--stage-text-tertiary)]">
        {proposal.viewCount > 0 && (
          <span className="flex items-center gap-1">
            <Eye className="size-3" />
            {proposal.viewCount} {proposal.viewCount === 1 ? 'view' : 'views'}
            {proposal.lastViewedAt && ` · ${timeAgo(proposal.lastViewedAt)}`}
          </span>
        )}
        {proposal.signedAt && (
          <span className="flex items-center gap-1 text-[oklch(0.75_0.15_145)]">
            <Check className="size-3" />
            Signed {formatDate(proposal.signedAt)}
          </span>
        )}
        {proposal.depositPaidAt && (
          <span className="flex items-center gap-1 text-[oklch(0.75_0.15_145)]">
            <Check className="size-3" />
            Deposit paid
          </span>
        )}
        {proposal.expiresAt && !proposal.signedAt && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            Expires {formatDate(proposal.expiresAt)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <a
          href={proposal.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.12)] transition-colors"
        >
          <ExternalLink className="size-3" />
          View
        </a>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
