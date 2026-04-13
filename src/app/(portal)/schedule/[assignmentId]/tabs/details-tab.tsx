'use client';

import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  Users,
  Phone,
  FileText,
  Truck,
  Package,
  Download,
  Pin,
} from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────────── */

interface DetailsTabProps {
  crewMembers: {
    name: string;
    role: string | null;
    phone: string | null;
    entityId: string | null;
    isYou: boolean;
  }[];
  showDayContacts: {
    role: string;
    name: string;
    phone: string | null;
    email: string | null;
  }[];
  logistics: {
    loadIn: string | null;
    loadOut: string | null;
    dockInfo: string | null;
    powerInfo: string | null;
    techRequirements: Record<string, unknown> | null;
  } | null;
  dealNotes: {
    content: string;
    authorName: string | null;
    createdAt: string;
    isPinned: boolean;
  }[];
  specialNotes: string | null;
  documents: { name: string; url: string; size: number; type: string }[];
  proposalItems: {
    name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    category: string | null;
  }[] | null;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof Users;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-4 text-[var(--stage-text-secondary)]" />
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
        {label}
      </h3>
    </div>
  );
}

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  return format(new Date(iso), 'h:mm a');
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Details Tab ─────────────────────────────────────────────────── */

export function DetailsTab({
  crewMembers,
  showDayContacts,
  logistics,
  dealNotes,
  specialNotes,
  documents,
  proposalItems,
}: DetailsTabProps) {
  // Sort notes: pinned first
  const sortedNotes = [...dealNotes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  const hasLogistics =
    logistics &&
    (logistics.loadIn ||
      logistics.loadOut ||
      logistics.dockInfo ||
      logistics.powerInfo ||
      (logistics.techRequirements &&
        Object.keys(logistics.techRequirements).length > 0));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      {/* ── Left Column ────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {/* Crew roster */}
        {crewMembers.length > 0 && (
          <div
            className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            data-surface="surface"
          >
            <SectionHeader icon={Users} label="Crew" />
            <div className="flex flex-col gap-2">
              {crewMembers.map((member, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-[var(--stage-text-primary)]">
                      {member.name}
                      {member.isYou && (
                        <span className="ml-1.5 text-xs font-medium text-[var(--stage-text-secondary)]">
                          (you)
                        </span>
                      )}
                    </span>
                    {member.role && (
                      <span className="text-xs text-[var(--stage-text-secondary)] ml-2">
                        {member.role}
                      </span>
                    )}
                  </div>
                  {member.phone && (
                    <a
                      href={`tel:${member.phone}`}
                      className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] shrink-0"
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

        {/* Show-day contacts */}
        {showDayContacts.length > 0 && (
          <div
            className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            data-surface="surface"
          >
            <SectionHeader icon={Phone} label="Show-day contacts" />
            <div className="flex flex-col gap-2">
              {showDayContacts.map((contact, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-sm text-[var(--stage-text-primary)]">
                      {contact.name}
                    </span>
                    <span className="text-xs text-[var(--stage-text-secondary)] ml-2">
                      {contact.role}
                    </span>
                  </div>
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] shrink-0"
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

        {/* Logistics */}
        {hasLogistics && (
          <div
            className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            data-surface="surface"
          >
            <SectionHeader icon={Truck} label="Logistics" />
            {(logistics!.loadIn || logistics!.loadOut) && (
              <div className="flex items-center gap-4 text-sm">
                {logistics!.loadIn && (
                  <div>
                    <span className="text-[var(--stage-text-secondary)]">
                      Load in{' '}
                    </span>
                    <span className="font-medium tabular-nums text-[var(--stage-text-primary)]">
                      {formatTimestamp(logistics!.loadIn)}
                    </span>
                  </div>
                )}
                {logistics!.loadOut && (
                  <div>
                    <span className="text-[var(--stage-text-secondary)]">
                      Load out{' '}
                    </span>
                    <span className="font-medium tabular-nums text-[var(--stage-text-primary)]">
                      {formatTimestamp(logistics!.loadOut)}
                    </span>
                  </div>
                )}
              </div>
            )}
            {logistics!.dockInfo && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                  Dock / loading
                </p>
                <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">
                  {logistics!.dockInfo}
                </p>
              </div>
            )}
            {logistics!.powerInfo && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                  Power
                </p>
                <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">
                  {logistics!.powerInfo}
                </p>
              </div>
            )}
            {logistics!.techRequirements &&
              Object.keys(logistics!.techRequirements).length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
                    Tech requirements
                  </p>
                  <div className="flex flex-col gap-1">
                    {Object.entries(logistics!.techRequirements).map(
                      ([key, val]) =>
                        val ? (
                          <p
                            key={key}
                            className="text-sm text-[var(--stage-text-secondary)]"
                          >
                            <span className="capitalize">{key}</span>:{' '}
                            {String(val)}
                          </p>
                        ) : null,
                    )}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* ── Right Column ───────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {/* Notes */}
        {(sortedNotes.length > 0 || specialNotes) && (
          <div
            className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            data-surface="surface"
          >
            <SectionHeader icon={FileText} label="Notes" />

            {sortedNotes.map((note, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1.5 ${
                  note.isPinned
                    ? 'p-3 rounded-lg bg-[var(--stage-surface-elevated)]'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {note.isPinned && (
                      <Pin className="size-3 text-[var(--stage-text-secondary)]" />
                    )}
                    {note.authorName && (
                      <span className="text-xs text-[var(--stage-text-secondary)]">
                        {note.authorName}
                      </span>
                    )}
                  </div>
                  <span className="text-xs tabular-nums text-[var(--stage-text-secondary)]">
                    {format(new Date(note.createdAt), 'MMM d')}
                  </span>
                </div>
                <p
                  className={`text-sm whitespace-pre-wrap ${
                    note.isPinned
                      ? 'text-[var(--stage-text-primary)]'
                      : 'text-[var(--stage-text-secondary)]'
                  }`}
                >
                  {note.content}
                </p>
              </div>
            ))}

            {specialNotes && sortedNotes.length > 0 && (
              <div className="border-t border-[oklch(1_0_0/0.06)] pt-3" />
            )}

            {specialNotes && (
              <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">
                {specialNotes}
              </p>
            )}
          </div>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <div
            className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            data-surface="surface"
          >
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
                    className="flex items-center gap-3 p-2.5 -mx-0.5 rounded-lg hover:bg-[oklch(1_0_0/0.04)] transition-colors duration-[80ms] group"
                  >
                    {isImage ? (
                      <img
                        src={doc.url}
                        alt={doc.name}
                        className="size-10 rounded-md object-cover shrink-0 border border-[oklch(1_0_0/0.06)]"
                      />
                    ) : (
                      <div className="size-10 rounded-md bg-[oklch(1_0_0/0.06)] flex items-center justify-center shrink-0">
                        <FileText className="size-4 text-[var(--stage-text-secondary)]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                        {doc.name}
                      </p>
                      <p className="text-xs text-[var(--stage-text-secondary)]">
                        {formatFileSize(doc.size)}
                        {isPdf && ' \u00b7 PDF'}
                      </p>
                    </div>
                    <Download className="size-4 text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* What was sold (proposal items) */}
        {proposalItems && proposalItems.length > 0 && (
          <div
            className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            data-surface="surface"
          >
            <SectionHeader icon={Package} label="What was sold" />
            <div className="flex flex-col divide-y divide-[oklch(1_0_0/0.04)]">
              {proposalItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--stage-text-primary)]">
                      {item.name}
                    </p>
                    {item.description && (
                      <p className="text-xs text-[var(--stage-text-secondary)] truncate">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="text-xs tabular-nums text-[var(--stage-text-secondary)] shrink-0">
                    {item.quantity > 1 && <span>{item.quantity}&times; </span>}
                    ${item.unit_price.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
