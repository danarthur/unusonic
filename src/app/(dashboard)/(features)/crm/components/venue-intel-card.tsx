'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Building2, Calendar, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { getVenueIntel, type VenueIntel, type VenueStaticData } from '../actions/get-venue-intel';
import { getCoiStatus, type CoiStatus } from '@/features/network-data/api/entity-document-actions';

type VenueIntelCardProps = {
  venueEntityId: string;
  /** Pre-resolved intel from a parent bundle (e.g. PlanBundle). When both
   *  initial props are non-null, the card skips the mount fetch and warm-
   *  starts. Mutations and venueEntityId changes still trigger a refetch. */
  initialIntel?: VenueIntel | null;
  initialCoiStatus?: CoiStatus | null;
};

export function VenueIntelCard({
  venueEntityId,
  initialIntel = null,
  initialCoiStatus = null,
}: VenueIntelCardProps) {
  const hasInitial = initialIntel !== null || initialCoiStatus !== null;
  const [intel, setIntel] = useState<VenueIntel | null>(initialIntel);
  const [coiInfo, setCoiInfo] = useState<CoiStatus | null>(initialCoiStatus);
  const [loading, setLoading] = useState(!hasInitial);

  useEffect(() => {
    let cancelled = false;
    // Warm-start path: if the parent provided initial data for this venue,
    // skip the mount fetch. Subsequent venueEntityId changes still refetch
    // because the dep array fires.
    if (hasInitial) {
      setIntel(initialIntel);
      setCoiInfo(initialCoiStatus);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      getVenueIntel(venueEntityId),
      getCoiStatus(venueEntityId),
    ]).then(([venueData, coiData]) => {
      if (!cancelled) {
        setIntel(venueData);
        setCoiInfo(coiData);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    // hasInitial / initialIntel / initialCoiStatus intentionally excluded —
    // we only honour the warm-start on the FIRST render for a given
    // venueEntityId; once the user mutates the venue downstream we want
    // the regular fetch path to take over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const hasCoi = coiInfo !== null; // always show COI row — indicates status even when no document

  if (!hasStatic && !hasPastShows && !hasCoi) {
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
          {/* COI status */}
          {hasCoi && <CoiStatusRow coiInfo={coiInfo!} />}

          {/* Static venue data — grouped by section */}
          {hasStatic && <StaticDataSections data={intel!.staticData} />}

          {/* Divider between sections */}
          {(hasStatic || hasCoi) && hasPastShows && (
            <div style={{ borderTop: '1px solid var(--stage-edge-subtle)' }} />
          )}

          {/* Past shows */}
          {hasPastShows && (
            <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 8px)' }}>
              <p
                className="stage-label"
                style={{ color: 'var(--stage-text-tertiary)' }}
              >
                Past shows ({intel!.pastShows.length})
              </p>
              {intel!.pastShows.map((show, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={STAGE_MEDIUM}
                  className="flex flex-col"
                  style={{
                    gap: '4px',
                    padding: 'var(--stage-gap, 8px)',
                    borderRadius: 'var(--stage-radius-nested, 8px)',
                    backgroundColor: 'var(--ctx-well)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <p
                      className="stage-readout truncate"
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
                      <span className="stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>
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

// ── COI Status Row ──────────────────────────────────────────────────────────

function CoiStatusRow({ coiInfo }: { coiInfo: CoiStatus }) {
  if (!coiInfo.hasDocument) {
    return (
      <div
        className="flex items-center rounded-lg px-3 py-2"
        style={{
          gap: '8px',
          backgroundColor: 'oklch(1 0 0 / 0.03)',
          borderRadius: 'var(--stage-radius-nested, 8px)',
        }}
      >
        <ShieldQuestion size={14} style={{ color: 'var(--stage-text-tertiary)' }} aria-hidden />
        <span className="stage-badge-text" style={{ color: 'var(--stage-text-tertiary)' }}>
          No COI on file
        </span>
      </div>
    );
  }

  const expiresAt = coiInfo.expiresAt;
  if (!expiresAt) {
    return (
      <div
        className="flex items-center rounded-lg px-3 py-2"
        style={{
          gap: '8px',
          backgroundColor: 'oklch(1 0 0 / 0.03)',
          borderRadius: 'var(--stage-radius-nested, 8px)',
        }}
      >
        <ShieldCheck size={14} style={{ color: 'var(--color-unusonic-success)' }} aria-hidden />
        <span className="stage-badge-text" style={{ color: 'var(--color-unusonic-success)' }}>
          COI on file (no expiry set)
        </span>
      </div>
    );
  }

  const now = new Date();
  const expiry = new Date(expiresAt + 'T00:00:00');
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let icon = ShieldCheck;
  let color = 'var(--color-unusonic-success)'; // green
  let label = `COI valid until ${formatDate(expiresAt)}`;

  if (diffDays < 0) {
    icon = ShieldX;
    color = 'var(--color-unusonic-error)'; // red
    label = `COI expired ${formatDate(expiresAt)}`;
  } else if (diffDays <= 30) {
    icon = ShieldAlert;
    color = 'var(--color-unusonic-warning)'; // amber
    label = `COI expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  }

  const Icon = icon;

  return (
    <div
      className="flex items-center rounded-lg px-3 py-2"
      style={{
        gap: '8px',
        backgroundColor: 'oklch(1 0 0 / 0.03)',
        borderRadius: 'var(--stage-radius-nested, 8px)',
      }}
    >
      <Icon size={14} style={{ color }} aria-hidden />
      <span className="stage-badge-text" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasStaticData(s: VenueStaticData): boolean {
  return !!(
    s.capacity || s.loadInNotes || s.powerNotes || s.parkingNotes ||
    s.curfew || s.accessNotes || s.stageNotes || s.dockAddress ||
    s.dockHours || s.loadInWindow || s.loadOutWindow || s.riggingType ||
    s.powerVoltage || s.powerPhase || s.weatherExposure ||
    s.noiseOrdinance || s.freightElevator || s.crewParkingNotes ||
    s.stageWidth || s.stageDepth || s.trimHeight || s.ceilingHeight ||
    s.housePowerAmps || s.housePaIncluded || s.houseLightingIncluded ||
    s.greenRoomCount || s.greenRoomNotes || s.dressingRoomCount ||
    s.productionOffice || s.cateringKitchen || s.venueContactName ||
    s.unionLocal || s.nearestHospital || s.dockDoorHeight ||
    s.dockDoorWidth || s.forkliftAvailable || s.riggingPointsCount
  );
}

function staticField(label: string, value: string | null): React.ReactNode {
  if (!value) return null;
  return (
    <div className="flex flex-col" style={{ gap: '1px' }}>
      <span
        className="stage-label"
        style={{ color: 'var(--stage-text-tertiary)' }}
      >
        {label}
      </span>
      <span className="stage-readout">
        {value}
      </span>
    </div>
  );
}

// ── Compose helpers (merge related fields onto single rows) ─────────────────

function composePower(amps: string | null, voltage: string | null, phase: string | null): string | null {
  const parts: string[] = [];
  if (amps) parts.push(`${amps}A`);
  if (voltage) parts.push(voltage);
  if (phase) parts.push(phase);
  return parts.length > 0 ? parts.join(', ') : null;
}

function composeStageDims(width: string | null, depth: string | null): string | null {
  if (!width && !depth) return null;
  if (width && depth) return `${width}ft W x ${depth}ft D`;
  return width ? `${width}ft W` : `${depth}ft D`;
}

function composeRigging(type: string | null, points: string | null, weight: string | null): string | null {
  if (!type) return null;
  const label = type.replace(/_/g, ' ');
  const details: string[] = [];
  if (points) details.push(`${points} points`);
  if (weight) details.push(`${weight} lbs/point`);
  return details.length > 0 ? `${label} (${details.join(', ')})` : label;
}

function composeDockDoors(width: string | null, height: string | null): string | null {
  if (!width && !height) return null;
  if (width && height) return `${width}W x ${height}H`;
  return width ? `${width}W` : `${height}H`;
}

function composeCount(count: string | null, notes: string | null): string | null {
  if (!count && !notes) return null;
  if (count && notes) return `${count} -- ${notes}`;
  return count ?? notes;
}

function composeContact(name: string | null, phone: string | null): string | null {
  if (!name && !phone) return null;
  if (name && phone) return `${name} (${phone})`;
  return name ?? phone;
}

// ── StaticSection — renders a group label + fields, skips if all fields are null

function StaticSection({ label, fields }: { label: string; fields: React.ReactNode[] }) {
  const nonNull = fields.filter(Boolean);
  if (nonNull.length === 0) return null;
  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
      <span
        className="stage-label"
        style={{ color: 'var(--stage-text-tertiary)', marginBottom: '2px' }}
      >
        {label}
      </span>
      {nonNull}
    </div>
  );
}

// ── StaticDataSections — all grouped sections for venue static data ─────────

function StaticDataSections({ data: s }: { data: VenueStaticData }) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
      <StaticSection label="Loading and access" fields={[
        staticField('Capacity', s.capacity),
        staticField('Dock address', s.dockAddress),
        staticField('Dock hours', s.dockHours),
        staticField('Dock doors', composeDockDoors(s.dockDoorWidth, s.dockDoorHeight)),
        staticField('Load-in', s.loadInWindow),
        staticField('Load-out', s.loadOutWindow),
        staticField('Load-in notes', s.loadInNotes),
        staticField('Freight elevator', s.freightElevator),
        staticField('Forklift', s.forkliftAvailable),
        staticField('Access', s.accessNotes),
      ]} />
      <StaticSection label="Parking" fields={[
        staticField('Production parking', s.parkingNotes),
        staticField('Crew parking', s.crewParkingNotes),
      ]} />
      <StaticSection label="Stage and technical" fields={[
        staticField('Stage', s.stageNotes),
        staticField('Dimensions', composeStageDims(s.stageWidth, s.stageDepth)),
        staticField('Trim height', s.trimHeight),
        staticField('Ceiling height', s.ceilingHeight),
        staticField('Rigging', composeRigging(s.riggingType, s.riggingPointsCount, s.riggingWeightPerPoint)),
        staticField('Power', composePower(s.housePowerAmps, s.powerVoltage, s.powerPhase)),
        staticField('Power notes', s.powerNotes),
        staticField('House PA', s.housePaIncluded ? 'Included' : null),
        staticField('House lighting', s.houseLightingIncluded ? 'Included' : null),
      ]} />
      <StaticSection label="Backstage" fields={[
        staticField('Green rooms', composeCount(s.greenRoomCount, s.greenRoomNotes)),
        staticField('Dressing rooms', s.dressingRoomCount),
        staticField('Production office', s.productionOffice),
        staticField('Catering kitchen', s.cateringKitchen),
        staticField('Venue contact', composeContact(s.venueContactName, s.venueContactPhone)),
      ]} />
      <StaticSection label="Compliance" fields={[
        staticField('Curfew', s.curfew),
        staticField('Noise ordinance', s.noiseOrdinance),
        staticField('Union', s.unionLocal),
        staticField('Weather exposure', s.weatherExposure),
        staticField('Nearest hospital', s.nearestHospital),
      ]} />
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
