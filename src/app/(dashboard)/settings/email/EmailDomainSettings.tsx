'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, RefreshCw, Trash2, Globe, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import {
  addSendingDomain,
  verifySendingDomain,
  removeSendingDomain,
} from '@/features/org-management/api/email-domain-actions';
import type { DnsRecord } from '@/shared/api/resend/domains';

// ── Props ──────────────────────────────────────────────────────────────────────

interface EmailDomainSettingsProps {
  workspaceId: string;
  initialDomain: string | null;
  initialStatus: string | null;
  initialFromName: string | null;
  initialFromLocalpart: string | null;
  initialDmarcStatus: string | null;
}

// ── Spring preset ──────────────────────────────────────────────────────────────

const spring = { type: 'spring' as const, stiffness: 200, damping: 20 };

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" />
        Verified
      </span>
    );
  }
  if (status === 'failure' || status === 'temporary_failure') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20">
        <AlertCircle className="w-3 h-3" />
        {status === 'temporary_failure' ? 'Temporary failure' : 'Failed'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}

function DmarcBadge({ dmarcStatus }: { dmarcStatus: string | null }) {
  if (dmarcStatus === 'configured') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" />
        DMARC detected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <AlertCircle className="w-3 h-3" />
      Add DMARC record
    </span>
  );
}

// ── DNS record row ─────────────────────────────────────────────────────────────

