/**
 * Auth entity — cross-feature types for the three-track auth redesign.
 *
 * Defined in `entities/` (not `features/auth/smart-login/`) because
 * these types are consumed by three separate slices:
 *   - `/claim/[token]` surface (features/network + widgets/onboarding)
 *   - Login state machine (features/auth/smart-login) — wired in Phase 4
 *   - Session-expired overlay (features/auth/smart-login/ui) — wired in Phase 4
 *
 * Frozen spec: `docs/reference/login-redesign-implementation-plan.md`
 * §"Connector types" (2026-04-18).
 *
 * @module entities/auth/model/types
 */

/**
 * Workspace role slug + UI label.
 *
 * Slugs align with `src/features/team-invite/model/role-presets.ts`
 * (`UnusonicRoleId`) plus the employee and client personas that
 * exist outside the org-member presets. The label is what the user
 * actually reads on screen — e.g. "Production Manager" on the claim
 * card. Use the slug for logic, the label for display.
 */
export type Role = {
  slug: 'owner' | 'admin' | 'member' | 'employee' | 'client';
  label: string;
};

/**
 * Everything the `/claim/[token]` page needs to render its card, plus
 * everything the post-auth welcome/onboarding surfaces need to contextualize
 * the invite.
 *
 * `validateInvitation` returns this shape. Pre-auth callers get the
 * payload-derived fields (workspace name, inviter name) that were baked in
 * at invite-send time; post-auth callers additionally resolve `inviterEntityId`
 * via the directory lookup.
 */
export type InvitationSummary = {
  /** Workspace UUID (`workspaces.id`). */
  workspaceId: string;
  /** Display name of the workspace (e.g. "Vibe Productions"). */
  workspaceName: string;
  /** Signed URL for the workspace logo. `null` falls back to the Unusonic mark. */
  workspaceLogoUrl: string | null;
  /** Display name of the inviter (e.g. "Elena Rivera"). Never the email. */
  inviterDisplayName: string;
  /**
   * `directory.entities.id` of the inviter's person entity. `null` when the
   * token was minted before directory backfill ran — rare, but legal.
   */
  inviterEntityId: string | null;
  /** Resolved role for the invitee (slug + human label). */
  role: Role;
  /** Email the invitation was sent to (normalized). */
  email: string;
  /** ISO-8601 expiry timestamp from `public.invitations.expires_at`. */
  expiresAt: string;
};

/**
 * Platform-derived biometric capability used to pick user-facing copy.
 *
 * We never say "passkey" in UI — that word leaks WebAuthn implementation at
 * a user who just wants to sign in. The copy resolver at
 * `src/shared/lib/auth/device-copy.ts` maps `DeviceCapability` → strings
 * like "Face ID" / "Touch ID" / "Windows Hello" / "your device".
 *
 * The narrow `'device'` bucket is the generic fallback — used on Linux,
 * Android-without-biometric, and any UA we fail to classify.
 */
export type DeviceCapability = 'faceid' | 'touchid' | 'windowshello' | 'device';

/**
 * Discriminated union returned by the Phase 4 Continue-button resolver.
 *
 * Declared here (Phase 3) so the Phase 4 dispatcher, its telemetry, and the
 * sign-in card can all consume the same shape without a circular `features/`
 * import.
 *
 * Branch semantics (frozen from `login-redesign-design.md` §3):
 *   - `passkey`              — a passkey is registered for this email; prompt conditional mediation.
 *   - `magic-link`           — sent a magic link (email exists, or enumeration-guard silent-success).
 *   - `ghost-match`          — email matches an unclaimed ghost entity; `/claim` is the redemption path.
 *   - `unknown`              — no match at all; the user sees the same "Check your email" response as magic-link.
 *   - `session-expired`      — came from `?reason=session_expired`; trigger auto-mediation.
 *
 * Do NOT add `rate_limited` here — that's a rejection of the press, handled
 * before the resolver returns. Rate-limit telemetry lives in `AuthResolution`
 * (`features/auth/smart-login/lib/auth-telemetry.ts`).
 */
export type AuthContinueResolution =
  | { kind: 'passkey' }
  | { kind: 'magic-link' }
  | { kind: 'ghost-match'; ghostEntityName: string | null }
  | { kind: 'unknown' }
  | { kind: 'session-expired' };
