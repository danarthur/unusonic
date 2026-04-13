'use client';

import { useState } from 'react';
import {
  MapPin,
  Phone,
  Clock,
  Wifi,
  CarFront,
  DoorOpen,
  Check,
  Copy,
} from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────────── */

export interface VenueCrewCardProps {
  dockAddress: string | null;
  venueContactName: string | null;
  venueContactPhone: string | null;
  loadInWindow: string | null;
  wifiCredentials: string | null;
  parkingNotes: string | null;
  crewParkingNotes: string | null;
  accessNotes: string | null;
}

/* ── Component ───────────────────────────────────────────────────── */

export function VenueCrewCard({
  dockAddress,
  venueContactName,
  venueContactPhone,
  loadInWindow,
  wifiCredentials,
  parkingNotes,
  crewParkingNotes,
  accessNotes,
}: VenueCrewCardProps) {
  const hasContent = !!(
    dockAddress || venueContactPhone || loadInWindow ||
    wifiCredentials || parkingNotes || crewParkingNotes || accessNotes
  );

  if (!hasContent) return null;

  const parkingDisplay = [crewParkingNotes, parkingNotes].filter(Boolean).join(' \u2014 ');

  return (
    <div
      className="flex flex-col gap-0 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)] overflow-hidden"
      data-surface="surface"
    >
      {/* Dock address — tappable navigate link */}
      {dockAddress && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(dockAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3.5 border-b border-[oklch(1_0_0/0.04)] active:bg-[oklch(1_0_0/0.04)] transition-colors duration-[80ms]"
        >
          <MapPin className="size-5 shrink-0 text-[var(--stage-text-secondary)]" />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="stage-label text-[var(--stage-text-tertiary)]">
              Navigate
            </span>
            <span className="text-sm font-medium text-[var(--stage-text-primary)] leading-snug">
              {dockAddress}
            </span>
          </div>
        </a>
      )}

      {/* Venue contact — tappable tel link */}
      {venueContactPhone && (
        <a
          href={`tel:${venueContactPhone}`}
          className="flex items-center gap-3 px-4 py-3.5 border-b border-[oklch(1_0_0/0.04)] active:bg-[oklch(1_0_0/0.04)] transition-colors duration-[80ms]"
        >
          <Phone className="size-5 shrink-0 text-[var(--stage-text-secondary)]" />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            {venueContactName && (
              <span className="stage-label text-[var(--stage-text-tertiary)]">
                {venueContactName}
              </span>
            )}
            <span className="text-sm font-medium text-[var(--stage-text-primary)]">
              {venueContactPhone}
            </span>
          </div>
        </a>
      )}

      {/* Load-in time */}
      {loadInWindow && (
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[oklch(1_0_0/0.04)]">
          <Clock className="size-5 shrink-0 text-[var(--stage-text-secondary)]" />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="stage-label text-[var(--stage-text-tertiary)]">
              Load-in
            </span>
            <span className="text-sm font-medium text-[var(--stage-text-primary)]">
              {loadInWindow}
            </span>
          </div>
        </div>
      )}

      {/* WiFi — copy-to-clipboard, never show plaintext */}
      {wifiCredentials && (
        <WifiRow credentials={wifiCredentials} />
      )}

      {/* Parking */}
      {parkingDisplay && (
        <div className="flex items-start gap-3 px-4 py-3.5 border-b border-[oklch(1_0_0/0.04)]">
          <CarFront className="size-5 shrink-0 text-[var(--stage-text-secondary)] mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="stage-label text-[var(--stage-text-tertiary)]">
              Parking
            </span>
            <span className="text-sm text-[var(--stage-text-primary)] whitespace-pre-wrap leading-snug">
              {parkingDisplay}
            </span>
          </div>
        </div>
      )}

      {/* Access notes */}
      {accessNotes && (
        <div className="flex items-start gap-3 px-4 py-3.5">
          <DoorOpen className="size-5 shrink-0 text-[var(--stage-text-secondary)] mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="stage-label text-[var(--stage-text-tertiary)]">
              Access
            </span>
            <span className="text-sm text-[var(--stage-text-primary)] whitespace-pre-wrap leading-snug">
              {accessNotes}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── WiFi row with copy-to-clipboard ─────────────────────────────── */

function WifiRow({ credentials }: { credentials: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credentials);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: noop — clipboard may not be available
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[oklch(1_0_0/0.04)]">
      <Wifi className="size-5 shrink-0 text-[var(--stage-text-secondary)]" />
      <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
        <span className="text-sm text-[var(--stage-text-secondary)]">WiFi</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.1)] active:bg-[oklch(1_0_0/0.12)] transition-colors duration-[80ms]"
        >
          {copied ? (
            <>
              <Check className="size-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copy WiFi password
            </>
          )}
        </button>
      </div>
    </div>
  );
}
