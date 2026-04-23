/**
 * Greeting catalog — rotating warm time-aware greetings for the Aion chat
 * cold-open (state `configured_pull_mode`). Phase 3 post-Sprint-2, per design
 * doc `docs/reference/aion-greeting-identity-design.md` §3.2.
 *
 * Design discipline (from 4-agent research, 2026-04-23):
 *   • Zero work content. Never references counts, deals, urgency, tasks.
 *   • Time-of-day + weekday shape tone — matches Claude's shipped catalog.
 *   • Deterministic per-request — same user in the same minute sees the same
 *     greeting across tabs. Picker hashes (workspace_id, minute bucket).
 *   • First name included when available (Q3 resolved: keep).
 *
 * Catalog size targets Claude's shipped size (~12 total across slots). Five
 * to six per time slot plus weekday specials (Q2 resolved: yes).
 */

export type GreetingInputs = {
  /** First name only, or null for anonymous. */
  firstName: string | null;
  /** Workspace id — used as a hash component so different workspaces see variety. */
  workspaceId: string;
  /** Override for testing. */
  nowMs?: number;
};

/**
 * Pick a warm rotating greeting. Deterministic per (workspace, minute-bucket)
 * so tab re-renders don't shuffle mid-thought.
 */
export function pickGreeting(input: GreetingInputs): string {
  const now = new Date(input.nowMs ?? Date.now());
  const slot = resolveTimeSlot(now);
  const isFriday = now.getDay() === 5;
  const isMonday = now.getDay() === 1;

  const name = input.firstName?.trim() || null;

  const candidates = buildCandidates(slot, isFriday, isMonday, name);
  const bucketMinute = Math.floor(now.getTime() / 60_000);
  const idx = hashToIndex(`${input.workspaceId}:${bucketMinute}:${slot}`, candidates.length);
  return candidates[idx];
}

// ---------------------------------------------------------------------------
// Time-of-day slots
// ---------------------------------------------------------------------------

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'late';

export function resolveTimeSlot(d: Date): TimeSlot {
  const h = d.getHours();
  if (h >= 5 && h < 12)  return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'late';  // 23:00–04:59
}

// ---------------------------------------------------------------------------
// Candidate builders — time slot × weekday specials × name / anon
// ---------------------------------------------------------------------------

function buildCandidates(
  slot: TimeSlot,
  isFriday: boolean,
  isMonday: boolean,
  name: string | null,
): string[] {
  const n = name ? `, ${name}` : '';
  const bareName = name ? ` ${name}` : '';

  switch (slot) {
    case 'morning': {
      const base = [
        `Morning${n}.`,
        `Back at it${n}.`,
        `Coffee and Aion time${name ? `, ${name}` : ''}?`,
        `Hey${bareName}.`,
        `Good morning${n}.`,
      ];
      if (isMonday) base.push(`Morning${n}. Monday.`);
      if (isFriday) base.push(`Morning${n}. Friday.`);
      return base;
    }

    case 'afternoon': {
      const base = [
        `Afternoon${n}.`,
        `Hey${bareName}.`,
        name ? `${name}.` : 'Hey.',
        `Good afternoon${n}.`,
        `Back${n}.`,
      ];
      if (isFriday) base.push(`Happy Friday${n}.`);
      return base;
    }

    case 'evening': {
      const base = [
        `Evening${n}.`,
        `Still at it${name ? `, ${name}` : ''}?`,
        `Hey${bareName}.`,
        `Good evening${n}.`,
      ];
      if (isFriday) base.push(`Happy Friday${n}.`);
      return base;
    }

    case 'late': {
      const base = [
        `Late${n}.`,
        `Still up${name ? `, ${name}` : ''}?`,
        `Hey${bareName}.`,
        `Evening${n}.`,
      ];
      return base;
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic index — stable lowercase FNV-1a on the seed string.
// ---------------------------------------------------------------------------

export function hashToIndex(seed: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);  // FNV prime, 32-bit multiplication
  }
  // Fold to unsigned, modulo the candidate count.
  return (h >>> 0) % modulo;
}
