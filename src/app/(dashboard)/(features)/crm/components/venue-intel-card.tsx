'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Building2, Calendar } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { getVenueIntel, type VenueIntel, type VenueStaticData } from '../actions/get-venue-intel';

type VenueIntelCardProps = {
  venueEntityId: string;
};

export function VenueIntelCard({ venueEntityId }: VenueIntelCardProps) {
  const [intel, setIntel] = useState<VenueIntel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVenueIntel(venueEntityId).then((data) => {
      if (!cancelled) {
        setIntel(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [venueEntityId]);

  if (loading) {
    return (
      <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
        <p className="stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>
          Loading venue data...
        </p>
      </StagePanel>
    );
  }

  const hasStatic = intel && hasStaticData(intel.staticData);
  const hasPastShows = intel && intel.pastShows.length > 0;

  if (!hasStatic && !hasPastShows) {
    return (
      <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
        <div className="flex items-center" style={{ gap: 'var(--stage-gap, 8px)', marginBottom: 'var(--stage-gap, 8px)' }}>
          <MapPin size={16} style={{ color: 'var(--stage-text-tertiary)' }} aria-hidden />
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
            Venue intelligence
          </p>
        </div>
        <p className="text-sm" style={{ color: 'var(--stage-text-tertiary)' }}>
          No venue data yet. File wrap reports to build intelligence.
        </p>
      </StagePanel>
    );
  }

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 'var(--stage-gap, 8px)', marginBottom: 'var(--stage-gap-wide, 12px)' }}>
        <Building2 size={16} style={{ color: 'var(--stage-text-secondary)' }} aria-hidden />
        <p className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
          Venue intelligence
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key="intel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={STAGE_LIGHT}
          className="flex flex-col"
          style={{ gap: 'var(--stage-gap-wide, 12px)' }}
        >
          {/* Static venue data */}
          {hasStatic && (
            <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
              {staticField('Capacity', intel!.staticData.capacity)}
              {staticField('Curfew', intel!.staticData.curfew)}
              {staticField('Load-in', intel!.staticData.loadInNotes)}
              {staticField('Power', intel!.staticData.powerNotes)}
              {staticField('Parking', intel!.staticData.parkingNotes)}
              {staticField('Access', intel!.staticData.accessNotes)}
              {staticField('Stage', intel!.staticData.stageNotes)}
            </div>
          )}

          {/* Divider between sections */}
          {hasStatic && hasPastShows && (
            <div style={{ borderTop: '1px solid var(--stage-edge-subtle)' }} />
          )}

          {/* Past shows */}
          {hasPastShows && (
            <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 8px)' }}>
              <p
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: 'var(--stage-text-tertiary)' }}
              >
                Past shows ({intel!.pastShows.length})
              </p>
              {intel!.pastShows.map((show, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...STAGE_MEDIUM, delay: idx * 0.03 }}
                  className="flex flex-col"
                  style={{
                    gap: '4px',
                    padding: 'var(--stage-gap, 8px)',
                    borderRadius: 'var(--stage-radius-nested, 8px)',
                    backgroundColor: 'var(--ctx-well, var(--stage-input-bg))',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <p
                      className="text-sm font-medium tracking-tight truncate"
                      style={{ color: 'var(--stage-text-primary)' }}
                    >
                      {show.eventTitle}
                    </p>
                    <span
                      className="inline-flex items-center gap-1 text-xs shrink-0 ml-2"
                      style={{ color: 'var(--stage-text-tertiary)' }}
                    >
                      <Calendar size={11} aria-hidden />
                      {formatDate(show.eventDate)}
                    </span>
                  </div>
                  {show.venueNotes && (
                    <p
                      className="text-sm italic leading-relaxed"
                      style={{
                        color: 'var(--stage-text-secondary)',
                        paddingLeft: 'var(--stage-gap, 8px)',
                        borderLeft: '2px solid var(--stage-edge-subtle)',
                      }}
                    >
                      {show.venueNotes}
                    </p>
                  )}
                  {show.clientFeedback && (
                    <p
                      className="text-sm leading-relaxed"
                      style={{
                        color: 'var(--stage-text-secondary)',
                        paddingLeft: 'var(--stage-gap, 8px)',
                        borderLeft: '2px solid var(--stage-edge-subtle)',
                      }}
                    >
                      <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--stage-text-tertiary)' }}>
                        Client feedback:{' '}
                      </span>
                      {show.clientFeedback}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </StagePanel>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasStaticData(s: VenueStaticData): boolean {
  return !!(s.capacity || s.loadInNotes || s.powerNotes || s.parkingNotes || s.curfew || s.accessNotes || s.stageNotes);
}

function staticField(label: string, value: string | null): React.ReactNode {
  if (!value) return null;
  return (
    <div className="flex flex-col" style={{ gap: '1px' }}>
      <span
        className="text-xs font-medium uppercase tracking-widest"
        style={{ color: 'var(--stage-text-tertiary)' }}
      >
        {label}
      </span>
      <span
        className="text-sm tracking-tight"
        style={{ color: 'var(--stage-text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
