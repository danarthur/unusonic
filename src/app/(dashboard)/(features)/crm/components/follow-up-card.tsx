'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, MessageSquare, Mail, Clock, ChevronDown } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { computeStallSignal, type StallSignal } from '@/shared/lib/stall-signal';
import type { DealDetail } from '../actions/get-deal';
import {
  type FollowUpQueueItem,
  actOnFollowUp,
  snoozeFollowUp,
  dismissFollowUp,
  logFollowUpAction,
} from '../actions/follow-up-actions';

// =============================================================================
// Types
// =============================================================================

type FollowUpCardProps = {
  deal: DealDetail;
  queueItem: FollowUpQueueItem | null;
  proposal: any | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
};

type Channel = 'call' | 'sms' | 'email';

// =============================================================================
// Helpers
// =============================================================================

const REASON_TYPE_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  stall: {
    label: 'Stalling',
    color: 'var(--color-unusonic-warning)',
    bg: 'color-mix(in oklch, var(--color-unusonic-warning) 10%, transparent)',
  },
  engagement_hot: {
    label: 'Hot lead',
    color: 'var(--color-unusonic-success)',
    bg: 'color-mix(in oklch, var(--color-unusonic-success) 10%, transparent)',
  },
  deadline_proximity: {
    label: 'Deadline approaching',
    color: 'var(--color-unusonic-warning)',
    bg: 'color-mix(in oklch, var(--color-unusonic-warning) 10%, transparent)',
  },
  no_owner: {
    label: 'Unassigned',
    color: 'var(--stage-text-secondary)',
    bg: 'color-mix(in oklch, var(--stage-text-secondary) 10%, transparent)',
  },
  no_activity: {
    label: 'Inactive',
    color: 'var(--stage-text-secondary)',
    bg: 'color-mix(in oklch, var(--stage-text-secondary) 10%, transparent)',
  },
  proposal_bounced: {
    label: 'Bounced',
    color: 'var(--color-unusonic-error)',
    bg: 'color-mix(in oklch, var(--color-unusonic-error) 10%, transparent)',
  },
};

// Suggested action copy is provided directly by the cron engine as a full sentence.
// No lookup map needed — display queueItem.suggested_action as-is.

function draftSmsByReason(reasonType: string, clientName: string, dealTitle: string): string {
  const name = clientName ? `Hi ${clientName}, ` : 'Hi, ';
  switch (reasonType) {
    case 'engagement_hot':
      return `${name}saw you were looking at the proposal for ${dealTitle} — happy to walk through anything or answer questions.`;
    case 'proposal_bounced':
      return `${name}wanted to make sure you received the proposal for ${dealTitle}. Could you confirm the best email to send it to?`;
    case 'deadline_proximity':
      return `${name}the date for ${dealTitle} is coming up — wanted to check in and see where things stand.`;
    case 'no_activity':
    case 'stall':
      return `${name}just following up on ${dealTitle}. Let me know if you have any questions or if there's anything I can help with.`;
    default:
      return `${name}wanted to check in on ${dealTitle}. Let me know if there's anything you need.`;
  }
}

const SNOOZE_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
] as const;

const CHANNEL_ICONS: Record<Channel, typeof Phone> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
};

// =============================================================================
// FollowUpCard
// =============================================================================

export function FollowUpCard({
  deal,
  queueItem,
  proposal,
  clientPhone,
  clientEmail,
}: FollowUpCardProps) {
  const router = useRouter();

  // ── Stall-only fallback when no queue item ──
  const stallSignal = !queueItem
    ? computeStallSignal(deal, proposal, 0)
    : null;

  // Nothing to show
  if (!queueItem && (!stallSignal || !stallSignal.stalled)) return null;

  // Stall-only mode: simplified card (backward compatible)
  if (!queueItem && stallSignal?.stalled) {
    return (
      <StallOnlyCard
        deal={deal}
        stallSignal={stallSignal}
      />
    );
  }

  // Snoozed: show minimal indicator, not the full action card
  if (queueItem?.status === 'snoozed' && queueItem.snoozed_until) {
    const snoozedUntil = new Date(queueItem.snoozed_until);
    const label = snoozedUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return (
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          background: 'var(--stage-surface-elevated)',
          borderRadius: 'var(--stage-radius-panel, 12px)',
        }}
      >
        <Clock size={13} style={{ color: 'var(--stage-text-tertiary)' }} />
        <span className="text-xs" style={{ color: 'var(--stage-text-tertiary)' }}>
          Follow-up snoozed until {label}
        </span>
      </div>
    );
  }

  // Full follow-up card
  return (
    <FullFollowUpCard
      deal={deal}
      queueItem={queueItem!}
      clientPhone={clientPhone}
      clientEmail={clientEmail}
      onActionComplete={() => router.refresh()}
    />
  );
}

// =============================================================================
// StallOnlyCard — backward-compatible stall warning + log action button
// =============================================================================

