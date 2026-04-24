'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StagePanel, StageReadout, StageDot } from '@/shared/ui/stage-panel';
import {
  STAGE_MEDIUM,
  STAGE_STAGGER_CHILDREN,
  STAGE_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

/* ═══════════════════════════════════════════════════════════════════════════
   DENSITY SYSTEM
   ═══════════════════════════════════════════════════════════════════════════ */

type DensityTier = 'spacious' | 'balanced' | 'dense';

/** Density-aware labels: conversational → terse → silkscreen */
const LABELS: Record<string, Record<DensityTier, string>> = {
  pipeline:       { spacious: 'Your pipeline',         balanced: 'Pipeline',        dense: 'PIPELINE' },
  upcoming:       { spacious: 'Upcoming shows',        balanced: 'Upcoming',        dense: 'UPCOMING' },
  activity:       { spacious: 'Recent activity',       balanced: 'Activity',        dense: 'ACTIVITY' },
  financials:     { spacious: 'Financial overview',    balanced: 'Financials',      dense: 'FINANCIALS' },
  cash:           { spacious: 'Cash position',         balanced: 'Cash position',   dense: 'CASH' },
  total_value:    { spacious: 'Total value',           balanced: 'Total value',     dense: 'TOTAL' },
  signed:         { spacious: 'Signed',                balanced: 'Signed',          dense: 'SIGNED' },
  proposals_out:  { spacious: 'Proposals out',         balanced: 'Proposals out',   dense: 'PROP OUT' },
  negotiating:    { spacious: 'In negotiation',        balanced: 'Negotiating',     dense: 'NEGO' },
  revenue_mtd:    { spacious: 'Revenue this month',    balanced: 'Revenue MTD',     dense: 'REV MTD' },
  outstanding:    { spacious: 'Outstanding invoices',  balanced: 'Outstanding',     dense: 'OUTSTANDING' },
  margin:         { spacious: 'Margin',                balanced: 'Margin',          dense: 'MARGIN' },
  invoices_out:   { spacious: 'Invoices out',          balanced: 'Invoices out',    dense: 'INV OUT' },
  overdue:        { spacious: 'Overdue',               balanced: 'Overdue',         dense: 'OVERDUE' },
  available:      { spacious: 'Available cash',        balanced: 'Available',       dense: 'AVAIL' },
  incoming:       { spacious: 'Incoming (30 days)',    balanced: 'Incoming (30d)',  dense: 'IN 30D' },
  outgoing:       { spacious: 'Outgoing (30 days)',    balanced: 'Outgoing (30d)',  dense: 'OUT 30D' },
  inputs:         { spacious: 'Form elements',         balanced: 'Input preview',   dense: 'INPUTS' },
  event_name:     { spacious: 'Event name',            balanced: 'Event name',      dense: 'EVENT' },
  call_time:      { spacious: 'Call time',             balanced: 'Call time',       dense: 'CT' },
};

function getLabel(key: string, density: DensityTier): string {
  return LABELS[key]?.[density] ?? key;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK DATA
   ═══════════════════════════════════════════════════════════════════════════ */

const MOCK_PIPELINE = [
  { id: '1', name: 'Meridian Corp — Annual Gala', value: 48000, status: 'proposed' as const, daysOld: 3 },
  { id: '2', name: 'Volta Touring — West Coast Leg', value: 124000, status: 'negotiating' as const, daysOld: 12 },
  { id: '3', name: 'Northshore Medical — Fundraiser', value: 22000, status: 'proposed' as const, daysOld: 1 },
  { id: '4', name: 'Ember Festival 2026', value: 310000, status: 'signed' as const, daysOld: 0 },
  { id: '5', name: 'Citadel Holdings — Q2 Summit', value: 67000, status: 'proposed' as const, daysOld: 7 },
];

const MOCK_UPCOMING = [
  { id: '1', name: 'Volta Touring — Denver', date: 'MAR 28', callTime: '06:00', venue: 'Red Rocks Amphitheatre', crewConfirmed: 8, crewTotal: 10, gearPulled: true },
  { id: '2', name: 'Northshore Medical', date: 'MAR 30', callTime: '08:00', venue: 'The Ritz-Carlton Ballroom', crewConfirmed: 4, crewTotal: 4, gearPulled: false },
  { id: '3', name: 'Ember Festival — Day 1', date: 'APR 02', callTime: '05:00', venue: 'Pier 70 Complex', crewConfirmed: 12, crewTotal: 24, gearPulled: false },
];

const MOCK_ACTIONS = [
  { id: '1', text: 'Crew confirmation pending: Alex Rivera (Denver)', time: '2h ago', type: 'warning' as const },
  { id: '2', text: 'Proposal viewed by Meridian Corp', time: '4h ago', type: 'info' as const },
  { id: '3', text: 'Invoice #1042 paid — $12,400', time: '6h ago', type: 'success' as const },
  { id: '4', text: 'Ember Festival deposit overdue', time: '1d ago', type: 'error' as const },
  { id: '5', text: 'Gear return logged: QSC KLA12 x4', time: '1d ago', type: 'info' as const },
];

const statusStripe = (s: string) => {
  switch (s) {
    case 'proposed': return 'info' as const;
    case 'negotiating': return 'warning' as const;
    case 'signed': return 'success' as const;
    default: return 'neutral' as const;
  }
};

const actionDot = (t: string) => {
  switch (t) {
    case 'warning': return 'warning' as const;
    case 'info': return 'accent' as const;
    case 'success': return 'success' as const;
    case 'error': return 'error' as const;
    default: return 'neutral' as const;
  }
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DENSITY TOGGLE (floating, always accessible)
   ═══════════════════════════════════════════════════════════════════════════ */

function DensityToggle({ value, onChange }: { value: DensityTier; onChange: (t: DensityTier) => void }) {
  const tiers: { key: DensityTier; label: string }[] = [
    { key: 'spacious', label: 'Spacious' },
    { key: 'balanced', label: 'Balanced' },
    { key: 'dense', label: 'Dense' },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-1 stage-panel p-1.5" style={{ borderRadius: '9999px' }}>
      {tiers.map((tier) => (
        <button
          key={tier.key}
          onClick={() => onChange(tier.key)}
          className="relative px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-[80ms]"
          style={{
            color: value === tier.key ? 'oklch(0.10 0 0)' : 'var(--stage-text-secondary)',
            background: value === tier.key ? 'var(--stage-accent)' : 'transparent',
          }}
        >
          {tier.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PULSE STRIP
   ═══════════════════════════════════════════════════════════════════════════ */

function PulseStrip() {
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);
  const nowHour = 9;
  const nowPct = ((nowHour - 6) / 17) * 100;

  return (
    <StagePanel padding="sm" className="relative h-14 flex items-center overflow-visible">
      <div className="relative w-full h-full flex items-end px-2">
        {hours.map((h) => (
          <div key={h} className="flex-1 flex flex-col items-center justify-end h-full">
            {h % 3 === 0 && (
              <span className="stage-readout-sm" style={{ color: 'var(--stage-text-tertiary)', fontSize: '9px' }}>
                {String(h).padStart(2, '0')}:00
              </span>
            )}
            <div
              className="w-px mt-1"
              style={{
                height: h % 3 === 0 ? '10px' : '5px',
                background: 'var(--stage-edge-top)',
              }}
            />
          </div>
        ))}

        {/* Event block */}
        <div className="absolute inset-x-2 top-1.5 h-5">
          <div
            className="absolute h-full"
            style={{
              left: '0%',
              width: `${(10 / 17) * 100}%`,
              background: 'var(--stage-accent-muted)',
              borderLeft: '2px solid var(--stage-accent)',
              borderRadius: 'var(--stage-radius-nested, var(--stage-radius-panel))',
            }}
          >
            <span className="stage-readout-sm text-micro px-1.5 leading-5 truncate block" style={{ color: 'var(--stage-accent)' }}>
              Volta — Denver
            </span>
          </div>
        </div>

        {/* Now marker */}
        <div
          className="stage-now-marker"
          style={{ left: `calc(${nowPct}% + 8px)` }}
        />
      </div>
    </StagePanel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT PANELS
   ═══════════════════════════════════════════════════════════════════════════ */

function PipelinePanel({ density }: { density: DensityTier }) {
  const l = (key: string) => getLabel(key, density);
  const totalPipeline = MOCK_PIPELINE.reduce((s, d) => s + d.value, 0);
  const signedValue = MOCK_PIPELINE.filter(d => d.status === 'signed').reduce((s, d) => s + d.value, 0);

  return (
    <StagePanel padding="lg" className="h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-5">
        <span className="stage-label">{l('pipeline')}</span>
        <StageReadout label={l('total_value')} value={formatCurrency(totalPipeline)} size="lg" />
      </div>

      <div className="flex gap-6 mb-5">
        <StageReadout label={l('signed')} value={formatCurrency(signedValue)} size="sm" />
        <StageReadout label={l('proposals_out')} value={MOCK_PIPELINE.filter(d => d.status === 'proposed').length} size="sm" />
        <StageReadout label={l('negotiating')} value={MOCK_PIPELINE.filter(d => d.status === 'negotiating').length} size="sm" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col" style={{ gap: 'var(--stage-gap)' }}>
        {MOCK_PIPELINE.map((deal) => (
          <StagePanel
            key={deal.id}
            nested
            stripe={statusStripe(deal.status)}
            padding="sm"
            className="flex items-center justify-between"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium truncate" style={{ color: 'var(--stage-text-primary)' }}>{deal.name}</span>
              <span className="stage-label" style={{ fontSize: '9px' }}>
                {deal.status.toUpperCase()} · {deal.daysOld}D
              </span>
            </div>
            <span className="stage-readout text-sm shrink-0 ml-3">{formatCurrency(deal.value)}</span>
          </StagePanel>
        ))}
      </div>
    </StagePanel>
  );
}

function UpcomingShowsPanel({ density }: { density: DensityTier }) {
  const l = (key: string) => getLabel(key, density);

  return (
    <StagePanel padding="lg" className="h-full flex flex-col">
      <span className="stage-label mb-4">{l('upcoming')}</span>

      <div className="flex-1 min-h-0 flex flex-col" style={{ gap: 'var(--stage-gap)' }}>
        {MOCK_UPCOMING.map((show) => {
          const crewOk = show.crewConfirmed === show.crewTotal;
          const allGreen = crewOk && show.gearPulled;

          return (
            <StagePanel
              key={show.id}
              nested
              stripe={allGreen ? 'success' : crewOk ? 'warning' : 'error'}
              padding="sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--stage-text-primary)' }}>
                    {show.name}
                  </span>
                  <span className="stage-label" style={{ fontSize: '9px' }}>{show.venue}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="stage-readout text-sm">{show.date}</span>
                  <span className="stage-readout-sm" style={{ color: 'var(--stage-accent)' }}>
                    CT {show.callTime}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-2">
                <StageDot
                  status={crewOk ? 'success' : 'error'}
                  label={`Crew ${show.crewConfirmed}/${show.crewTotal}`}
                />
                <StageDot
                  status={show.gearPulled ? 'success' : 'warning'}
                  label={show.gearPulled ? 'Gear pulled' : 'Gear pending'}
                />
              </div>
            </StagePanel>
          );
        })}
      </div>
    </StagePanel>
  );
}

function ActionStreamPanel({ density }: { density: DensityTier }) {
  const l = (key: string) => getLabel(key, density);

  return (
    <StagePanel padding="lg" className="h-full flex flex-col">
      <span className="stage-label mb-4">{l('activity')}</span>

      <div className="flex-1 min-h-0 flex flex-col" style={{ gap: '2px' }}>
        {MOCK_ACTIONS.map((action) => (
          <div
            key={action.id}
            className="flex items-start gap-3 py-2.5 px-2 rounded"
            style={{ borderRadius: 'var(--stage-radius-nested, 8px)' }}
          >
            <StageDot status={actionDot(action.type)} className="mt-1.5" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm" style={{ color: 'var(--stage-text-primary)' }}>
                {action.text}
              </span>
              <span className="stage-readout-sm" style={{ color: 'var(--stage-text-tertiary)', fontSize: '10px' }}>
                {action.time}
              </span>
            </div>
          </div>
        ))}
      </div>
    </StagePanel>
  );
}

function FinancialPanel({ density }: { density: DensityTier }) {
  const l = (key: string) => getLabel(key, density);

  return (
    <StagePanel padding="lg" className="h-full flex flex-col">
      <span className="stage-label mb-4">{l('financials')}</span>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <StageReadout label={l('revenue_mtd')} value="$86,400" size="lg" />
        <StageReadout label={l('outstanding')} value="$34,200" size="lg" />
      </div>

      <div className="stage-divider mb-4" />

      <div className="grid grid-cols-3 gap-3">
        <StageReadout label={l('margin')} value="42%" size="sm" />
        <StageReadout label={l('invoices_out')} value="7" size="sm" />
        <StageReadout label={l('overdue')} value="1" size="sm" />
      </div>

      <div className="mt-4">
        <div className="w-full h-1.5" style={{ background: 'oklch(1 0 0 / 0.06)', borderRadius: 'var(--stage-radius-pill)' }}>
          <div
            className="h-full"
            style={{ width: '42%', background: 'var(--stage-accent)', borderRadius: 'var(--stage-radius-pill)' }}
          />
        </div>
      </div>
    </StagePanel>
  );
}

function CashPositionPanel({ density }: { density: DensityTier }) {
  const l = (key: string) => getLabel(key, density);

  return (
    <StagePanel padding="lg" className="h-full flex flex-col justify-between">
      <span className="stage-label">{l('cash')}</span>
      <StageReadout label={l('available')} value="$142,800" size="hero" />
      <div className="flex gap-4">
        <StageReadout label={l('incoming')} value="+$48,000" size="sm" />
        <StageReadout label={l('outgoing')} value="-$31,200" size="sm" />
      </div>
    </StagePanel>
  );
}

function InputPreviewPanel({ density }: { density: DensityTier }) {
  const l = (key: string) => getLabel(key, density);

  return (
    <StagePanel padding="lg" className="h-full flex flex-col">
      <span className="stage-label mb-4">{l('inputs')}</span>
      <div className="flex flex-col gap-4">
        <div>
          <label className="stage-label block mb-2">{l('event_name')}</label>
          <input className="stage-input" placeholder="Enter event name..." />
        </div>
        <div>
          <label className="stage-label block mb-2">{l('call_time')}</label>
          <input className="stage-input stage-readout" placeholder="00:00" />
        </div>
        <div className="flex gap-2 mt-2">
          <button className="stage-btn stage-btn-primary">Confirm</button>
          <button className="stage-btn stage-btn-secondary">Cancel</button>
          <button className="stage-btn stage-btn-ghost">Reset</button>
        </div>
      </div>
    </StagePanel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function StagePrototypePageClient() {
  const [density, setDensity] = useState<DensityTier>('balanced');

  // Apply data-density to document for CSS custom property resolution
  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    return () => {
      document.documentElement.removeAttribute('data-density');
    };
  }, [density]);

  return (
    <div className="bg-stage-void min-h-screen">
      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          opacity: 0.025,
          mixBlendMode: 'overlay',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 py-4">
        {/* Header strip */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-medium tracking-tight" style={{ color: 'var(--stage-text-primary)' }}>
              Unusonic
            </span>
            <span className="stage-label">
              {density === 'spacious' && 'Progressive Materiality — Spacious'}
              {density === 'balanced' && 'Progressive Materiality — Balanced'}
              {density === 'dense' && 'Progressive Materiality — Dense'}
            </span>
          </div>
          <span className="stage-readout-sm" style={{ color: 'var(--stage-accent)' }}>
            TUE MAR 25 · 09:14
          </span>
        </div>

        {/* Pulse Strip */}
        <div className="mb-3">
          <PulseStrip />
        </div>

        {/* Main Bento Grid */}
        <motion.div
          className="stage-grid"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridAutoRows: 'minmax(280px, auto)',
          }}
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: { staggerChildren: STAGE_STAGGER_CHILDREN, delayChildren: STAGE_STAGGER_DELAY },
            },
            hidden: {},
          }}
        >
          <motion.div
            className="col-span-2"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={STAGE_MEDIUM}
          >
            <PipelinePanel density={density} />
          </motion.div>

          <motion.div
            className="col-span-2"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={STAGE_MEDIUM}
          >
            <UpcomingShowsPanel density={density} />
          </motion.div>

          <motion.div
            className="col-span-2"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={STAGE_MEDIUM}
          >
            <ActionStreamPanel density={density} />
          </motion.div>

          <motion.div
            className="col-span-2"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={STAGE_MEDIUM}
          >
            <FinancialPanel density={density} />
          </motion.div>

          <motion.div
            className="col-span-2"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={STAGE_MEDIUM}
          >
            <CashPositionPanel density={density} />
          </motion.div>

          <motion.div
            className="col-span-2"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={STAGE_MEDIUM}
          >
            <InputPreviewPanel density={density} />
          </motion.div>
        </motion.div>
      </div>

      {/* Floating density toggle — always accessible */}
      <DensityToggle value={density} onChange={setDensity} />
    </div>
  );
}
