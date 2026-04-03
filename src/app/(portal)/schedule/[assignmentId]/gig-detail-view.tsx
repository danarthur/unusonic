'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  MapPin,
  Clock,
  DollarSign,
  Phone,
  Users,
  FileText,
  Navigation,
  Check,
  X,
  Loader2,
  Download,
} from 'lucide-react';
import { respondToCrewAssignment } from '@/features/ops/actions/respond-to-crew-assignment';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

interface GigDetailViewProps {
  eventTitle: string;
  eventDate: string | null;
  eventArchetype: string | null;
  venueName: string | null;
  venueAddress: string | null;
  mapsUrl: string | null;
  role: string;
  status: string;
  payDisplay: string | null;
  timeline: { time: string; label: string }[];
  crewMembers: { name: string; role: string | null; phone: string | null; entityId: string | null; isYou: boolean }[];
  showDayContacts: { role: string; name: string; phone: string | null; email: string | null }[];
  specialNotes: string | null;
  documents: { name: string; url: string; size: number; type: string }[];
  assignmentId: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    requested: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
    confirmed: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
    dispatched: 'bg-[oklch(0.85_0.02_0/0.15)] text-[var(--stage-text-secondary)]',
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles[status] ?? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'}`}>
      {status}
    </span>
  );
}

function formatEventDate(iso: string | null): string {
  if (!iso) return 'Date TBD';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SectionHeader({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-4 text-[var(--stage-text-tertiary)]" />
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
        {label}
      </h3>
    </div>
  );
}

/* ── Main View ───────────────────────────────────────────────────── */

export function GigDetailView({
  eventTitle,
  eventDate,
  eventArchetype,
  venueName,
  venueAddress,
  mapsUrl,
  role,
  status,
  payDisplay,
  timeline,
  crewMembers,
  showDayContacts,
  specialNotes,
  documents,
  assignmentId,
}: GigDetailViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6 pb-8"
    >
      {/* Back link */}
      <Link
        href="/schedule"
        className="flex items-center gap-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Schedule
      </Link>

      {/* ── Event Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--stage-text-primary)] leading-snug">
              {eventTitle}
            </h1>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-1">
              {formatEventDate(eventDate)}
              {eventArchetype && <span className="text-[var(--stage-text-tertiary)]"> · {eventArchetype}</span>}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Role + Rate strip */}
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-[var(--stage-text-primary)]">{role}</span>
          {payDisplay && (
            <>
              <span className="text-[var(--stage-text-tertiary)]">·</span>
              <span className="flex items-center gap-1 font-medium text-[var(--stage-text-primary)]">
                <DollarSign className="size-3.5" />
                {payDisplay}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Confirm / Decline ────────────────────────────────────── */}
      {status === 'requested' && (
        <GigConfirmDecline assignmentId={assignmentId} />
      )}

      {/* ── Venue ────────────────────────────────────────────────── */}
      {venueName && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={MapPin} label="Venue" />
          <p className="text-sm font-medium text-[var(--stage-text-primary)]">{venueName}</p>
          {venueAddress && (
            <p className="text-sm text-[var(--stage-text-secondary)]">{venueAddress}</p>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-[var(--stage-text-primary)] mt-1 w-fit hover:opacity-80 transition-opacity"
            >
              <Navigation className="size-3.5" />
              Get directions
            </a>
          )}
        </div>
      )}

      {/* ── Timeline ─────────────────────────────────────────────── */}
      {timeline.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Clock} label="Timeline" />
          <div className="flex flex-col gap-1.5">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-baseline gap-3 text-sm">
                <span className="w-20 shrink-0 text-right font-mono text-[var(--stage-text-tertiary)]">
                  {item.time}
                </span>
                <span className="text-[var(--stage-text-primary)]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Crew ─────────────────────────────────────────────────── */}
      {crewMembers.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Users} label="Crew" />
          <div className="flex flex-col gap-2">
            {crewMembers.map((member, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm text-[var(--stage-text-primary)]">
                    {member.name}
                    {member.isYou && (
                      <span className="ml-1.5 text-xs text-[var(--stage-text-tertiary)]">(you)</span>
                    )}
                  </span>
                  {member.role && (
                    <span className="text-xs text-[var(--stage-text-tertiary)] ml-2">{member.role}</span>
                  )}
                </div>
                {member.phone && (
                  <a
                    href={`tel:${member.phone}`}
                    className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors shrink-0"
                  >
                    <Phone className="size-3" />
                    {member.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Show-Day Contacts ────────────────────────────────────── */}
      {showDayContacts.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Phone} label="Contacts" />
          <div className="flex flex-col gap-2">
            {showDayContacts.map((contact, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-sm text-[var(--stage-text-primary)]">{contact.name}</span>
                  <span className="text-xs text-[var(--stage-text-tertiary)] ml-2">{contact.role}</span>
                </div>
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors shrink-0"
                  >
                    <Phone className="size-3" />
                    {contact.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Notes ────────────────────────────────────────────────── */}
      {specialNotes && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={FileText} label="Notes" />
          <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">{specialNotes}</p>
        </div>
      )}

      {/* ── Documents ───────────────────────────────────────────── */}
      {documents.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={FileText} label="Documents" />
          <div className="flex flex-col gap-2">
            {documents.map((doc, i) => {
              const isImage = doc.type.startsWith('image/');
              const isPdf = doc.type === 'application/pdf';
              return (
                <a
                  key={i}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 -mx-0.5 rounded-lg hover:bg-[oklch(1_0_0/0.04)] transition-colors group"
                >
                  {isImage ? (
                    <img
                      src={doc.url}
                      alt={doc.name}
                      className="size-10 rounded-md object-cover shrink-0 border border-[oklch(1_0_0/0.06)]"
                    />
                  ) : (
                    <div className="size-10 rounded-md bg-[oklch(1_0_0/0.06)] flex items-center justify-center shrink-0">
                      <FileText className="size-4 text-[var(--stage-text-tertiary)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                      {doc.name}
                    </p>
                    <p className="text-xs text-[var(--stage-text-tertiary)]">
                      {formatFileSize(doc.size)}
                      {isPdf && ' · PDF'}
                    </p>
                  </div>
                  <Download className="size-4 text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ── Confirm / Decline for Gig Detail ────────────────────────────── */

function GigConfirmDecline({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [responded, setResponded] = useState<'confirmed' | 'declined' | null>(null);

  const handle = (response: 'confirmed' | 'declined') => {
    startTransition(async () => {
      const result = await respondToCrewAssignment(assignmentId, response);
      if (result.ok) {
        setResponded(response);
        router.refresh();
      }
    });
  };

  if (responded) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 rounded-xl border border-[oklch(0.75_0.15_145/0.2)] bg-[oklch(0.75_0.15_145/0.05)]">
        <Check className="size-4 text-[oklch(0.75_0.15_145)]" />
        <span className="text-sm font-medium text-[oklch(0.75_0.15_145)]">
          {responded === 'confirmed' ? 'Confirmed' : 'Declined'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-[oklch(0.75_0.15_55/0.2)] bg-[oklch(0.75_0.15_55/0.05)]">
      <p className="text-sm text-[var(--stage-text-secondary)]">
        You have been requested for this show. Review the details and respond.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handle('confirmed')}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.3)] transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Confirm
        </button>
        <button
          onClick={() => handle('declined')}
          disabled={isPending}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-50"
        >
          <X className="size-4" />
          Decline
        </button>
      </div>
    </div>
  );
}