function StallOnlyCard({ deal, stallSignal }: { deal: DealDetail; stallSignal: StallSignal }) {
  const router = useRouter();
  const [logFormOpen, setLogFormOpen] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        key="stall-fallback"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={STAGE_MEDIUM}
      >
        <StagePanel
          elevated
          className={cn(
            'px-5 py-4 border flex flex-col gap-3',
            stallSignal.urgent
              ? 'border-[var(--color-unusonic-warning)]/40 bg-[var(--color-unusonic-warning)]/10'
              : 'border-[oklch(1_0_0_/_0.10)]',
          )}
        >
          <div className="flex items-start gap-3">
            <Clock
              size={16}
              className={cn('mt-0.5 shrink-0', stallSignal.urgent ? 'text-[var(--color-unusonic-warning)]' : 'text-[var(--stage-text-secondary)]')}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className={cn('text-xs font-medium tracking-tight', stallSignal.urgent ? 'text-[var(--color-unusonic-warning)]' : 'text-[var(--stage-text-secondary)]')}>
                {stallSignal.urgent ? 'Urgent \u2014 ' : ''}{stallSignal.daysInStage} day{stallSignal.daysInStage !== 1 ? 's' : ''} at {stallSignal.stageName}
              </p>
              <p className="text-xs text-[var(--stage-text-tertiary)] mt-0.5">{stallSignal.suggestion}</p>
            </div>
          </div>

          {/* Log action button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLogFormOpen((v) => !v)}
              className="stage-label transition-colors"
              style={{ color: 'var(--stage-text-secondary)' }}
            >
              Log an action
            </button>
          </div>

          <AnimatePresence>
            {logFormOpen && (
              <InlineLogForm
                dealId={deal.id}
                onComplete={() => {
                  setLogFormOpen(false);
                  router.refresh();
                }}
              />
            )}
          </AnimatePresence>
        </StagePanel>
      </motion.div>
    </AnimatePresence>
  );
}

// =============================================================================
// FullFollowUpCard — full queue-driven follow-up card
// =============================================================================

function FullFollowUpCard({
  deal,
  queueItem,
  clientPhone,
  clientEmail,
  onActionComplete,
}: {
  deal: DealDetail;
  queueItem: FollowUpQueueItem;
  clientPhone?: string | null;
  clientEmail?: string | null;
  onActionComplete: () => void;
}) {
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const reasonStyle = REASON_TYPE_STYLES[queueItem.reason_type] ?? REASON_TYPE_STYLES.stall;
  const actionCopy = queueItem.suggested_action ?? null;

  const handleSnooze = async (days: number) => {
    const result = await snoozeFollowUp(queueItem.id, days);
    if (result.success) {
      toast.success(`Snoozed for ${days} day${days !== 1 ? 's' : ''}`);
      onActionComplete();
    } else {
      toast.error(result.error ?? 'Failed to snooze');
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    const result = await dismissFollowUp(queueItem.id);
    setDismissing(false);
    if (result.success) {
      onActionComplete();
    } else {
      toast.error(result.error ?? 'Failed to dismiss');
    }
  };

  const handleSendText = () => {
    if (!clientPhone) return;
    const clientName = (queueItem.context_snapshot?.client_name as string) ?? '';
    const body = draftSmsByReason(queueItem.reason_type, clientName, deal.title ?? 'your event');
    window.open(`sms:${encodeURIComponent(clientPhone)}?body=${encodeURIComponent(body)}`);
    logFollowUpAction(deal.id, 'sms_sent', 'sms', 'Sent follow-up text').then(() => {
      onActionComplete();
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        key="follow-up-card"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={STAGE_MEDIUM}
      >
        <StagePanel elevated className="p-5 flex flex-col gap-4">
          {/* Header: label + reason type badge */}
          <div className="flex items-center justify-between">
            <p className="stage-label text-[var(--stage-text-secondary)]">
              Follow up
            </p>
            <span
              className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium tracking-wide"
              style={{
                color: reasonStyle.color,
                background: reasonStyle.bg,
                borderRadius: 'var(--stage-radius-pill)',
              }}
            >
              {reasonStyle.label}
            </span>
          </div>

          {/* Reason text */}
          <p className="stage-readout tracking-tight" style={{ color: 'var(--stage-text-primary)' }}>
            {queueItem.reason}
          </p>

          {/* Suggested action */}
          {actionCopy && (
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--stage-text-secondary)' }}
            >
              {actionCopy}
            </p>
          )}

          {/* Action buttons row */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Log action */}
            <button
              type="button"
              onClick={() => setLogFormOpen((v) => !v)}
              className="stage-btn stage-btn-secondary text-xs"
            >
              Log action
            </button>

            {/* Send via text */}
            {clientPhone && (
              <button
                type="button"
                onClick={handleSendText}
                className="stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                <MessageSquare size={12} />
                Send via text
              </button>
            )}

            {/* Snooze dropdown — portaled to escape StagePanel overflow */}
            <SnoozeDropdown onSnooze={handleSnooze} />

            {/* Dismiss */}
            <button
              type="button"
              onClick={handleDismiss}
              disabled={dismissing}
              className="text-xs transition-colors disabled:opacity-45"
              style={{ color: 'var(--stage-text-tertiary)' }}
            >
              {dismissing ? 'Dismissing...' : "I've got this"}
            </button>
          </div>

          {/* Inline log form */}
          <AnimatePresence>
            {logFormOpen && (
              <InlineLogForm
                dealId={deal.id}
                queueItemId={queueItem.id}
                onComplete={() => {
                  setLogFormOpen(false);
                  onActionComplete();
                }}
              />
            )}
          </AnimatePresence>
        </StagePanel>
      </motion.div>
    </AnimatePresence>
  );
}

