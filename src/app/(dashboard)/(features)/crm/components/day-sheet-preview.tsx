'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  X,
  MapPin,
  Clock,
  Users,
  Phone,
  Mail,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_HEAVY, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { compileDaySheetData, type DaySheetData } from '../actions/compile-day-sheet-data';
import { compileAndSendDaySheet } from '../actions/compile-and-send-day-sheet';

type DaySheetPreviewProps = {
  onClose: () => void;
  eventId: string;
  dealId: string;
};

/**
 * Day sheet slide-over drawer. Mount only when open; unmount to close.
 * Parent controls lifecycle: `{previewOpen && <DaySheetPreview ... />}`
 */
export function DaySheetPreview({ onClose, eventId, dealId }: DaySheetPreviewProps) {
  const [data, setData] = useState<DaySheetData | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isSending, startSend] = useTransition();
  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    startLoad(async () => {
      const result = await compileDaySheetData(eventId, dealId);
      if (!cancelled) setData(result);
    });
    return () => { cancelled = true; };
  }, [eventId, dealId]);

  const crewWithEmail = data?.crewList.filter((c) => c.email).length ?? 0;
  const crewTotal = data?.crewList.length ?? 0;
  const missingEmail = crewTotal - crewWithEmail;

  const handleSend = () => {
    if (crewWithEmail === 0) return;

    const confirmed = window.confirm(
      `Send day sheet to ${crewWithEmail} crew member${crewWithEmail !== 1 ? 's' : ''}?`,
    );
    if (!confirmed) return;

    startSend(async () => {
      const result = await compileAndSendDaySheet({ eventId, dealId });
      if (result.success) {
        const parts = [`Day sheet sent to ${result.sentCount} crew`];
        if (result.skippedCount > 0) {
          parts.push(
            `${result.skippedCount} skipped (no email): ${result.skippedNames.join(', ')}`,
          );
        }
        toast.success(parts.join('. '));
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  };

  if (typeof window === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[60]"
        style={{ backgroundColor: 'oklch(0.06 0 0 / 0.75)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.aside
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-md flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--stage-surface-raised)' }}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={STAGE_HEAVY}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0 px-5 py-4 border-b"
          style={{ borderColor: 'var(--stage-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <FileText size={18} strokeWidth={1.5} style={{ color: 'var(--stage-text-secondary)' }} />
            <h2
              className="text-base font-semibold tracking-tight"
              style={{ color: 'var(--stage-text-primary)' }}
            >
              Day sheet preview
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-[oklch(1_0_0/0.08)]"
            aria-label="Close preview"
          >
            <X size={18} strokeWidth={1.5} style={{ color: 'var(--stage-text-secondary)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {isLoading && <LoadingSkeleton />}
          {!isLoading && !data && (
            <p className="text-sm" style={{ color: 'var(--stage-text-tertiary)' }}>
              Could not load day sheet data.
            </p>
          )}
          {!isLoading && data && <DaySheetContent data={data} />}
        </div>

        {/* Bottom action bar */}
        {data && (
          <div
            className="shrink-0 px-5 py-4 border-t space-y-2"
            style={{ borderColor: 'var(--stage-border)' }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs tracking-tight" style={{ color: 'var(--stage-text-tertiary)' }}>
                {crewWithEmail} of {crewTotal} crew have email
                {missingEmail > 0 && ` (${missingEmail} missing)`}
              </p>
            </div>
            <button
              onClick={handleSend}
              disabled={isSending || crewWithEmail === 0}
              className="stage-btn stage-btn-primary w-full text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending\u2026' : `Send day sheet to ${crewWithEmail} crew`}
            </button>
          </div>
        )}
      </motion.aside>
    </>,
    document.body,
  );
}

/* ───────── Content sections ───────── */

function DaySheetContent({ data }: { data: DaySheetData }) {
  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      {/* Event header */}
      <div>
        <h3
          className="text-lg font-semibold tracking-tight"
          style={{ color: 'var(--stage-text-primary)' }}
        >
          {data.eventTitle}
        </h3>
        <p className="text-sm mt-0.5" style={{ color: 'var(--stage-text-secondary)' }}>
          {data.eventDate}
        </p>
      </div>

      {/* Venue */}
      {(data.venueName || data.venueAddress) && (
        <Section icon={MapPin} title="Venue">
          {data.venueName && (
            <p className="text-sm font-medium" style={{ color: 'var(--stage-text-primary)' }}>
              {data.venueName}
            </p>
          )}
          {data.venueAddress && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--stage-text-secondary)' }}>
              {data.venueAddress}
            </p>
          )}
          {data.mapsUrl && (
            <a
              href={data.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs mt-1.5 hover:underline"
              style={{ color: 'var(--stage-text-secondary)' }}
            >
              Open in Maps <ExternalLink size={12} />
            </a>
          )}
        </Section>
      )}

      {/* Timeline */}
      {data.timeline.length > 0 && (
        <Section icon={Clock} title="Timeline">
          <div className="space-y-2">
            {data.timeline.map((item, i) => (
              <div key={i} className="flex items-baseline gap-3">
                <span
                  className="text-sm font-mono font-medium shrink-0 w-20 text-right"
                  style={{ color: 'var(--stage-text-primary)' }}
                >
                  {item.time}
                </span>
                <span className="text-sm" style={{ color: 'var(--stage-text-secondary)' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Crew */}
      {data.crewList.length > 0 && (
        <Section icon={Users} title={`Crew (${data.crewList.length})`}>
          <div className="space-y-2">
            {data.crewList.map((member, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-2 py-1.5"
                style={{ borderBottom: i < data.crewList.length - 1 ? '1px solid var(--stage-border)' : 'none' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--stage-text-primary)' }}>
                    {member.name}
                  </p>
                  {member.role && (
                    <p className="text-xs" style={{ color: 'var(--stage-text-tertiary)' }}>
                      {member.role}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {member.callTime && (
                    <span
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: 'var(--stage-surface)',
                        color: 'var(--stage-text-secondary)',
                      }}
                    >
                      {member.callTime}
                    </span>
                  )}
                  {member.email ? (
                    <Mail size={13} style={{ color: 'var(--stage-text-tertiary)' }} />
                  ) : (
                    <Mail size={13} style={{ color: 'var(--color-unusonic-warning)' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Show-day contacts */}
      {data.showDayContacts.length > 0 && (
        <Section icon={Phone} title="Show-day contacts">
          <div className="space-y-2">
            {data.showDayContacts.map((contact, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--stage-text-primary)' }}>
                    {contact.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--stage-text-tertiary)' }}>
                    {contact.role}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {contact.phone && (
                    <span className="text-xs font-mono" style={{ color: 'var(--stage-text-secondary)' }}>
                      {contact.phone}
                    </span>
                  )}
                  {contact.email && (
                    <span className="text-xs" style={{ color: 'var(--stage-text-tertiary)' }}>
                      {contact.email}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Special notes */}
      {data.specialNotes && (
        <Section icon={FileText} title="Venue notes">
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--stage-text-secondary)' }}>
            {data.specialNotes}
          </p>
        </Section>
      )}

      {/* Footer */}
      <p className="text-xs pt-2" style={{ color: 'var(--stage-text-tertiary)' }}>
        Produced by {data.workspaceName}
      </p>
    </motion.div>
  );
}

/* ───────── Shared section wrapper ───────── */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} strokeWidth={1.5} style={{ color: 'var(--stage-text-tertiary)' }} />
        <h4
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--stage-text-tertiary)' }}
        >
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

/* ───────── Loading skeleton ───────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-5 stage-skeleton">
      <div>
        <div className="h-5 w-48 rounded" style={{ backgroundColor: 'var(--stage-surface)' }} />
        <div className="h-3.5 w-32 rounded mt-2" style={{ backgroundColor: 'var(--stage-surface)' }} />
      </div>
      {[1, 2, 3].map((n) => (
        <div key={n} className="space-y-2">
          <div className="h-3 w-20 rounded" style={{ backgroundColor: 'var(--stage-surface)' }} />
          <div className="h-4 w-full rounded" style={{ backgroundColor: 'var(--stage-surface)' }} />
          <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'var(--stage-surface)' }} />
        </div>
      ))}
    </div>
  );
}
