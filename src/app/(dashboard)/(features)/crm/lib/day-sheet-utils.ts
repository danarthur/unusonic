/** Shared utilities for day sheet compilation and dispatch summary. */

/** Call time = event start minus 2 hours (Phase 3 spec). */
export function getCallTime(startsAt: string | null): string {
  if (!startsAt) return 'TBD';
  const d = new Date(startsAt);
  d.setHours(d.getHours() - 2);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Google Maps search URL for address. */
export function googleMapsUrl(address: string): string {
  if (!address || address === '—') return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
