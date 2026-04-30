/**
 * ParticipantAvatars — stacked avatar tile for the collapsed thread row.
 * Shows up to 3 avatars with "+N" overflow chip for any beyond that.
 *
 * Color derives deterministically from each participant's avatarSeed (entity
 * id or lowercased email). Participants without display_name fall back to
 * email local-part initials.
 *
 * @module features/comms/replies/ui/ParticipantAvatars
 */

import type { ThreadParticipant } from '../api/get-deal-replies';

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s<@.]+/).filter(Boolean);
  if (parts.length === 0) return clean.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Hash a string to a hue [0..360). FNV-1a-ish — good enough for visual
 * variation, not cryptographic.
 */
function seedToHue(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % 360;
}

function avatarStyle(seed: string): React.CSSProperties {
  const hue = seedToHue(seed);
  return {
    background: `oklch(0.32 0.04 ${hue})`,
    color: `oklch(0.92 0.01 ${hue})`,
    border: '1px solid var(--stage-edge-subtle)',
  };
}

export type ParticipantAvatarsProps = {
  participants: ThreadParticipant[];
  /** How many avatars to render before collapsing the rest into "+N" chip. */
  maxDisplay?: number;
  /** Pixel size of each avatar. Default 24 (balanced density). */
  size?: number;
};

export function ParticipantAvatars({
  participants,
  maxDisplay = 3,
  size = 24,
}: ParticipantAvatarsProps) {
  if (participants.length === 0) {
    return null;
  }

  const visible = participants.slice(0, maxDisplay);
  const overflow = Math.max(0, participants.length - maxDisplay);

  return (
    <div
      className="inline-flex items-center shrink-0"
      aria-label={`${participants.length} participant${participants.length === 1 ? '' : 's'}`}
      style={{ marginLeft: overflow > 0 ? `${size / 3}px` : 0 }}
    >
      {visible.map((p, idx) => (
        <div
          key={`${p.entityId ?? p.displayName}-${idx}`}
          className="inline-flex items-center justify-center rounded-full overflow-hidden shrink-0"
          style={{
            width: size,
            height: size,
            fontSize: Math.floor(size * 0.42),
            fontWeight: 600,
            letterSpacing: '0.02em',
            marginLeft: idx === 0 ? 0 : `-${size / 3}px`,
            zIndex: visible.length - idx,
            ...avatarStyle(p.avatarSeed),
          }}
          title={p.displayName}
        >
          {initials(p.displayName)}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="inline-flex items-center justify-center rounded-full shrink-0"
          style={{
            width: size,
            height: size,
            fontSize: Math.floor(size * 0.4),
            fontWeight: 600,
            letterSpacing: '0.02em',
            marginLeft: `-${size / 3}px`,
            background: 'oklch(0.2 0 0)',
            color: 'var(--stage-text-secondary)',
            border: '1px solid var(--stage-edge-subtle)',
          }}
          title={`${overflow} more participant${overflow === 1 ? '' : 's'}`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
