'use client';

/**
 * Rescue handoff history — small list under the DNS records grid showing the
 * owner who they sent records to, when, and where each handoff stands.
 *
 * Actions per row: resend (rotates token, sends fresh email), revoke
 * (invalidates the public link).
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

import { useEffect, useState, useTransition } from 'react';
import { Check, Clock, RotateCcw, Trash2, AlertCircle, Mail } from 'lucide-react';
import {
  getRescueHandoffHistory,
  resendRescueHandoff,
  revokeRescueHandoff,
  type RescueHandoffSummary,
} from '@/features/org-management/api/rescue-handoff-history';

interface RescueHandoffHistoryProps {
  /** Bumped by the parent after sending a fresh handoff to trigger a refetch. */
  refreshKey?: number;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusOf(h: RescueHandoffSummary): 'verified' | 'revoked' | 'expired' | 'pending' {
  if (h.confirmedAt) return 'verified';
  if (h.revokedAt) return 'revoked';
  if (new Date(h.expiresAt) < new Date()) return 'expired';
  return 'pending';
}

export function RescueHandoffHistory({ refreshKey = 0 }: RescueHandoffHistoryProps) {
  const [items, setItems] = useState<RescueHandoffSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function refetch() {
    const result = await getRescueHandoffHistory();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems(result.handoffs);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getRescueHandoffHistory();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(result.handoffs);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function handleResend(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await resendRescueHandoff(id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await refetch();
    });
  }

  function handleRevoke(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await revokeRescueHandoff(id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await refetch();
    });
  }

  if (items === null) return null;
  if (items.length === 0) return null;

  return (
    <div className="stage-panel p-5">
      <div className="mb-3">
        <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
          Sent to your tech person
        </h3>
        <p className="mt-0.5 text-xs text-[var(--stage-text-secondary)]">
          We&apos;ll notify you when records are verified.
        </p>
      </div>

      {error ? (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--color-unusonic-error)]/10 border border-[var(--color-unusonic-error)]/20 text-xs text-[var(--color-unusonic-error)]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((h) => {
          const status = statusOf(h);
          const isPending = pendingId === h.id;
          return (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-[var(--ctx-well)] border border-[var(--stage-border)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[var(--stage-text-secondary)] shrink-0" />
                  <span className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                    {h.recipientName ? `${h.recipientName} · ` : ''}
                    {h.recipient}
                  </span>
                </div>
                <div className="mt-0.5 ml-5 text-[11px] text-[var(--stage-text-secondary)] flex items-center gap-2">
                  <StatusChip status={status} />
                  <span>·</span>
                  <span>{formatRelative(h.sentAt)}</span>
                  {h.hasNote ? (
                    <>
                      <span>·</span>
                      <span>with note</span>
                    </>
                  ) : null}
                </div>
              </div>
              {status === 'pending' || status === 'expired' ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleResend(h.id)}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded-[var(--stage-radius-button)] text-[11px] font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45"
                    title="Send again with a fresh link"
                  >
                    <RotateCcw className="w-3 h-3" /> Resend
                  </button>
                  {status === 'pending' ? (
                    <button
                      onClick={() => handleRevoke(h.id)}
                      disabled={isPending}
                      className="flex items-center gap-1 px-2 py-1 rounded-[var(--stage-radius-button)] text-[11px] font-medium text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] transition-colors disabled:opacity-45"
                      title="Invalidate the link"
                    >
                      <Trash2 className="w-3 h-3" /> Revoke
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusChip({ status }: { status: 'verified' | 'revoked' | 'expired' | 'pending' }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--color-unusonic-success)]">
        <Check className="w-3 h-3" /> Verified
      </span>
    );
  }
  if (status === 'revoked') {
    return <span className="text-[var(--stage-text-secondary)]">Revoked</span>;
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--color-unusonic-warning)]">
        <AlertCircle className="w-3 h-3" /> Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--stage-text-secondary)]">
      <Clock className="w-3 h-3" /> Sent
    </span>
  );
}
