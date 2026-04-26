'use client';

/**
 * Client view for the public DNS-help page. Shows snapshot records, copy
 * buttons per row, a "verify now" button that runs a live DNS check, and a
 * confirmed state when all records resolve.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, AlertCircle, Clock, RefreshCw, ShieldCheck } from 'lucide-react';
import { confirmDnsHandoff, type HandoffPublicView } from '@/features/org-management/api/dns-handoff-public';
import type { DnsRecord } from '@/shared/api/resend/domains';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

interface DnsHelpPageClientProps {
  view: HandoffPublicView;
}

export function DnsHelpPageClient({ view }: DnsHelpPageClientProps) {
  const [liveRecords, setLiveRecords] = useState<DnsRecord[] | null>(null);
  const [allVerified, setAllVerified] = useState<boolean>(!!view.confirmedAt);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(view.confirmedAt);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ranOnceRef = useRef(false);

  // Auto-trigger one verify on first mount so the recipient sees fresh status
  // (snapshot may be hours/days old).
  useEffect(() => {
    if (ranOnceRef.current) return;
    ranOnceRef.current = true;
    runVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on mount; runVerify reads view.token which is mount-stable
  }, []);

  function runVerify() {
    setError(null);
    startTransition(async () => {
      const result = await confirmDnsHandoff(view.token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLiveRecords(result.records);
      setAllVerified(result.allVerified);
      setConfirmedAt(result.confirmedAt);
      setLastCheckedAt(new Date().toISOString());
    });
  }

  // Records to render: prefer live (with status), fall back to snapshot
  const records = liveRecords ?? view.records;

  return (
    <div className="min-h-dvh bg-[oklch(0.12_0_0)] flex flex-col items-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_LIGHT}
        className="w-full max-w-2xl"
      >
        <p className="text-xs font-medium tracking-[0.12em] uppercase text-[oklch(1_0_0)]/30 mb-8">
          Unusonic
        </p>

        <h1 className="text-xl font-medium tracking-tight text-[oklch(1_0_0)]/90 mb-2 leading-tight">
          {view.ownerName} needs help with DNS for {view.domain}
        </h1>
        <p className="text-sm text-[oklch(1_0_0)]/55 leading-relaxed mb-8">
          {view.ownerName} ({view.ownerCompany}) is setting up Unusonic to send proposals and client emails from{' '}
          <span className="font-mono text-[oklch(1_0_0)]/75">{view.domain}</span>. Add the records below at whoever
          runs DNS for that domain (Cloudflare, GoDaddy, Squarespace, etc), then hit verify.
        </p>

        {view.message ? (
          <div className="mb-6 rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.03)] px-4 py-3">
            <p className="text-[11px] font-medium tracking-[0.06em] uppercase text-[oklch(1_0_0)]/45 mb-1">
              Note from {view.ownerName}
            </p>
            <p className="text-sm text-[oklch(1_0_0)]/85 leading-relaxed whitespace-pre-wrap">{view.message}</p>
          </div>
        ) : null}

        {view.recordsMayBeStale ? (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/8 px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0 text-[var(--color-unusonic-warning)] mt-0.5" />
            <p className="text-xs text-[oklch(1_0_0)]/75 leading-relaxed">
              These records may be out of date. {view.ownerName} updated their setup after sending you this link. Reach out to confirm.
            </p>
          </div>
        ) : null}

        {/* Verified state */}
        {allVerified && confirmedAt ? (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--color-unusonic-success)]/30 bg-[var(--color-unusonic-success)]/10 px-4 py-3.5">
            <ShieldCheck className="w-5 h-5 shrink-0 text-[var(--color-unusonic-success)]" />
            <div>
              <p className="text-sm font-medium text-[oklch(1_0_0)]/95">All records verified</p>
              <p className="text-xs text-[oklch(1_0_0)]/55 mt-0.5">
                {view.ownerName} has been notified. You can close this page.
              </p>
            </div>
          </div>
        ) : null}

        {/* Records list */}
        <div className="rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.025)] overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-[oklch(1_0_0_/_0.06)] flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-tight text-[oklch(1_0_0)]/85">DNS records</h2>
            {lastCheckedAt ? (
              <span className="text-[11px] text-[oklch(1_0_0)]/45">
                Checked {new Date(lastCheckedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-[oklch(1_0_0_/_0.05)]">
            {records.map((r, i) => (
              <RecordRow key={`${r.record}-${r.name}-${i}`} record={r} />
            ))}
          </ul>
        </div>

        {error ? (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--color-unusonic-error)]/25 bg-[var(--color-unusonic-error)]/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0 text-[var(--color-unusonic-error)] mt-0.5" />
            <p className="text-xs text-[oklch(1_0_0)]/85 leading-relaxed">{error}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            onClick={runVerify}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[oklch(0.96_0_0)] hover:bg-[oklch(1_0_0)] text-[oklch(0.12_0_0)] px-4 py-2.5 text-sm font-medium tracking-tight transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Verify now
              </>
            )}
          </button>
          <p className="text-[11px] text-[oklch(1_0_0)]/45">
            Runs a live DNS check. Safe to click as many times as you want.
          </p>
        </div>

        <hr className="my-10 border-[oklch(1_0_0_/_0.06)]" />

        <p className="text-[11px] text-[oklch(1_0_0)]/40 leading-relaxed text-center">
          Powered by Unusonic. Link works through{' '}
          {new Date(view.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
        </p>
      </motion.div>
    </div>
  );
}

function RecordRow({ record }: { record: DnsRecord }) {
  const [copiedField, setCopiedField] = useState<'name' | 'value' | null>(null);

  function copy(field: 'name' | 'value', text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[oklch(1_0_0)]/65">
            {record.record}
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-[oklch(1_0_0_/_0.05)] text-[oklch(1_0_0)]/60 border border-[oklch(1_0_0_/_0.08)]">
            {record.type}
          </span>
          {record.priority != null ? (
            <span className="text-[11px] text-[oklch(1_0_0)]/45">priority {record.priority}</span>
          ) : null}
        </div>
        <RecordStatusPill status={record.status} />
      </div>
      <FieldRow
        label="Host"
        value={record.name}
        copied={copiedField === 'name'}
        onCopy={() => copy('name', record.name)}
      />
      <FieldRow
        label="Value"
        value={record.value}
        copied={copiedField === 'value'}
        onCopy={() => copy('value', record.value)}
      />
    </li>
  );
}

function FieldRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid grid-cols-[60px_1fr_36px] gap-3 items-start py-1">
      <span className="text-[11px] text-[oklch(1_0_0)]/45 pt-1">{label}</span>
      <span className="text-xs font-mono text-[oklch(1_0_0)]/85 break-all leading-relaxed">{value}</span>
      <button
        onClick={onCopy}
        className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[oklch(1_0_0_/_0.05)] text-[oklch(1_0_0)]/45 hover:text-[oklch(1_0_0)]/75 transition-colors"
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <Check className="w-3 h-3 text-[var(--color-unusonic-success)]" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

function RecordStatusPill({ status }: { status: DnsRecord['status'] }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] border border-[var(--color-unusonic-success)]/25">
        <Check className="w-2.5 h-2.5" />
        Verified
      </span>
    );
  }
  if (status === 'failure') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)] border border-[var(--color-unusonic-error)]/25">
        <AlertCircle className="w-2.5 h-2.5" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[oklch(1_0_0_/_0.05)] text-[oklch(1_0_0)]/55 border border-[oklch(1_0_0_/_0.08)]">
      <Clock className="w-2.5 h-2.5" />
      Waiting
    </span>
  );
}
