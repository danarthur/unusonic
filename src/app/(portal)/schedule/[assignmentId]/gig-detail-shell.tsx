'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { ArrowLeft, MapPin, Navigation, Clock, Check, Send, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { OverviewTab } from './tabs/overview-tab';
import { TimelineTab } from './tabs/timeline-tab';
import { DetailsTab } from './tabs/details-tab';
import { ProgramTab } from './program-tab';
import type { ProgramTabProps } from './program-tab';
import { VenueCrewCard, type VenueCrewCardProps } from './venue-crew-card';

/* ── Types ───────────────────────────────────────────────────────── */

export interface GigDetailShellProps {
  // Header info (always visible)
  eventTitle: string;
  eventDate: string | null;
  eventArchetype: string | null;
  venueName: string | null;
  venueAddress: string | null;
  mapsUrl: string | null;
  role: string;
  status: string;
  assignmentId: string;

  // Overview tab data
  payDisplay: string | null;
  payRate: number | null;
  payRateType: string | null;
  scheduledHours: number | null;
  clientInfo: {
    clientName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    guestCount: number | null;
  } | null;

  // Program tab data (DJ)
  eventId: string;
  djPrepInitial: Record<string, unknown>;
  eventArchetypeForTemplate: string | null;
  programData?: Omit<ProgramTabProps, 'eventId' | 'eventArchetype'> | null;
  djTemplates?: unknown[];

  // Details tab data
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

  // Role-aware tab set
  gigProfileKey: string;

  // Tech-specific data
  techData?: {
    gearItems: unknown[];
    callTimeSlots: unknown[];
    transportMode: string | null;
    transportStatus: string | null;
    dockInfo: string | null;
    powerInfo: string | null;
    techRequirements: Record<string, unknown> | null;
  } | null;

  // Band-specific data
  bandData?: {
    eventId: string;
    setlists: unknown[];
    initialSetlistId: string | null;
    initialSetTime: string | null;
    initialGigNotes: string | null;
  } | null;

  // ROS data for timeline tab
  rosCues?: unknown[];
  rosSections?: unknown[];
  rosCrewEntries?: { entity_id: string; display_name: string; role: string | null }[];

  // Venue crew data for VenueCrewCard
  venueCrewData?: VenueCrewCardProps | null;

  // Bring list: crew-sourced gear this person needs to bring
  bringList?: {
    items: { id: string; name: string; quantity: number; category: string | null }[];
    gearNotes: string | null;
  } | null;

  // Multi-day: sibling events in the same project
  siblingEvents?: {
    eventId: string;
    title: string | null;
    startsAt: string | null;
    assignmentId: string | null;
    isCurrentEvent: boolean;
  }[] | null;
}

/* ── Tab Definitions ─────────────────────────────────────────────── */

interface TabDef {
  id: string;
  label: string;
}

function getTimelineLabel(archetype?: string | null): string {
  const corporate = ['corporate_gala', 'conference', 'awards_show', 'product_launch'];
  const multiDay = ['festival'];
  if (corporate.includes(archetype ?? '')) return 'Run of show';
  if (multiDay.includes(archetype ?? '')) return 'Production schedule';
  return 'Timeline';
}

function getTabsForProfile(profileKey: string, archetype?: string | null): TabDef[] {
  const timelineLabel = getTimelineLabel(archetype);
  switch (profileKey) {
    case 'dj_entertainer':
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'program', label: 'Program' },
        { id: 'details', label: 'Details' },
      ];
    case 'band_musical_act':
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'details', label: 'Details' },
      ];
    case 'tech_stagehand':
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'details', label: 'Details' },
      ];
    default:
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'details', label: 'Details' },
      ];
  }
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
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${styles[status] ?? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'}`}
    >
      {Icon && <Icon className="size-3" />}
      {status}
    </span>
  );
}

function formatEventDate(iso: string | null): string {
  if (!iso) return 'Date TBD';
  return format(new Date(iso), 'EEEE, MMMM d, yyyy');
}

/* ── Shell ────────────────────────────────────────────────────────── */