// =============================================================================
// InlineLogForm — expand inline below the button row
// =============================================================================

function InlineLogForm({
  dealId,
  queueItemId,
  onComplete,
}: {
  dealId: string;
  queueItemId?: string;
  onComplete: () => void;
}) {
  const [channel, setChannel] = useState<Channel>('email');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const channelToActionType: Record<Channel, string> = {
    call: 'call_logged',
    sms: 'sms_sent',
    email: 'email_sent',
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const result = await logFollowUpAction(
      dealId,
      channelToActionType[channel],
      channel,
      note.trim() || undefined,
    );

    setSubmitting(false);
    if (result.success) {
      toast.success('Action logged');
      onComplete();
    } else {
      toast.error(result.error ?? 'Failed to log action');
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={STAGE_LIGHT}
      className="overflow-hidden"
    >
      <div
        className="flex flex-col gap-3"
        style={{
          paddingTop: 'var(--stage-gap-wide, 12px)',
          borderTop: '1px solid var(--stage-edge-subtle)',
        }}
      >
        {/* Channel selector */}
        <div className="flex items-center gap-1.5">
          <span className="stage-label text-[var(--stage-text-tertiary)] mr-1.5">Channel</span>
          {(Object.keys(CHANNEL_ICONS) as Channel[]).map((ch) => {
            const Icon = CHANNEL_ICONS[ch];
            const isActive = channel === ch;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={cn(
                  'p-2 transition-colors',
                  isActive
                    ? 'text-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.10)]'
                    : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                )}
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                aria-label={ch}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>

        {/* Note input */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note..."
          rows={1}
          className="w-full resize-none bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] leading-relaxed py-1 outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]"
          style={{
            fontSize: 'var(--stage-input-font-size, 13px)',
            borderBottom: '1px solid var(--stage-edge-subtle)',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        {/* Submit */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="stage-btn stage-btn-primary text-xs disabled:opacity-45"
          >
            {submitting ? 'Saving...' : 'Log'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// SnoozeDropdown — portaled to escape StagePanel overflow
// =============================================================================

function SnoozeDropdown({ onSnooze }: { onSnooze: (days: number) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [focusIdx, setFocusIdx] = useState(-1);

  // Estimated dropdown height: 3 options × ~40px + padding
  const DROPDOWN_HEIGHT_ESTIMATE = 130;

  const computePosition = useCallback(() => {
    if (!btnRef.current) return null;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < DROPDOWN_HEIGHT_ESTIMATE && rect.top > DROPDOWN_HEIGHT_ESTIMATE;
    return {
      top: placeAbove ? rect.top - DROPDOWN_HEIGHT_ESTIMATE - 4 : rect.bottom + 4,
      left: rect.left,
    };
  }, []);

  // Compute position on open
  useEffect(() => {
    if (open) {
      const p = computePosition();
      if (p) setPos(p);
      setFocusIdx(-1);
    }
  }, [open, computePosition]);

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    const handleScroll = () => setOpen(false);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, SNOOZE_OPTIONS.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusIdx >= 0) {
      e.preventDefault();
      onSnooze(SNOOZE_OPTIONS[focusIdx].days);
      setOpen(false);
    }
  }, [open, focusIdx, onSnooze]);

  // Focus management for arrow-keyed items
  useEffect(() => {
    if (!open || focusIdx < 0 || !dropdownRef.current) return;
    const buttons = dropdownRef.current.querySelectorAll<HTMLButtonElement>('[data-snooze-option]');
    buttons[focusIdx]?.focus();
  }, [open, focusIdx]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
          handleKeyDown(e);
        }}
        className="stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Snooze
        <ChevronDown size={10} />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={STAGE_LIGHT}
            className="fixed z-50 overflow-hidden"
            style={{
              top: pos.top,
              left: pos.left,
              background: 'var(--stage-surface-raised)',
              borderRadius: 'var(--stage-radius-panel, 12px)',
              boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 16px 48px oklch(0 0 0 / 0.7)',
              minWidth: '120px',
            }}
            role="listbox"
            onKeyDown={handleKeyDown}
          >
            {SNOOZE_OPTIONS.map((opt, idx) => (
              <button
                key={opt.days}
                type="button"
                data-snooze-option
                onClick={() => { onSnooze(opt.days); setOpen(false); }}
                className={cn(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors',
                  focusIdx === idx
                    ? 'bg-[var(--stage-accent-muted)] text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] hover:text-[var(--stage-text-primary)]',
                )}
                role="option"
                aria-selected={focusIdx === idx}
                tabIndex={-1}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        </>,
        document.body,
      )}
    </>
  );
}
