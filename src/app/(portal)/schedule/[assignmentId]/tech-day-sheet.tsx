'use client';

import { motion } from 'framer-motion';
import {
  Package,
  Clock,
  Truck,
  Zap,
  DoorOpen,
  Wrench,
} from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

interface GearItem {
  id: string;
  name: string;
  quantity: number;
  status: string;
  is_sub_rental: boolean;
}

interface CallTimeSlot {
  id: string;
  label: string;
  time: string;
}

export interface TechDaySheetProps {
  gearItems: GearItem[];
  callTimeSlots: CallTimeSlot[];
  transportMode: string | null;
  transportStatus: string | null;
  dockInfo: string | null;
  powerInfo: string | null;
  techRequirements: Record<string, unknown> | null;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function SectionHeader({ icon: Icon, label }: { icon: typeof Package; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-4 text-[var(--stage-text-tertiary)]" />
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
        {label}
      </h3>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const GEAR_STATUS_STYLES: Record<string, string> = {
  pulled: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
  staged: 'bg-[oklch(0.75_0.12_200/0.2)] text-[oklch(0.75_0.12_200)]',
  loaded: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
  pending: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
  returned: 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-tertiary)]',
};

const TRANSPORT_LABELS: Record<string, string> = {
  personal_vehicle: 'Personal vehicle',
  company_vehicle: 'Company vehicle',
  rental_truck: 'Rental truck',
  freight: 'Freight / shipping',
};

/* ── Component ───────────────────────────────────────────────────── */

export function TechDaySheet({
  gearItems,
  callTimeSlots,
  transportMode,
  transportStatus,
  dockInfo,
  powerInfo,
  techRequirements,
}: TechDaySheetProps) {
  const hasContent = gearItems.length > 0 || callTimeSlots.length > 0 || dockInfo || powerInfo || transportMode;

  if (!hasContent) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* Section label */}
      <div className="flex items-center gap-2">
        <Wrench className="size-4 text-[var(--stage-text-tertiary)]" />
        <h2 className="text-sm font-semibold text-[var(--stage-text-primary)]">Production details</h2>
      </div>

      {/* ── Call Time Slots ───────────────────────────────────────── */}
      {callTimeSlots.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Clock} label="Call times" />
          <div className="flex flex-col gap-1.5">
            {callTimeSlots.map((slot) => (
              <div key={slot.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-20 shrink-0 text-right font-mono text-[var(--stage-text-tertiary)]">
                  {formatTime(slot.time)}
                </span>
                <span className="text-[var(--stage-text-primary)]">{slot.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gear List ────────────────────────────────────────────── */}
      {gearItems.length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Package} label="Gear" />
          <div className="flex flex-col gap-2">
            {gearItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-[var(--stage-text-primary)]">
                    {item.name}
                  </span>
                  <span className="text-xs text-[var(--stage-text-tertiary)] ml-2">
                    x{item.quantity}
                  </span>
                  {item.is_sub_rental && (
                    <span className="text-[10px] font-medium text-[var(--stage-text-tertiary)] ml-2 uppercase">
                      sub-rental
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${GEAR_STATUS_STYLES[item.status] ?? GEAR_STATUS_STYLES.pending}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transport ────────────────────────────────────────────── */}
      {transportMode && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Truck} label="Transport" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--stage-text-primary)]">
              {TRANSPORT_LABELS[transportMode] ?? transportMode}
            </span>
            {transportStatus && (
              <span className="text-xs text-[var(--stage-text-tertiary)]">
                {transportStatus}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Venue Logistics ──────────────────────────────────────── */}
      {(dockInfo || powerInfo) && (
        <div className="flex flex-col gap-3 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={DoorOpen} label="Venue logistics" />
          {dockInfo && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-1">Loading dock</p>
              <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">{dockInfo}</p>
            </div>
          )}
          {powerInfo && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-1 flex items-center gap-1">
                <Zap className="size-3" /> Power
              </p>
              <p className="text-sm text-[var(--stage-text-secondary)] whitespace-pre-wrap">{powerInfo}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tech Requirements ────────────────────────────────────── */}
      {techRequirements && Object.keys(techRequirements).length > 0 && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Wrench} label="Technical requirements" />
          <div className="flex flex-col gap-1.5">
            {Object.entries(techRequirements).map(([key, val]) => (
              <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-[var(--stage-text-tertiary)]">{key.replace(/_/g, ' ')}</span>
                <span className="text-[var(--stage-text-primary)]">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
