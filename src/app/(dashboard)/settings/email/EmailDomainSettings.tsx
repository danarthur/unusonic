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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] border border-[var(--color-unusonic-success)]/20">
        <CheckCircle2 className="w-3 h-3" />
        Verified
      </span>
    );
  }
  if (status === 'failure' || status === 'temporary_failure') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)] border border-[var(--color-unusonic-error)]/20">
        <AlertCircle className="w-3 h-3" />
        {status === 'temporary_failure' ? 'Temporary failure' : 'Failed'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)] border border-[var(--color-unusonic-warning)]/20">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}

function DmarcBadge({ dmarcStatus }: { dmarcStatus: string | null }) {
  if (dmarcStatus === 'configured') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] border border-[var(--color-unusonic-success)]/20">
        <CheckCircle2 className="w-3 h-3" />
        DMARC detected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)] border border-[var(--color-unusonic-warning)]/20">
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
    <div className="grid grid-cols-[80px_60px_1fr_1fr_40px] gap-3 items-start py-3 border-b border-[var(--stage-border)] last:border-0">
      <span className="text-xs font-medium text-[var(--stage-text-secondary)] pt-0.5">{label}</span>
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--stage-surface-nested)] text-[var(--stage-text-secondary)] border border-[var(--stage-border)] w-fit">
        {type}
      </span>
      <span className="text-xs font-mono text-[var(--stage-text-primary)] break-all">{name}</span>
      <span className="text-xs font-mono text-[var(--stage-text-primary)] break-all">{value}</span>
      <button
        onClick={handleCopy}
        className="flex items-center justify-center w-8 h-8 rounded-[var(--stage-radius-button)] transition-colors hover:bg-[var(--stage-surface-hover)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] shrink-0"
        title="Copy value"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[var(--color-unusonic-success)]" /> : <Copy className="w-3.5 h-3.5" />}
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

  // ── Unusonic DMARC record value ───────────────────────────────────────────────

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
          className="flex items-start gap-2 px-4 py-3 rounded-xl bg-[var(--color-unusonic-error)]/10 border border-[var(--color-unusonic-error)]/20 text-sm text-[var(--color-unusonic-error)]"
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
            className="stage-panel p-6 space-y-5"
          >
            <div className="flex items-center gap-2 text-[var(--stage-text-secondary)] text-sm">
              <Globe className="w-4 h-4 shrink-0" />
              <span>Add a custom sending domain to send emails from your brand.</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--stage-text-secondary)] mb-1.5 tracking-tight">
                  Sending domain
                </label>
                <input
                  type="text"
                  placeholder="mail.yourdomain.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--stage-surface-nested)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-border-focus)] transition-all font-mono"
                />
                <p className="mt-1 text-xs text-[var(--stage-text-secondary)]">
                  Use a subdomain like mail.yourdomain.com to avoid conflicts with your existing email.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--stage-text-secondary)] mb-1.5 tracking-tight">
                    From name
                  </label>
                  <input
                    type="text"
                    placeholder="Invisible Touch Events"
                    value={fromNameInput}
                    onChange={(e) => setFromNameInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--stage-surface-nested)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-border-focus)] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--stage-text-secondary)] mb-1.5 tracking-tight">
                    Local-part (before @)
                  </label>
                  <input
                    type="text"
                    placeholder="hello"
                    value={fromLocalpartInput}
                    onChange={(e) => setFromLocalpartInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--stage-surface-nested)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-border-focus)] transition-all font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!domainInput.trim() || isPending}
                className="px-4 py-2 rounded-[var(--stage-radius-button)] text-sm font-medium tracking-tight bg-ceramic text-obsidian hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            <div className="stage-panel p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0" />
                  <span className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] font-mono">{domain}</span>
                  {status && <StatusPill status={status} />}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleVerify}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--stage-surface-hover)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] border border-[var(--stage-border)] transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${isPending ? 'animate-spin' : ''}`} />
                    Check verification
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/20 border border-[var(--color-unusonic-error)]/20 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {/* DNS records */}
            <div className="stage-panel p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold tracking-tight text-[var(--stage-text-primary)]">DNS records</h3>
                <p className="mt-0.5 text-xs text-[var(--stage-text-secondary)]">
                  Add these records to your DNS provider. Verification can take up to 72 hours.
                </p>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[80px_60px_1fr_1fr_40px] gap-3 pb-2 border-b border-[var(--stage-border)]">
                {['Type', 'DNS', 'Host', 'Value', ''].map((h) => (
                  <span key={h} className="text-[10px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">{h}</span>
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

              {/* Unusonic-generated DMARC record */}
              <DnsRecordRow
                label="DMARC"
                type="TXT"
                name={dmarcRecordName}
                value={dmarcRecordValue}
              />

              {/* DMARC status */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--stage-border)]">
                <span className="text-xs text-[var(--stage-text-secondary)]">DMARC status:</span>
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
            className="stage-panel p-5 space-y-4"
          >
            {/* Domain + status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-[var(--color-unusonic-success)] shrink-0" />
                <span className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] font-mono">{domain}</span>
                <StatusPill status="verified" />
              </div>
              <button
                onClick={handleRemove}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/20 border border-[var(--color-unusonic-error)]/20 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>

            {/* From address preview */}
            <div className="stage-panel px-4 py-3">
              <p className="text-xs text-[var(--stage-text-secondary)] mb-1">Emails will be sent from:</p>
              <p className="text-sm font-mono text-[var(--stage-text-primary)] tracking-tight">
                {fromName && `${fromName} `}
                &lt;{fromLocalpart}@{domain}&gt;
              </p>
            </div>

            {/* DMARC status */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--stage-text-secondary)]">DMARC:</span>
              <DmarcBadge dmarcStatus={dmarcStatus} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