function DnsRecordRow({ label, type, name, value }: {
  label: string;
  type: string;
  name: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="grid grid-cols-[80px_60px_1fr_1fr_40px] gap-3 items-start py-3 border-b border-[var(--glass-border)] last:border-0">
      <span className="text-xs font-medium text-ink-muted pt-0.5">{label}</span>
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--glass-bg)] text-ink-muted border border-[var(--glass-border)] w-fit">
        {type}
      </span>
      <span className="text-xs font-mono text-ink break-all">{name}</span>
      <span className="text-xs font-mono text-ink break-all">{value}</span>
      <button
        onClick={handleCopy}
        className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--glass-bg-hover)] text-ink-muted hover:text-ceramic shrink-0"
        title="Copy value"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EmailDomainSettings({
  initialDomain,
  initialStatus,
  initialFromName,
  initialFromLocalpart,
  initialDmarcStatus,
}: EmailDomainSettingsProps) {
  // Domain state
  const [domain, setDomain] = useState<string | null>(initialDomain);
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [fromName, setFromName] = useState<string | null>(initialFromName);
  const [fromLocalpart, setFromLocalpart] = useState<string>(initialFromLocalpart ?? 'hello');
  const [dmarcStatus, setDmarcStatus] = useState<string | null>(initialDmarcStatus);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);

  // Form inputs (State A)
  const [domainInput, setDomainInput] = useState('');
  const [fromNameInput, setFromNameInput] = useState('');
  const [fromLocalpartInput, setFromLocalpartInput] = useState('hello');

  // Error / feedback
  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // ── Computed state key ──────────────────────────────────────────────────────

  const stateKey =
    !domain ? 'none'
    : status === 'verified' ? 'verified'
    : 'pending';

  // ── Signal DMARC record value ───────────────────────────────────────────────

  const dmarcRecordValue = 'v=DMARC1; p=none; sp=none; adkim=s; aspf=r;';
  const dmarcRecordName = domain ? `_dmarc.${domain}` : '_dmarc.yourdomain.com';

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addSendingDomain(domainInput, fromNameInput, fromLocalpartInput);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDomain(domainInput.toLowerCase().trim());
      setStatus('pending');
      setFromName(fromNameInput || null);
      setFromLocalpart(fromLocalpartInput || 'hello');
      setDnsRecords(result.dnsRecords);
      setDomainInput('');
      setFromNameInput('');
      setFromLocalpartInput('hello');
    });
  }

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifySendingDomain();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(result.status);
      setDmarcStatus(result.dmarcStatus);
      if (result.dnsRecords.length > 0) {
        setDnsRecords(result.dnsRecords);
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeSendingDomain();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDomain(null);
      setStatus(null);
      setFromName(null);
      setFromLocalpart('hello');
      setDmarcStatus(null);
      setDnsRecords([]);
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={spring}
          className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {/* ── State A: No domain ──────────────────────────────────────────── */}
        {stateKey === 'none' && (
          <motion.div
            key="state-none"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={spring}
            className="liquid-card bg-[var(--glass-bg)] border border-[var(--glass-border)] p-6 space-y-5"
          >
            <div className="flex items-center gap-2 text-ink-muted text-sm">
              <Globe className="w-4 h-4 shrink-0" />
              <span>Add a custom sending domain to send emails from your brand.</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1.5 tracking-tight">
                  Sending domain
                </label>
                <input
                  type="text"
                  placeholder="mail.yourdomain.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-[oklch(0.7_0.15_250_/0.4)] transition-all font-mono"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Use a subdomain like mail.yourdomain.com to avoid conflicts with your existing email.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5 tracking-tight">
                    From name
                  </label>
                  <input
                    type="text"
                    placeholder="Invisible Touch Events"
                    value={fromNameInput}
                    onChange={(e) => setFromNameInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-[oklch(0.7_0.15_250_/0.4)] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5 tracking-tight">
                    Local-part (before @)
                  </label>
                  <input
                    type="text"
                    placeholder="hello"
                    value={fromLocalpartInput}
                    onChange={(e) => setFromLocalpartInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-[oklch(0.7_0.15_250_/0.4)] transition-all font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!domainInput.trim() || isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium tracking-tight bg-ceramic text-obsidian hover:bg-[oklch(0.95_0_0)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Adding…' : 'Add domain'}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── State B: Pending / Failed ───────────────────────────────────── */}
        {stateKey === 'pending' && (
          <motion.div
            key="state-pending"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={spring}
            className="space-y-4"
          >
            {/* Header */}
            <div className="liquid-card bg-[var(--glass-bg)] border border-[var(--glass-border)] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-ink-muted shrink-0" />
                  <span className="text-sm font-medium tracking-tight text-ink font-mono">{domain}</span>
                  {status && <StatusPill status={status} />}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleVerify}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tracking-tight bg-[var(--glass-bg-hover)] text-ink-muted hover:text-ceramic border border-[var(--glass-border)] transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${isPending ? 'animate-spin' : ''}`} />
                    Check verification
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tracking-tight bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {/* DNS records */}
            <div className="liquid-card bg-[var(--glass-bg)] border border-[var(--glass-border)] p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold tracking-tight text-ink">DNS records</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Add these records to your DNS provider. Verification can take up to 72 hours.
                </p>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[80px_60px_1fr_1fr_40px] gap-3 pb-2 border-b border-[var(--glass-border)]">
                {['Type', 'DNS', 'Host', 'Value', ''].map((h) => (
                  <span key={h} className="text-[10px] font-medium text-ink-muted uppercase tracking-wider">{h}</span>
                ))}
              </div>

              {/* Resend-provided records (SPF, DKIM, MX) */}
              {dnsRecords
                .filter((r) => r.record !== 'DMARC')
                .map((r, i) => (
                  <DnsRecordRow
                    key={i}
                    label={r.record}
                    type={r.type}
                    name={r.name}
                    value={r.value}
                  />
                ))}

              {/* Signal-generated DMARC record */}
              <DnsRecordRow
                label="DMARC"
                type="TXT"
                name={dmarcRecordName}
                value={dmarcRecordValue}
              />

              {/* DMARC status */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--glass-border)]">
                <span className="text-xs text-ink-muted">DMARC status:</span>
                <DmarcBadge dmarcStatus={dmarcStatus} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── State C: Verified ───────────────────────────────────────────── */}
        {stateKey === 'verified' && (
          <motion.div
            key="state-verified"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={spring}
            className="liquid-card bg-[var(--glass-bg)] border border-[var(--glass-border)] p-5 space-y-4"
          >
            {/* Domain + status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium tracking-tight text-ink font-mono">{domain}</span>
                <StatusPill status="verified" />
              </div>
              <button
                onClick={handleRemove}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tracking-tight bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>

            {/* From address preview */}
            <div className="px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
              <p className="text-xs text-ink-muted mb-1">Emails will be sent from:</p>
              <p className="text-sm font-mono text-ceramic tracking-tight">
                {fromName && `${fromName} `}
                &lt;{fromLocalpart}@{domain}&gt;
              </p>
            </div>

            {/* DMARC status */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">DMARC:</span>
              <DmarcBadge dmarcStatus={dmarcStatus} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
