# Passkey Experience: Research & Improvement Plan

**Date:** 2026-04-04
**Inputs:** Field Expert benchmark (10 products), Internal passkey audit, User Advocate profiles, Visionary design, Critic review

---

## Executive Summary

Unusonic's passkey implementation is technically solid — conditional mediation with password-manager delay, cancellation-aware error handling, session re-auth overlay, sovereign recovery. The architecture is ahead of most competitors.

The gap is **adoption infrastructure**. The current system lets users create passkeys during signup but has no migration path for existing users and no management UI for credentials. Industry data is unambiguous: settings-only enrollment = 3% adoption (Best Buy). Post-login prompts = dramatically higher (Google, GitHub).

This plan adds three features that ship in one week, then three more in the following month.

---

## What Unusonic Already Gets Right

| Capability | Status | Benchmark comparison |
|---|---|---|
| Conditional mediation (autofill) | Implemented with 220ms password-manager delay | Matches GitHub, Google, Shopify |
| Cancellation-aware errors | Soft hint for cancel, auto-expand password for real failure | Matches GitHub — better than most |
| Identifier-first flow | Email first, route by capability | FIDO-recommended pattern |
| Session re-auth overlay | Lock-screen passkey re-auth, preserves page state | Ahead of benchmark (most redirect) |
| Platform-aware labels | "Face ID" / "Touch ID" / "Windows Hello" | Standard best practice |
| Sovereign recovery | BIP39 + Shamir 2-of-3 + guardians | Genuinely novel — no competitor has this |
| Passkey-first signup | 3-step wizard: name, email, passkey | Ahead of most (only Microsoft defaults new accounts) |

---

## Who Uses This

From User Advocate research — ranked by auth priority:

| User | Top need | The moment that matters |
|---|---|---|
| PM | Speed — dozens of logins per show day | Show day at venue, checking run of show on phone. Face ID, under 1 second. |
| Owner | Not locked out + revocation | Revoking a former employee's access. Must be immediate and complete. |
| Crew chief | Simplicity — no passwords | First app open after invite. One biometric touch, lands on assignment. |
| Touring coordinator | Device flexibility | Venue computer they've never used. QR code or email code, fast. |
| Client | No auth at all | Clicked a proposal link. No login, no account, just the proposal. |

**Key language finding:** Never say "passkey" to these users. Say "Face ID," "Touch ID," "fingerprint," or "sign in with your device." Name the action, not the technology.

---

## Industry Benchmark Summary

### Enrollment timing (what drives adoption)

| Strategy | Adoption | Who does it |
|---|---|---|
| Default for new accounts | Highest | Microsoft (all new accounts passwordless) |
| Auto-upgrade during password sign-in | Very high | Apple (iOS 26 — OS-level, silent) |
| Post-login nudge after password auth | High | Google, GitHub |
| In-workflow enrollment | High | Shopify (tied to checkout) |
| Settings only | 3% | Best Buy, Vercel |

### What great implementations share
- Passkey = password + 2FA in one step (GitHub)
- Additive, not replacement — never remove fallbacks
- Clear fallback chain: passkey, password, magic link, recovery
- Named passkeys with management UI
- Admin enforcement for B2B (Linear)

### Full benchmark: `docs/research/passkey-benchmark-2026.md`

---

## The Plan

Refined after Critic review. Scoped to what actually ships and solves real problems.

### Week 1 — Ship These Three

#### 1. Post-login passkey nudge banner

**What it is:** After a successful password sign-in, a non-blocking banner appears: "Want to skip the password next time? Set up Face ID now." One tap to add, one tap to dismiss.

**Data model:** Single column `passkey_nudge_dismissed_at` (timestamptz, nullable) on `public.profiles`. Show if: user has zero passkeys AND (`dismissed_at` is null OR older than 30 days). No new table.

**Behavior:**
- Renders in dashboard layout after password sign-in
- Calls `registerPasskey()` directly from the banner
- On dismiss: sets `passkey_nudge_dismissed_at = now()`
- On success: banner never appears again (user has passkeys)
- On passkey creation failure: falls back to dismissible error in the banner, doesn't block the dashboard

**Copy (device-aware):**
- iPhone: "Sign in with Face ID next time?" [Set up] [Not now]
- Mac: "Sign in with Touch ID next time?" [Set up] [Not now]
- Windows: "Sign in faster with Windows Hello?" [Set up] [Not now]

**Files:**
- New: `src/widgets/dashboard/ui/passkey-nudge-banner.tsx`
- Edit: `src/app/(dashboard)/layout.tsx` — render banner
- Edit: `src/features/auth/smart-login/api/actions.ts` — set flag on password sign-in
- Migration: add `passkey_nudge_dismissed_at` to profiles

#### 2. Passkey list + delete in Security settings

**What it is:** Replace the current "Add passkey" button with a credential list. Each row: name (editable), created date, delete button.

**Data model:** Add `friendly_name` (text, nullable) column to `public.passkeys`. No `last_used_at` — avoids a write on every auth. Users name their passkey via a text input during or after creation.

**UI:**
- List of passkeys: `[name] — Added [date]` with [Rename] [Remove] actions
- Remove requires confirmation dialog: "Remove this passkey? You'll need another way to sign in on [name]."
- Add new: existing "Add passkey" flow with an inline name input
- If user has 0 passkeys after deletion, show warning: "You have no passkeys. Sign in with your password or set up a new passkey."

