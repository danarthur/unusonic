'use client';

import { motion } from 'framer-motion';
import { Calendar, MapPin, Clock, Music, Users } from 'lucide-react';
import { format } from 'date-fns';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { CLIENT_FIELD_SCHEMAS } from '@/features/ops/lib/dj-prep-schema';
import type { PublicEventDTO } from '@/features/ops/api/get-public-event';
import type { ProgramTimeline, ClientDetails } from '@/features/ops/lib/dj-prep-schema';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: STAGE_LIGHT },
};

/** Returns an achromatic OKLCH lightness value for the energy stripe (1=dim, 10=bright) */
function energyLightness(energy: number | null): string {
  if (energy == null) return 'oklch(0.20 0 0)';
  const l = 0.15 + (energy / 10) * 0.7;
  return `oklch(${l.toFixed(2)} 0 0)`;
}

export function PublicEventView({ data }: { data: PublicEventDTO }) {
  const { event, program, workspace } = data;

  const formattedDate = event.startsAt
    ? format(new Date(event.startsAt), 'EEEE, MMMM d, yyyy')
    : null;

  const formattedTime = event.startsAt
    ? format(new Date(event.startsAt), 'h:mm a')
    : null;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-2xl mx-auto px-5 py-10"
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="mb-10">
        {workspace.logoUrl && (
          <img
            src={workspace.logoUrl}
            alt={workspace.name}
            className="h-8 mb-6 object-contain"
          />
        )}
        <h1
          className="text-2xl font-semibold tracking-tight mb-2"
          style={{ color: 'var(--portal-heading)' }}
        >
          {event.title ?? 'Your event'}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--portal-muted)' }}>
          {formattedDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formattedDate}
            </span>
          )}
          {formattedTime && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {formattedTime}
            </span>
          )}
          {event.venueName && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {event.venueName}
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Client Details ───────────────────────────────────── */}
      {program.clientDetails && (
        <motion.div variants={itemVariants} className="mb-8">
          <ClientDetailsCard details={program.clientDetails} />
        </motion.div>
      )}

      {/* ── Program Timelines ────────────────────────────────── */}
      {program.timelines.length > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-4">
            <Music className="size-4" style={{ color: 'var(--portal-muted)' }} />
            <h2
              className="text-sm font-medium uppercase tracking-wider"
              style={{ color: 'var(--portal-muted)' }}
            >
              Program
            </h2>
          </div>

          <div className="flex flex-col gap-6">
            {program.timelines
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((tl) => (
                <TimelineSection key={tl.id} timeline={tl} showName={program.timelines.length > 1} />
              ))}
          </div>
        </motion.div>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="mt-12 pt-6 border-t" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs text-center" style={{ color: 'var(--portal-muted)' }}>
          Prepared by {workspace.name}
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ── Client Details Card ──────────────────────────────────────── */

function ClientDetailsCard({ details }: { details: ClientDetails }) {
  const group = details.archetype;
  const fields = CLIENT_FIELD_SCHEMAS[group] ?? CLIENT_FIELD_SCHEMAS.generic;
  const data = details as Record<string, unknown>;

  // Only show fields that have values
  const filledFields = fields.filter((f) => {
    const val = data[f.key];
    return val && typeof val === 'string' && val.trim().length > 0;
  });

  if (filledFields.length === 0) return null;

  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--portal-card-bg, var(--portal-bg))',
        border: '1px solid var(--portal-border)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Users className="size-4" style={{ color: 'var(--portal-muted)' }} />
        <h3
          className="text-sm font-medium uppercase tracking-wider"
          style={{ color: 'var(--portal-muted)' }}
        >
          Details
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filledFields.map((field) => (
          <div
            key={field.key}
            className={field.multiline ? 'sm:col-span-2' : ''}
          >
            <p className="text-xs mb-0.5" style={{ color: 'var(--portal-muted)' }}>
              {field.label}
            </p>
            <p
              className="text-sm whitespace-pre-wrap"
              style={{ color: 'var(--portal-text)' }}
            >
              {data[field.key] as string}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Timeline Section ─────────────────────────────────────────── */

function TimelineSection({ timeline, showName }: { timeline: ProgramTimeline; showName: boolean }) {
  return (
    <div>
      {showName && (
        <h3
          className="text-xs font-medium uppercase tracking-wider mb-3"
          style={{ color: 'var(--portal-muted)' }}
        >
          {timeline.name}
        </h3>
      )}

      <div className="flex flex-col gap-1.5">
        {timeline.moments
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((moment) => (
            <div
              key={moment.id}
              className="flex items-start gap-3 py-2.5 px-3 rounded-lg relative overflow-hidden"
              style={{
                backgroundColor: 'var(--portal-card-bg, transparent)',
              }}
            >
              {/* Energy stripe */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                style={{ backgroundColor: energyLightness(moment.energy) }}
              />

              <span
                className="text-xs font-mono w-16 shrink-0 pt-0.5 pl-2"
                style={{ color: 'var(--portal-muted)' }}
              >
                {moment.time || '\u2014'}
              </span>

              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--portal-text)' }}
                >
                  {moment.label || 'Untitled'}
                </span>
                {moment.notes && (
                  <span
                    className="text-xs"
                    style={{ color: 'var(--portal-muted)' }}
                  >
                    {moment.notes}
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
