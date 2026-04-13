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
  UserCircle,
  Truck,
  Package,
  Zap,
  Send,
} from 'lucide-react';
import { respondToCrewAssignment } from '@/features/ops/actions/respond-to-crew-assignment';
import { format } from 'date-fns';
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
  clientInfo?: {
    clientName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    guestCount: number | null;
  } | null;
  dealNotes?: { content: string; authorName: string | null; createdAt: string; isPinned: boolean }[];
  logistics?: {
    loadIn: string | null;
    loadOut: string | null;
    dockInfo: string | null;
    powerInfo: string | null;
    techRequirements: Record<string, unknown> | null;
  } | null;
  proposalItems?: { name: string; description: string | null; quantity: number; unit_price: number; category: string | null }[] | null;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    requested: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
    confirmed: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
    dispatched: 'bg-[oklch(0.85_0.02_0/0.15)] text-[var(--stage-text-secondary)]',
  };
  const icons: Record<string, typeof Clock> = {
    requested: Clock,
    confirmed: Check,
    dispatched: Send,
  };
  const Icon = icons[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${styles[status] ?? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'}`}>
      {Icon && <Icon className="size-3" />}
      {status}
    </span>
  );
}

function formatEventDate(iso: string | null): string {
  if (!iso) return 'Date TBD';
  return format(new Date(iso), 'EEEE, MMMM d, yyyy');
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
      <Icon className="size-4 text-[var(--stage-text-secondary)]" />
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
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
  clientInfo,
  dealNotes = [],
  logistics,
  proposalItems,
}: GigDetailViewProps) {
  const formatTimestamp = (iso: string | null) => {
    if (!iso) return null;
    return format(new Date(iso), 'h:mm a');
  };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flex flex-col gap-6 pb-8"
    >
      {/* Back link */}
      <Link
        href="/schedule"
        className="flex items-center gap-1.5 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] w-fit"
      >
        <ArrowLeft className="size-4" />
        Schedule
      </Link>

      {/* ── Hero Card (header + venue + confirm) ──────────────────── */}
      <div className="flex flex-col gap-4 p-5 rounded-xl bg-[var(--stage-surface)]" data-surface="surface">
        {/* Header */}
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
              <span className="flex items-center gap-1 font-medium tabular-nums text-[var(--stage-text-primary)]">
                <DollarSign className="size-3.5" />
                {payDisplay}
              </span>
            </>
          )}
        </div>

        {/* Venue (inside hero) */}
        {venueName && (
          <div className="flex flex-col gap-1.5 pt-3 border-t border-[oklch(1_0_0/0.06)]">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-[var(--stage-text-tertiary)]" />
              <span className="text-sm font-medium text-[var(--stage-text-primary)]">{venueName}</span>
            </div>
            {venueAddress && (
              <p className="text-sm text-[var(--stage-text-secondary)] ml-6">{venueAddress}</p>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-[var(--stage-text-primary)] ml-6 w-fit hover:opacity-80 transition-opacity"
              >
                <Navigation className="size-3.5" />
                Get directions
              </a>
            )}
          </div>
        )}

        {/* Confirm / Decline (inside hero) */}
        {status === 'requested' && (
          <div className="pt-3 border-t border-[oklch(1_0_0/0.06)]">
            <GigConfirmDecline assignmentId={assignmentId} />
          </div>
        )}
      </div>

      {/* ── Client + Logistics (2-col on desktop) ─────────────────── */}
      {(clientInfo || logistics) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Client info */}
          {clientInfo && (clientInfo.clientName || clientInfo.contactName) && (
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface)]" data-surface="surface">
              <SectionHeader icon={UserCircle} label="Client" />
              {clientInfo.clientName && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[var(--stage-text-primary)]">{clientInfo.clientName}</p>
                  {/* Phone/email inline with name when no separate contact */}
                  {!clientInfo.contactName && clientInfo.contactPhone && (
                    <a href={`tel:${clientInfo.contactPhone}`} className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] shrink-0">
                      <Phone className="size-3" />
                      {clientInfo.contactPhone}
                    </a>
                  )}
                </div>
              )}
              {/* Separate contact person (when org is a company) */}
              {clientInfo.contactName && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--stage-text-secondary)]">{clientInfo.contactName}</span>
                  {clientInfo.contactPhone && (
                    <a href={`tel:${clientInfo.contactPhone}`} className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] shrink-0">
                      <Phone className="size-3" />
                      {clientInfo.contactPhone}
                    </a>
                  )}
                </div>
              )}
              {/* Email (shown separately when available) */}
              {clientInfo.contactEmail && (
                <a href={`mailto:${clientInfo.contactEmail}`} className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms]">
                  {clientInfo.contactEmail}
                </a>
              )}
              {clientInfo.guestCount && (
                <p className="text-xs tabular-nums text-[var(--stage-text-secondary)]">{clientInfo.guestCount} guests expected</p>
              )}
            </div>
          )}

          {/* Deal notes */}
          {dealNotes.length > 0 && (
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface)]" data-surface="surface">
              <SectionHeader icon={FileText} label="Notes" />
              {dealNotes.map((note, i) => (
                <div key={i} className={`flex flex-col gap-1.5 ${note.isPinned ? 'p-3 rounded-lg bg-[var(--stage-surface-elevated)]' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {note.isPinned && (
                        <span className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">Pinned</span>
                      )}
                      {note.authorName && (
                        <span className="text-xs text-[var(--stage-text-secondary)]">{note.authorName}</span>
                      )}
                    </div>
                    <span className="text-xs tabular-nums text-[var(--stage-text-tertiary)]">
                      {format(new Date(note.createdAt), 'MMM d')}
                    </span>
                  </div>
                  <p className={`text-sm whitespace-pre-wrap ${note.isPinned ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'}`}>
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Logistics */}
          {logistics && (logistics.loadIn || logistics.dockInfo || logistics.powerInfo || logistics.techRequirements) && (
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface)]" data-surface="surface">
              <SectionHeader icon={Truck} label="Logistics" />
              {(logistics.loadIn || logistics.loadOut) && (
                <div className="flex items-center gap-4 text-sm">
                  {logistics.loadIn && (
                    <div>
                      <span className="text-[var(--stage-text-tertiary)]">Load in </span>
                      <span className="font-medium tabular-nums text-[var(--stage-text-primary)]">{formatTimestamp(logistics.loadIn)}</span>
                    </div>
                  )}
                  {logistics.loadOut && (
                    <div>
                      <span className="text-[var(--stage-text-tertiary)]">Load out </span>
                      <span className="font-medium tabular-nums text-[var(--stage-text-primary)]">{formatTimestamp(logistics.loadOut)}</span>
                    </div>
                  )}
                </div>
              )}
              {logistics.dockInfo && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-1">Dock / loading</p>
                  <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">{logistics.dockInfo}</p>
                </div>
              )}
              {logistics.powerInfo && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-1">Power</p>
                  <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">{logistics.powerInfo}</p>
                </div>
              )}
              {logistics.techRequirements && Object.keys(logistics.techRequirements).length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-1">Tech requirements</p>
                  <div className="flex flex-col gap-1">
                    {Object.entries(logistics.techRequirements).map(([key, val]) => (
                      val ? (
                        <p key={key} className="text-sm text-[var(--stage-text-secondary)]">
                          <span className="capitalize">{key}</span>: {String(val)}
                        </p>
                      ) : null
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── What was sold (proposal items) ───────────────────────── */}
      {proposalItems && proposalItems.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface)]" data-surface="surface">
          <SectionHeader icon={Package} label="What was sold" />
          <div className="flex flex-col divide-y divide-[oklch(1_0_0/0.04)]">
            {proposalItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--stage-text-primary)]">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-[var(--stage-text-secondary)] truncate">{item.description}</p>
                  )}
                </div>
                <div className="text-xs tabular-nums text-[var(--stage-text-secondary)] shrink-0">
                  {item.quantity > 1 && <span>{item.quantity}× </span>}
                  ${item.unit_price.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Action info (2-col on desktop) ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline */}
        {timeline.length > 0 && (
          <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
            <SectionHeader icon={Clock} label="Timeline" />
            <div className="flex flex-col gap-1.5">
              {timeline.map((item, i) => (
                <div key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="w-20 shrink-0 text-right font-mono tabular-nums text-[var(--stage-text-secondary)]">
                    {item.time}
                  </span>
                  <span className="text-[var(--stage-text-primary)]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Crew */}
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
      </div>

      {/* ── Reference sections (borderless, 2-col on desktop) ───── */}
      {(showDayContacts.length > 0 || specialNotes || documents.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-[oklch(1_0_0/0.04)]">

          {/* Left column: contacts + notes */}
          <div className="flex flex-col gap-5">
            {showDayContacts.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionHeader icon={Phone} label="Contacts" />
                <div className="flex flex-col gap-2">
                  {showDayContacts.map((contact, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm text-[var(--stage-text-secondary)]">{contact.name}</span>
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

            {specialNotes && (
              <div className="flex flex-col gap-2">
                <SectionHeader icon={FileText} label="Notes" />
                <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">{specialNotes}</p>
              </div>
            )}
          </div>

          {/* Right column: documents */}
          {documents.length > 0 && (
            <div className="flex flex-col gap-2">
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
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--stage-text-secondary)]">
        You have been requested for this show. Review the details and respond.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handle('confirmed')}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)] hover:bg-[oklch(0.75_0.15_145/0.3)] transition-colors disabled:opacity-[0.45]"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Confirm
        </button>
        <button
          onClick={() => handle('declined')}
          disabled={isPending}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
        >
          <X className="size-4" />
          Decline
        </button>
      </div>
    </div>
  );
}