**Files:**
- Edit: `src/app/(dashboard)/settings/security/SecuritySection.tsx`
- New server actions for list/rename/delete passkeys
- Migration: add `friendly_name` to `public.passkeys`

#### 3. `.well-known/passkey-endpoints`

**What it is:** A static JSON route that lets 1Password, iCloud Keychain, and other credential managers link to Unusonic's passkey management page.

**Implementation:** ~15 minutes.

```json
{
  "enroll": "https://unusonic.com/settings/security",
  "manage": "https://unusonic.com/settings/security"
}
```

**File:** `src/app/.well-known/passkey-endpoints/route.ts`

---

### Month 1 — Ship After Week 1

#### 4. Rate limiting on passkey auth endpoints

**What it is:** Per-identifier (email hash) sliding window rate limit. NOT IP-based (production offices and venue networks share IPs).

**Limits:** 10 options requests per email per 5 minutes. 5 verify requests per email per 5 minutes.

**Implementation:** Upstash Redis with `@upstash/ratelimit`, or Supabase RPC checking recent `webauthn_challenges` creation rate per user.

**Why not IP-based (Critic finding):** 10-person production team on the same office network all signing in at 9 AM Monday would immediately hit an IP-based limit. NAT is ubiquitous. Rate limit by identifier, not by origin.

#### 5. Friendly passkey naming at creation

**What it is:** When a user adds a passkey, a text input appears: "Name this device (optional)." Defaults to a best-guess from the user agent ("Chrome on MacBook Pro"). User can edit or accept.

**Why not AAGUID lookup:** AAGUID databases are incomplete and go stale. UA parsing is fragile. Let the user name their own device — it's one text input and they know what their device is called.

#### 6. "Add a passkey on another device" encouragement

**What it is:** After 14 days with exactly one passkey, a quiet indicator in Security settings: "You have one passkey. If you lose this device, you'll need your recovery phrase. Adding a passkey on another device gives you faster backup."

**Not a banner. Not a nudge. Just a visible recommendation in the right place.**

---

### Explicitly Deferred

| Feature | Reason to defer | Revisit when |
|---|---|---|
| **Automatic passkey upgrade** (silent creation) | Triggers unexpected OS dialogs without user consent. Apple does this at OS level with full context — we're a web app without that trust. The nudge banner solves this with consent. | Never (the nudge is better) |
| **Incognito detection** | Browser detection vectors are unreliable and closing. If creation fails, the password fallback handles it. | Never (not worth maintaining) |
| **Admin auth enforcement** | No enterprise customers requesting it. Shared-device workflows in production (borrowed tablets, venue computers) directly conflict with mandatory passkeys. | When an enterprise customer asks |
| **Passwordless-by-default for new accounts** | Needs the full fallback chain proven at scale first. Some enterprise environments block WebAuthn. | After 6 months of passkey adoption data |
| **Passkey analytics for admins** | Nice but not urgent. Requires sign-in event logging infrastructure. | After admin enforcement ships |
| **`last_used_at` tracking** | Write on every auth hot path. Vanity metric for a settings page. | If users specifically request "when did I last use this passkey" |

---

## Language Guide

From User Advocate research. These users are production professionals, not developers.

| Instead of | Say |
|---|---|
| "Set up a passkey" | "Sign in with Face ID" (match device) |
| "Add a passkey to this device" | "Set up this device for quick sign-in" |
| "Your passkey has been registered" | "Done. This device will recognize you now." |
| "Passkey not available" | "Face ID isn't available on this device. Sign in with your email instead." |
| "Enable passkey authentication" | "Want to skip the password next time? Set up Face ID now." |
| "Recovery key" | "Backup phrase" |
| "WebAuthn" / "credential" / "authenticator" | Never surface these words |

**Principle:** Name the action (use your face, use your fingerprint, type your email), not the technology (passkey, WebAuthn, FIDO2).

---

## Verification

After shipping Week 1:
1. Sign in with password on a device with no passkeys — nudge banner appears
2. Tap "Set up" — browser passkey dialog appears, create passkey
3. Banner disappears permanently
4. Sign out and back in — passkey autofill appears (no password needed)
5. Open Settings > Security — see the passkey listed with the name you gave it
6. Delete the passkey — confirmation dialog, then removal
7. Sign in again — password required (no passkeys), nudge banner reappears after 30 days

After shipping Month 1:
8. Attempt 6+ rapid sign-ins with the same email — rate limit kicks in
9. Create a passkey — name input appears with device suggestion
10. After 14 days with one passkey — "add another device" recommendation visible in settings

---

## Sources

- Full benchmark report: `docs/research/passkey-benchmark-2026.md` (10 products, FIDO specs, adoption stats)
- FIDO Alliance Design Guidelines: passkeycentral.org/design-guidelines/
- Apple WWDC25 passkey updates (automatic upgrades, signal APIs, CXF transfer)
- Google passkey scale data (800M accounts, 2.5B sign-ins)
- Microsoft passwordless-by-default (May 2025)
- NIST SP 800-63-4 (passkeys as AAL2 requirement)
