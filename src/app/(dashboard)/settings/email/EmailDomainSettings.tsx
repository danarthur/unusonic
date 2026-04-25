'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Copy,
  RefreshCw,
  Trash2,
  Globe,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  Cloud,
  Send,
} from 'lucide-react';
import {
  addSendingDomain,
  verifySendingDomain,
  removeSendingDomain,
  preflightSendingDomain,
  detectDnsProvider,
  sendVerificationTestEmail,
  type PreflightFinding,
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

import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
const spring = STAGE_HEAVY;

// ── Live polling cadence ───────────────────────────────────────────────────────
//
// Resend's domain.updated webhook is the canonical signal, but we ALSO poll
// from the client while the user is on the page so verification feedback is
// instant (Marcus's "live status of EACH individual record" ask, and Resend's
// own design blog credits this pattern with their conversion lift).
//
// Cadence: aggressive for the first 5 minutes (30s), then back off to 60s
// for the next 30 minutes, then stop. After 35 minutes the user has either
// finished or walked away — let the webhook handle long-tail propagation.
const POLL_FAST_INTERVAL_MS = 30 * 1000;
const POLL_FAST_DURATION_MS = 5 * 60 * 1000;
const POLL_SLOW_INTERVAL_MS = 60 * 1000;
const POLL_TOTAL_DURATION_MS = 35 * 60 * 1000;

// ── Status pills ────────────────────────────────────────────────────────────────

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

function RecordStatusPill({ status }: { status: string }) {
  if (status === 'verified') {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 14,
          height: 14,
          background: 'var(--color-unusonic-success)',
          color: 'oklch(0.16 0 0)',
        }}
        title="Verified"
        aria-label="Verified"
      >
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'failure' || status === 'temporary_failure') {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 14,
          height: 14,
          background: 'var(--color-unusonic-error)',
          color: 'oklch(0.16 0 0)',
        }}
        title={status === 'temporary_failure' ? 'Temporary failure' : 'Failed'}
        aria-label={status === 'temporary_failure' ? 'Temporary failure' : 'Failed'}
      >
        <AlertCircle className="w-2.5 h-2.5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: 14,
        height: 14,
        border: '1.5px solid var(--color-unusonic-warning)',
        color: 'var(--color-unusonic-warning)',
      }}
      title="Pending"
      aria-label="Pending"
    >
      <Clock className="w-2 h-2" strokeWidth={2.5} />
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

// ── DNS record row (with per-record status pill) ───────────────────────────────