export function GigDetailShell(props: GigDetailShellProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabs = useMemo(
    () => getTabsForProfile(props.gigProfileKey, props.eventArchetype),
    [props.gigProfileKey],
  );

  const activeTab = searchParams.get('tab') ?? 'overview';
  // Validate — fall back to overview if unknown
  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'overview';

  const setTab = useCallback(
    (tabId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', tabId);
      }
      const qs = params.toString();
      router.replace(`?${qs}`, { scroll: false });
    },
    [searchParams, router],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flex flex-col gap-0 pb-8"
    >
      {/* ── Sticky Header ──────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[var(--stage-void)] pb-0">
        {/* Back link */}
        <div className="pt-4 pb-3">
          <Link
            href="/schedule"
            className="flex items-center gap-1.5 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms] w-fit"
          >
            <ArrowLeft className="size-4" />
            Schedule
          </Link>
        </div>

        {/* Title + status */}
        <div className="flex items-start justify-between gap-3 pb-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--stage-text-primary)] leading-snug">
              {props.eventTitle}
            </h1>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">
              {formatEventDate(props.eventDate)}
              {props.eventArchetype && (
                <span className="text-[var(--stage-text-secondary)]">
                  {' '}
                  &middot; {props.eventArchetype}
                </span>
              )}
            </p>
          </div>
          <StatusBadge status={props.status} />
        </div>

        {/* Venue strip */}
        {props.venueName && (
          <div className="flex items-center gap-3 pb-3 text-sm">
            <div className="flex items-center gap-1.5 text-[var(--stage-text-secondary)]">
              <MapPin className="size-3.5 shrink-0" />
              <span>{props.venueName}</span>
            </div>
            {props.mapsUrl && (
              <a
                href={props.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[var(--stage-text-primary)] hover:opacity-80 transition-opacity duration-[80ms] font-medium"
              >
                <Navigation className="size-3.5" />
                Directions
              </a>
            )}
          </div>
        )}

        {/* Multi-day: day picker */}
        {props.siblingEvents && props.siblingEvents.length > 1 && (
          <div className="flex items-center gap-1.5 -mx-4 px-4 py-2 border-b border-[oklch(1_0_0/0.04)] overflow-x-auto">
            {props.siblingEvents.map((sib) => {
              const dayLabel = sib.startsAt
                ? new Date(sib.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : sib.title ?? 'Day';
              return (
                <a
                  key={sib.eventId}
                  href={sib.assignmentId ? `/schedule/${sib.assignmentId}` : undefined}
                  className={`
                    shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-[80ms]
                    ${sib.isCurrentEvent
                      ? 'bg-[oklch(1_0_0/0.1)] text-[var(--stage-text-primary)]'
                      : sib.assignmentId
                        ? 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.04)] cursor-pointer'
                        : 'text-[var(--stage-text-tertiary)] cursor-default'
                    }
                  `}
                >
                  {dayLabel}
                </a>
              );
            })}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-[oklch(1_0_0/0.06)] -mx-4 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`relative px-3 py-2.5 text-sm font-medium transition-colors duration-[80ms] ${
                resolvedTab === tab.id
                  ? 'text-[var(--stage-text-primary)]'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
              }`}
            >
              {tab.label}
              {resolvedTab === tab.id && (
                <motion.div
                  layoutId="gig-tab-indicator"
                  className="absolute bottom-0 left-3 right-3 h-0.5 bg-[var(--stage-accent)] rounded-full"
                  transition={STAGE_LIGHT}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────── */}
      <div className="pt-6">
        {resolvedTab === 'overview' && (
          <>
            <OverviewTab
              role={props.role}
              status={props.status}
              payDisplay={props.payDisplay}
              payRate={props.payRate}
              payRateType={props.payRateType}
              scheduledHours={props.scheduledHours}
              clientInfo={props.clientInfo}
              eventDate={props.eventDate}
              eventArchetype={props.eventArchetype}
              venueName={props.venueName}
              venueAddress={props.venueAddress}
              mapsUrl={props.mapsUrl}
              assignmentId={props.assignmentId}
            />
            {props.venueCrewData && (
              <div className="mt-5">
                <VenueCrewCard {...props.venueCrewData} />
              </div>
            )}
            {props.bringList && (
              <BringListCard items={props.bringList.items} gearNotes={props.bringList.gearNotes} />
            )}
          </>
        )}

        {resolvedTab === 'program' && props.gigProfileKey === 'dj_entertainer' && props.programData && (
          <ProgramTab
            eventId={props.eventId}
            eventArchetype={props.eventArchetype}
            {...props.programData}
          />
        )}

        {/* Fallback: admin ROS timeline for non-DJ profiles that still have a timeline tab */}
        {resolvedTab === 'timeline' && (
          <TimelineTab
            eventId={props.eventId}
            eventSummary={{
              title: props.eventTitle,
              starts_at: props.eventDate,
              location_name: props.venueName,
              location_address: props.venueAddress,
              client_name: props.clientInfo?.clientName ?? null,
            }}
          />
        )}

        {resolvedTab === 'details' && (
          <DetailsTab
            crewMembers={props.crewMembers}
            showDayContacts={props.showDayContacts}
            logistics={props.logistics}
            dealNotes={props.dealNotes}
            specialNotes={props.specialNotes}
            documents={props.documents}
            proposalItems={props.proposalItems}
          />
        )}

      </div>
    </motion.div>
  );
}

/* ── BringListCard ─────────────────────────────────────────────────── */

function BringListCard({
  items,
  gearNotes,
}: {
  items: { id: string; name: string; quantity: number; category: string | null }[];
  gearNotes: string | null;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[oklch(1_0_0/0.08)] bg-[oklch(1_0_0/0.03)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="size-4 text-[var(--stage-text-secondary)]" />
        <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
          Your bring list
        </h3>
      </div>

      {gearNotes && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed mb-3 pl-6">
          {gearNotes}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2 pl-6">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--stage-text-primary)] tracking-tight">
                {item.name}
              </span>
              <div className="flex items-center gap-2">
                {item.quantity > 1 && (
                  <span className="text-xs tabular-nums text-[var(--stage-text-tertiary)]">
                    x{item.quantity}
                  </span>
                )}
                {item.category && (
                  <span className="text-xs text-[var(--stage-text-tertiary)] px-1.5 py-0.5 rounded bg-[oklch(1_0_0/0.06)]">
                    {item.category}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && !gearNotes && (
        <p className="text-xs text-[var(--stage-text-tertiary)] pl-6">
          No specific items listed
        </p>
      )}
    </div>
  );
}
