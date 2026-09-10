/**
 * Relative time for UI timestamps: "just now", "4h ago", "12d ago", then an
 * absolute date once it stops being useful to count.
 *
 * WHY THIS IS SHARED
 * Five copies of this existed in one widget with three different behaviours past
 * 30 days — "Mar 3, 2025", "Mar 3", and "8mo ago". The same timestamp therefore
 * read differently in two cards on one screen, and the year-less variant was
 * outright misleading: a date from a previous year rendered as though it were
 * this one.
 *
 * The year is always included in the absolute form for exactly that reason.
 */
export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