function DnsRecordRow({
  label,
  type,
  name,
  value,
  recordStatus,
}: {
  label: string;
  type: string;
  name: string;
  value: string;
  /** Per-record status from Resend's response. Omitted (no pill rendered) for
   *  records we generate ourselves like the Unusonic-suggested DMARC. */
  recordStatus?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="grid grid-cols-[80px_60px_1fr_1fr_56px] gap-3 items-start py-3 border-b border-[var(--stage-border)] last:border-0">
      <span className="text-xs font-medium text-[var(--stage-text-secondary)] pt-0.5 inline-flex items-center gap-1.5">
        {label}
      </span>
      <span className="inline-flex items-center px-1.5 py-0.5 rounded stage-badge-text font-mono bg-[var(--ctx-well)] text-[var(--stage-text-secondary)] border border-[var(--stage-border)] w-fit">
        {type}
      </span>
      <span className="text-xs font-mono text-[var(--stage-text-primary)] break-all">{name}</span>
      <span className="text-xs font-mono text-[var(--stage-text-primary)] break-all">{value}</span>
      <div className="flex items-center justify-end gap-1.5 shrink-0">
        {recordStatus && <RecordStatusPill status={recordStatus} />}
        <button
          onClick={handleCopy}
          className="stage-hover overflow-hidden flex items-center justify-center w-7 h-7 rounded-[var(--stage-radius-button)] transition-colors text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] shrink-0"
          title="Copy value"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-[var(--color-unusonic-success)]" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Failure copy with common causes (collapsible details) ──────────────────────

function FailureGuidance({ providerLabel }: { providerLabel: string | null }) {
  const [showDetails, setShowDetails] = useState(false);
  const causes = [
    {
      title: 'DNS hasn\u2019t propagated yet',
      body: 'DNS changes can take up to 24 hours to reach all servers. We\u2019re still checking — this resolves on its own most of the time.',
    },
    {
      title: 'Cloudflare proxy is on (orange cloud)',
      body: 'CNAMEs proxied through Cloudflare\u2019s HTTP layer never reach the email vendor. Set the proxy status to "DNS only" (grey cloud) for our records.',
    },
    {
      title: 'Records added on the wrong domain level',
      body: 'Some registrars auto-append the domain. If your record value ends in a duplicated domain (e.g. "value.yourdomain.com"), remove the trailing copy.',
    },
    {
      title: 'Existing records conflict with ours',
      body: 'You may already have an SPF or DMARC record on the apex domain. We use a subdomain to avoid this — check that you added our records on the correct subdomain, not the apex.',
    },
  ];

  return (
    <div className="rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] p-4 space-y-2">
      <p className="text-sm text-[var(--stage-text-primary)] leading-relaxed">
        We couldn\u2019t verify some records yet.{' '}
        {providerLabel === 'Cloudflare'
          ? 'Cloudflare orange-cloud proxy is the most common cause for the records we just asked you to add.'
          : 'DNS propagation usually finishes within an hour but can take up to 24.'}{' '}
        We\u2019ll keep checking automatically.
      </p>
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] inline-flex items-center gap-1"
      >
        <ChevronDown
          className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`}
        />
        {showDetails ? 'Hide details' : 'Show common causes'}
      </button>
      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="mt-2 space-y-2 overflow-hidden"
          >
            {causes.map((c) => (
              <li key={c.title} className="text-xs leading-relaxed">
                <span className="font-medium text-[var(--stage-text-primary)] block">
                  {c.title}
                </span>
                <span className="text-[var(--stage-text-secondary)]">{c.body}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cloudflare orange-cloud warning banner ─────────────────────────────────────
//
// Field Expert convergence: Cloudflare-proxied CNAMEs never reach the email
// vendor — DKIM records resolve to Cloudflare's edge, fail verification
// silently. Universal across SES, Resend, Postmark, SendGrid. Worth a
// dedicated callout when we detect Cloudflare nameservers.

function CloudflareWarning() {
  return (
    <div
      className="rounded-[var(--stage-radius-input)] border border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/5 p-3 flex items-start gap-2"
      role="note"
    >
      <Cloud className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-unusonic-warning)]" />
      <div className="text-xs leading-relaxed">
        <span className="font-medium text-[var(--stage-text-primary)] block mb-0.5">
          Cloudflare detected
        </span>
        <span className="text-[var(--stage-text-secondary)]">
          For each CNAME record we ask you to add, set the proxy status to{' '}
          <strong className="text-[var(--stage-text-primary)]">DNS only</strong>{' '}
          (grey cloud icon, not orange). Cloudflare\u2019s proxy mode breaks DKIM
          verification \u2014 this is the #1 cause of failed setups.
        </span>
      </div>
    </div>
  );
}

// ── Before/after preview pane ──────────────────────────────────────────────────
//
// Marcus's "dopamine hit" — show what the bride's mom will see in her inbox
// after verification. Updates live as the user types in the wizard inputs.

function SenderPreview({
  domainInput,
  fromNameInput,
  fromLocalpartInput,
}: {
  domainInput: string;
  fromNameInput: string;
  fromLocalpartInput: string;
}) {
  const trimmedDomain = domainInput.trim().toLowerCase();
  const trimmedName = fromNameInput.trim();
  const trimmedLocal = fromLocalpartInput.trim() || 'hello';
  const validDomain = trimmedDomain && trimmedDomain.split('.').length >= 3;

  return (
    <div className="rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] p-4">
      <p className="text-xs text-[var(--stage-text-secondary)] mb-3">
        How clients see your emails
      </p>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5">
          <p className="stage-label text-[var(--stage-text-tertiary)] uppercase tracking-wide">
            Today
          </p>
          <p className="text-[var(--stage-text-secondary)] font-mono break-all">
            Unusonic
          </p>
          <p className="text-[var(--stage-text-tertiary)] font-mono break-all">
            hello@unusonic.com
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="stage-label text-[var(--color-unusonic-success)] uppercase tracking-wide">
            After verification
          </p>
          <p className="text-[var(--stage-text-primary)] font-mono break-all">
            {trimmedName || 'Your name'}
          </p>
          <p
            className={`font-mono break-all ${
              validDomain
                ? 'text-[var(--stage-text-primary)]'
                : 'text-[var(--stage-text-tertiary)]'
            }`}
          >
            {trimmedLocal}@{validDomain ? trimmedDomain : 'mail.yourdomain.com'}
          </p>
        </div>
      </div>
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

  // Preflight DNS findings
  const [preflightFindings, setPreflightFindings] = useState<PreflightFinding[]>([]);
  const [preflightChecking, setPreflightChecking] = useState(false);

  // Provider detection (Cloudflare warning + future registrar-specific copy)
  const [providerLabel, setProviderLabel] = useState<string | null>(null);

  // Send-test feedback
  const [testSendStatus, setTestSendStatus] = useState<
    | { state: 'idle' }
    | { state: 'sending' }
    | { state: 'sent'; recipient: string }
    | { state: 'error'; message: string }
  >({ state: 'idle' });

  // Polling state
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const pollStartRef = useRef<number | null>(null);

  function runPreflight(value: string) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.split('.').length < 3) {
      setPreflightFindings([]);
      setProviderLabel(null);
      return;
    }
    setPreflightChecking(true);
    Promise.all([preflightSendingDomain(trimmed), detectDnsProvider(trimmed)])
      .then(([preflight, providerResult]) => {
        if (preflight.ok) {
          setPreflightFindings(preflight.findings);
        } else {
          setPreflightFindings([]);
        }
        if (providerResult.ok) {
          setProviderLabel(providerResult.label);
        }
      })
      .catch(() => setPreflightFindings([]))
      .finally(() => setPreflightChecking(false));
  }

  // Error / feedback
  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // ── Computed state key ──────────────────────────────────────────────────────

  const stateKey =
    !domain ? 'none'
    : status === 'verified' ? 'verified'
    : 'pending';

  const allRecordsVerified = dnsRecords.length > 0 && dnsRecords.every((r) => r.status === 'verified');
  const hasRecordFailure = dnsRecords.some((r) => r.status === 'failure');
  const isCloudflare = providerLabel === 'Cloudflare';

  // ── DMARC record value ──────────────────────────────────────────────────────
  const dmarcRecordValue =
    'v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-aggregate@unusonic.com; adkim=r; aspf=r;';
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
      const cleanedDomain = domainInput.toLowerCase().trim();
      setDomain(cleanedDomain);
      setStatus('pending');
      setFromName(fromNameInput || null);
      setFromLocalpart(fromLocalpartInput || 'hello');
      setDnsRecords(result.dnsRecords);
      setDomainInput('');
      setFromNameInput('');
      setFromLocalpartInput('hello');
      // Detect provider for the now-active domain so the warning appears
      // without waiting for an onBlur cycle.
      detectDnsProvider(cleanedDomain).then((p) => {
        if (p.ok) setProviderLabel(p.label);
      });
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
      setLastChecked(new Date());
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
      setLastChecked(null);
      setTestSendStatus({ state: 'idle' });
    });
  }

  function handleSendTest() {
    setTestSendStatus({ state: 'sending' });
    sendVerificationTestEmail()
      .then((result) => {
        if (result.ok) {
          setTestSendStatus({ state: 'sent', recipient: result.recipientEmail });
        } else {
          setTestSendStatus({ state: 'error', message: result.error });
        }
      })
      .catch((err) =>
        setTestSendStatus({
          state: 'error',
          message: err instanceof Error ? err.message : 'Failed to send test',
        }),
      );
  }

  // ── Live polling while pending ──────────────────────────────────────────────
  //
  // Auto-fires verifySendingDomain on the cadence above. Stops once verified
  // or the total duration elapses. The webhook handler picks up long-tail
  // verifications when the user has navigated away — this client-side
  // polling is the conversion lever for users still on the page.
  useEffect(() => {
    if (stateKey !== 'pending') return;
    if (allRecordsVerified) return;

    if (pollStartRef.current === null) {
      pollStartRef.current = Date.now();
    }

    const tick = () => {
      const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
      if (elapsed > POLL_TOTAL_DURATION_MS) {
        return;
      }
      // Skip this tick if a manual transition is in flight.
      if (isPending) return;
      verifySendingDomain()
        .then((result) => {
          if (result.ok) {
            setStatus(result.status);
            setDmarcStatus(result.dmarcStatus);
            if (result.dnsRecords.length > 0) {
              setDnsRecords(result.dnsRecords);
            }
            setLastChecked(new Date());
          }
        })
        .catch(() => {
          // Network blip — silent; next tick will retry.
        });
    };

    const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
    const interval =
      elapsed < POLL_FAST_DURATION_MS ? POLL_FAST_INTERVAL_MS : POLL_SLOW_INTERVAL_MS;
    const handle = setInterval(tick, interval);

    return () => {
      clearInterval(handle);
    };
  }, [stateKey, allRecordsVerified, isPending]);

  // Reset poll start when transitioning back to a pending state from elsewhere.
  useEffect(() => {
    if (stateKey === 'verified' || stateKey === 'none') {
      pollStartRef.current = null;
    }
  }, [stateKey]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={spring}
          className="flex items-start gap-2 px-4 py-3 rounded-xl bg-[var(--stage-surface)] border border-[oklch(1_0_0_/_0.08)] border-l-[3px] border-l-[var(--color-unusonic-error)] text-sm text-[var(--color-unusonic-error)]"
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
                  onBlur={(e) => runPreflight(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)] transition-[border-color,box-shadow] font-mono"
                />
                <p className="mt-1 text-xs text-[var(--stage-text-secondary)]">
                  Use a subdomain like mail.yourdomain.com to avoid conflicts with your existing email.
                </p>

                {preflightChecking && (
                  <p className="mt-2 text-xs text-[var(--stage-text-secondary)] inline-flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Checking your domain\u2026
                  </p>
                )}

                {preflightFindings.length > 0 && (
                  <ul className="mt-2 space-y-1.5" aria-label="DNS preflight findings">
                    {preflightFindings.map((finding) => (
                      <li
                        key={finding.code}
                        className={`text-xs leading-relaxed flex items-start gap-1.5 ${
                          finding.severity === 'warning'
                            ? 'text-[var(--color-unusonic-warning)]'
                            : 'text-[var(--stage-text-secondary)]'
                        }`}
                      >
                        {finding.severity === 'warning' ? (
                          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5 text-[var(--color-unusonic-success)]" />
                        )}
                        <span>{finding.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
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
                    className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)] transition-[border-color,box-shadow]"
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
                    className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)] transition-[border-color,box-shadow] font-mono"
                  />
                </div>
              </div>

              {/* Before/after preview — Marcus's dopamine hit */}
              <SenderPreview
                domainInput={domainInput}
                fromNameInput={fromNameInput}
                fromLocalpartInput={fromLocalpartInput}
              />

              <button
                onClick={handleAdd}
                disabled={!domainInput.trim() || isPending}
                className="px-4 py-2 rounded-[var(--stage-radius-button)] text-sm font-medium tracking-tight stage-btn stage-btn-primary disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Adding\u2026' : 'Set up sending'}
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
                  <span className="text-xs text-[var(--stage-text-tertiary)] inline-flex items-center gap-1.5">
                    <RefreshCw
                      className={`w-3 h-3 ${isPending ? 'animate-spin text-[var(--stage-text-secondary)]' : ''}`}
                    />
                    {lastChecked
                      ? `Last checked ${Math.max(0, Math.round((Date.now() - lastChecked.getTime()) / 1000))}s ago`
                      : 'Checking\u2026'}
                  </span>
                  <button
                    onClick={handleVerify}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] border border-[var(--stage-border)] transition-colors disabled:opacity-45"
                  >
                    Check now
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/20 border border-[var(--color-unusonic-error)]/20 transition-colors disabled:opacity-45"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {/* Cloudflare warning + failure guidance */}
            {isCloudflare && <CloudflareWarning />}
            {hasRecordFailure && <FailureGuidance providerLabel={providerLabel} />}

            {/* DNS records */}
            <div className="stage-panel p-5">
              <div className="mb-4">
                <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">DNS records</h3>
                <p className="mt-0.5 text-xs text-[var(--stage-text-secondary)]">
                  Add these records to your DNS provider. Verification can take up to 72 hours \u2014 we keep checking.
                </p>
              </div>

              <div className="grid grid-cols-[80px_60px_1fr_1fr_56px] gap-3 pb-2 border-b border-[var(--stage-border)]">
                {['Type', 'DNS', 'Host', 'Value', ''].map((h) => (
                  <span key={h} className="stage-label text-[var(--stage-text-secondary)]">{h}</span>
                ))}
              </div>

              {dnsRecords
                .filter((r) => r.record !== 'DMARC')
                .map((r, i) => (
                  <DnsRecordRow
                    key={i}
                    label={r.record}
                    type={r.type}
                    name={r.name}
                    value={r.value}
                    recordStatus={r.status}
                  />
                ))}

              <DnsRecordRow
                label="DMARC"
                type="TXT"
                name={dmarcRecordName}
                value={dmarcRecordValue}
              />

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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-[var(--color-unusonic-success)] shrink-0" />
                <span className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] font-mono">{domain}</span>
                <StatusPill status="verified" />
              </div>
              <button
                onClick={handleRemove}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/20 border border-[var(--color-unusonic-error)]/20 transition-colors disabled:opacity-45"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>

            <div className="stage-panel px-4 py-3">
              <p className="text-xs text-[var(--stage-text-secondary)] mb-1">Emails will be sent from:</p>
              <p className="text-sm font-mono text-[var(--stage-text-primary)] tracking-tight">
                {fromName && `${fromName} `}
                &lt;{fromLocalpart}@{domain}&gt;
              </p>
            </div>

            {/* Send-a-test row */}
            <div className="rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] p-3 flex items-center justify-between gap-3">
              <div className="text-xs leading-relaxed">
                <span className="text-[var(--stage-text-primary)] block font-medium">
                  Verify it works in your inbox
                </span>
                <span className="text-[var(--stage-text-secondary)]">
                  We\u2019ll send a test email to your account address. Check the From line and DKIM signature.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {testSendStatus.state === 'sent' && (
                  <span className="text-xs text-[var(--color-unusonic-success)] inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Sent to {testSendStatus.recipient}
                  </span>
                )}
                {testSendStatus.state === 'error' && (
                  <span className="text-xs text-[var(--color-unusonic-error)] inline-flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {testSendStatus.message}
                  </span>
                )}
                <button
                  onClick={handleSendTest}
                  disabled={testSendStatus.state === 'sending'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] border border-[var(--stage-border)] transition-colors disabled:opacity-45"
                >
                  {testSendStatus.state === 'sending' ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  {testSendStatus.state === 'sending' ? 'Sending\u2026' : 'Send test'}
                </button>
              </div>
            </div>

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
