# BYO Rescue Flow — Design Doc

**Source:** 2026-04-26 convergence of Critic + User Advocate + Field Expert + Unusonic Navigator. Grounds the Phase 1.5 PR #26+ build that follows the BYO sending-domain wizard shipped in PRs #24-#25.

**Core problem the flow solves:** the BYO wizard surfaces ~5-7 DNS records that ~35% of pilot owners (per Marcus research) will not add themselves. Today they have nowhere to go — they look at the records, panic about breaking live email mid-wedding-season, and abandon. The rescue flow gives them a path: hand off to whoever sets up their website ("Mike Web"), and let the platform make sure it actually gets done.

**Scope chosen:** Fork C — Lean Rescue + Entri integration + DKIM delegation subdomain. Pre-pilot premium spend; pilot launch slips ~3-4 weeks. Daniel chose this knowingly per `feedback_premium_over_speed.md` ("pre-launch is a gift to do it right").

---

## Decisions where the agents disagreed

| Topic | Critic | User Advocate | Field Expert | Resolved |
|---|---|---|---|---|
| Should Unusonic send the email at all? | **Kill server-sent. Use `mailto:` only.** Spam-reputation footgun, phishing-pattern. | Server-sent works **if From-name is the owner**. Forwarded-from-known-client is the trust vector. | Industry standard: send via SaaS infra with `[Owner Name] (via Brand)` From. HubSpot/SendGrid pattern. | **Server-sent + `mailto:` fallback.** From-name is owner ("Linda Arthur (via Unusonic) <noreply@unusonic.com>"). Subject names owner + domain. Plain-text alternative with records embedded. `mailto:` button shipped alongside for owners who'd rather forward from their own Mail.app. |
| Token expiry | "Will expire mid-flow, owner won't know" | Mike Web may revisit days later during DNS propagation | 30 days is industry standard (WorkOS dashboard pattern). 7 days is the floor. | **30 days, revocable.** Owner can revoke from history list. Public page surfaces "this link is good through {date}". |
| Records snapshot on the link | Implicit concern: Resend rotates → stale records on old link | n/a | n/a | **Snapshot at send-time.** `dns_handoffs.dns_records_snapshot jsonb` so the link still shows the records the owner sent — even if the owner re-runs wizard later. Snapshot is read-only on the link; verify button hits live state. |
| Recipient channel | Email only (don't expand surface) | **SMS is the #1 unlock** — owners reach for phone contacts, not email | Mobile reality is broadly underserved | **Both. Email default; SMS optional.** Recipient input accepts email OR phone number; UI auto-detects. Phone → reuses Twilio infra (Phase 6 login redesign edge function pattern). |
| Login required on public page | Cite spam concern | Hard bounce if asked to sign up | **No login required.** Token-gated public page. | **No login.** Public read via `system.ts` SECURITY DEFINER RPC with REVOKE FROM PUBLIC. |
| Confirm action on public page | n/a | "Verify now" button that runs live DNS check is the highest-leverage UX moment | Idempotent verification action, no auth needed | **Verify-now button polls Resend live.** Status updates in real time on both the public page and the owner's `/settings/email`. |
| "IT person" framing | "IT person" is wrong demographic | **"Send to your tech person"** matches owner mental model | n/a | **Use User Advocate's label.** Microcopy below: "We'll send the records. They can do it in about 5 minutes." |

---

## What the agents converged on

Strong agreement — no decision needed:

- The recipient is **not** an "IT person" in the enterprise sense. Real distribution: 40% one-person freelancer ("Mike Web"), 25% family (nephew/spouse), 15% Squarespace support chat, 10% the owner's kid, 10% nobody. Copy must match.
- The trigger isn't complexity — it's **fear of breaking live email mid-wedding-season**. Records appear → owner pattern-matches to past outage → "nope, not touching this." Microcopy must address this fear directly, not the technical complexity.
- The owner wants **silence + an eventual "done" ping**. They do NOT want a status page they have to log into. The platform's "verified ✓" notification IS the satisfying moment.
- The recipient wants **a public web page with copy buttons**, NOT records pasted into an email body (DKIM line-wrapping mangles values — real Mike Web pain point).
- The token + public page primitive is the foundation. Everything else (email, SMS, mailto, lobby tile, Aion nudge) is a delivery channel for the *same link*.
- **Snapshot the records at send time.** Live records can drift; the link the IT person opens must always reflect what the owner intended to send.
- **Real-time verification** on the public page (poll every few seconds when active) — Resend / HubSpot / Loops all do this and it's the single most satisfying UX moment.
- **No login anywhere** for the IT person.
- **Industry has converged on Entri** for automated zero-touch on supported registrars (~70% coverage). Ship it.
- **DKIM-delegation subdomain trick** (Postmark/SendGrid pattern) collapses 5-7 records → 3-4 forever and eliminates DKIM rotation friction. Ship it.

Deferred (not disagreed):

- BIMI logos (requires VMC certificate ~$1,500/yr, Phase 2/3)
- Auto-detect domain ownership change (daily cron, Phase 2)
- DKIM key rotation UI (Phase 2, after the delegation subdomain ships)

---

## User flow (happy path)

1. Owner enters `invisibletouchevents.com` in `/settings/email`. Wizard provisions Resend domain via existing `provisionSendingDomain()`.
2. Wizard shows DNS records (now reduced to 3-4 records via DKIM delegation subdomain — see §3.5). State = Pending.
3. **Primary path: Entri Connect widget.** If `detectDnsProvider()` returns Cloudflare/GoDaddy/Squarespace/Namecheap/etc., wizard surfaces "Set up automatically — sign in to {Provider}" as the dominant CTA. Owner clicks → OAuth → Entri writes records → Resend verifies in ~5sec → Verified state.
4. **Fallback A: Self-serve.** If Entri not supported OR owner declines, wizard shows the records grid with copy-per-row buttons + "Copy all records" master button.
5. **Fallback B: Rescue flow.** "Send to your tech person" button anchored next to the records grid. Owner clicks → `RescueHandoffDialog` opens.
6. Dialog fields:
   - Recipient (auto-detects email vs phone)
   - Recipient name (optional, drives From-name and email salutation)
   - "Add a note" (optional, surfaces above the records on the public page)
   - Three pre-written delegation messages the owner can pick from (per Field Expert §recommendation: "send this to whoever sets up your website")
7. Owner sends. Server action mints a 32-byte token, snapshots records, sends email or SMS, returns success.
8. Wizard now shows a "Sent to John (john@example.com) on Apr 26" status indicator above the records grid + a lobby tile (`lobby.dns_handoff_pending`).
9. Mike Web receives email/SMS:
   - Subject: `DNS records for invisibletouchevents.com — setup request from Linda Arthur`
   - From: `Linda Arthur (via Unusonic) <noreply@unusonic.com>`
   - Body: short. Names Linda, names the domain, one-paragraph context ("Linda is setting up Unusonic to send proposals from invisibletouchevents.com — these records prove she owns the domain"), CTA button ("View setup page"), plain-text records below the fold for IT folks who refuse to click links.
10. Mike opens the link → `/(public)/dns-help/<token>` page. No login. Sees:
    - Domain name + Linda's note (if any)
    - The records in a fixed-width table with per-row copy buttons
    - Per-row verification status pill (live)
    - Big "Verify now" button (runs live DNS lookup via Resend, updates pills in <30sec)
    - "Download as zone file" link (BIND format, for power users — Loops pattern)
    - Footer: registrar-specific tips if `detectDnsProvider()` returned a known provider, generic fallback otherwise
11. Mike pastes records into Cloudflare/GoDaddy/etc. Hits "Verify now." Page shows green check. Mike texts Linda "all set."
12. Owner-side: Resend webhook (`domain.updated`) fires, `sending_domain_status` flips to `verified`, owner sees lobby tile resolve, gets in-app + email notification ("John completed your DNS setup. Domain verified.").

## Edge cases — what we explicitly handle

| Case | Behavior |
|---|---|
| Owner typos recipient email | Confirmation modal before send shows the recipient back to the owner. History list lets them resend or change recipient if no confirmation in 48h. |
| Token expiry | 30 days. Public page after expiry shows "This link expired. Ask Linda to send a new one." Owner sees "Link expired" in history and can re-send in 1 click. |
| Owner re-runs wizard, records change | Snapshot is frozen on the link. Public page shows a banner: "These records may be outdated. {Owner} re-ran setup on {date}. Click here to view current records." Link to a fresh page (auto-revoking old token). |
| Mike Web makes a typo in a value | Live verify button surfaces specific failed record. Per-row failure copy explains what was expected vs found. |
| Mike Web edits records and they're partially right | Per-record status (verified / pending / failure). Owner sees same per-record pills on `/settings/email`. |
| 48h passes with no confirmation | Aion brief evaluator `dns_handoff_unconfirmed` surfaces in the daily brief: "Your DNS setup is still pending — want me to nudge John?" One-tap re-send action. |
| Owner removes recipient from their life | History list shows revoke button. Token immediately invalidated. |
| Recipient hits reply on the email | Reply-To set to the owner's user email (not Unusonic). Mike's reply goes straight to Linda. |
| Mobile owner | Composer dialog renders mobile-first. SMS option is dominant on small viewports. "Email this to myself to finish on desktop" link in the wizard pending state (sibling Phase 1.5 P0 item — same `ops.handoff_links` table). |
| Recipient flags as phishing | Sentry breadcrumb on `domain.updated` failures + manual abuse@ monitoring. Same warm IP as auth emails — reputation accrues. From-name dominance + recipient-named-by-owner audit trail mitigates. |

---

## Technical architecture

### 3.1 Schema

New table in `ops` (NOT `public` — Navigator caught this; CLAUDE.md §"No new tables in `public`"):

```sql
CREATE TABLE ops.handoff_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dns_helper', 'mobile_handoff')),
  public_token text NOT NULL UNIQUE,                    -- 32-byte hex
  recipient text NOT NULL,                              -- email or E.164 phone
  recipient_kind text NOT NULL CHECK (recipient_kind IN ('email', 'sms')),
  recipient_name text,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id),
  sender_message text,                                  -- owner's note
  payload jsonb NOT NULL,                               -- kind-specific (snapshot for dns_helper, return URL for mobile_handoff)
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  confirmed_at timestamptz,                             -- NULL until verify-now succeeds
  revoked_at timestamptz,
  resend_message_id text,                               -- for email reputation tracking
  twilio_message_sid text                               -- for SMS tracking
);

CREATE INDEX handoff_links_workspace_pending ON ops.handoff_links(workspace_id, sent_at DESC)
  WHERE confirmed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX handoff_links_token_unique ON ops.handoff_links(public_token);
```

Generalized for the mobile escape sibling (Navigator §6) — kind `dns_helper` for now, `mobile_handoff` ready for next sprint. Pre-generalization is justified because both ship same Phase 1.5.

### 3.2 Access pattern (not RPCs)

**PR #26 ships without SECURITY DEFINER RPCs.** Owner-callable mutations go through the regular client + RLS (defense in depth: server-action `requireAdminOrOwner` check + RLS WITH CHECK clauses). Public/anon-callable reads + the verify-now action go through the system client (`shared/api/supabase/system.ts`) with direct table access on `ops.handoff_links`, matching the established `ops.crew_confirmation_tokens` pattern. This sidesteps the `feedback_postgres_function_grants.md` bug class entirely (no RPCs to forget to REVOKE).

Public-action token gating happens in code: every `getDnsHandoffPublicView` / `confirmDnsHandoff` call filters `kind = 'dns_helper'` so future `kind = 'mobile_handoff'` rows cannot leak through this surface.

### 3.3 Sender model

Use `getFrom()` from `senders/auth.ts` (or new `senders/system.ts` sibling) — **not** `getWorkspaceFrom()`. Three reasons captured by Navigator:

1. The workspace's BYO domain is by definition not yet verified when this fires (`getWorkspaceFrom()` would fall back to `getFrom()` anyway).
2. The recipient is not a workspace contact, has no prior trust relationship with the workspace's brand.
3. Spoofing risk identical to auth: anyone trying to verify DNS for `acme.com` should not be sending from `acme.com`.

**Critical From-name shape** (this is the spam-survival mechanism that resolves Critic vs Field Expert):

```
From-name: "Linda Arthur (via Unusonic)"
From-email: noreply@unusonic.com
Reply-To: linda@invisibletouchevents.com    # owner's email; replies bypass platform
Subject: DNS records for invisibletouchevents.com — setup request from Linda Arthur
```

Body: short, named, transactional. Plain-text alternative mandatory per `docs/reference/code/email-sending.md`. Render via `toPlainText(html)` after `render(<DnsHandoffEmail />)`.

### 3.4 Token + public page

- **Token format:** 32 random bytes, base64url-encoded. NOT a JWT. NOT a UUID. (Industry standard per Field Expert.)
- **Public route:** `/(public)/dns-help/[token]/page.tsx`. RSC fetches via `ops.get_handoff_link`, renders client component with verify button.
- **Live verification:** one auto-verify on first mount + a manual "Verify now" button. (Polling-every-5s was scoped out — it would multiply Resend rate-limit consumption against the workspace's account, and the manual button is what Mike Web actually uses.)
- **No tracking pixels.** No URL rewriting. Field Expert flagged these as phishing-flag triggers.

### 3.5 DKIM delegation subdomain (Fork C)

The infra trick that drops 5-7 records → 3-4 permanently:

**Customer side:**
- Customer adds ONE CNAME: `mail._domainkey.invisibletouchevents.com → dkim.unusonic.com.`
- (Plus SPF TXT, DMARC TXT, MX records — those still required by spec.)

**Unusonic side:**
- We run authoritative DNS for `dkim.unusonic.com` sub-zone (Cloudflare DNS sufficient — same provider as apex).
- We publish per-customer DKIM keys at `mail._domainkey.{their-domain-encoded}.dkim.unusonic.com` and rotate server-side.
- We can rotate DKIM keys without ever touching the customer's DNS again — huge for security posture and zero-friction key rotation.

**Resend integration:**
- Resend doesn't natively support delegated subdomain DKIM yet (verified via their docs — they expect DKIM CNAMEs at customer's `selector._domainkey.customer.com`).
- We implement at our DNS layer: customer's `mail._domainkey.invisibletouchevents.com` CNAMEs to `mail._domainkey.invisibletouchevents-com.dkim.unusonic.com`, which we control and which serves Resend's actual DKIM public key.
- When Resend rotates keys, we update our sub-zone — customer never sees it.

**Daniel's manual setup:**
- Cloudflare DNS for `dkim.unusonic.com` configured with API access for our service to publish records.
- Service-role API key for the DNS provider stored in `DKIM_DNS_API_KEY` env var.

This is the bigger infra lift in Fork C. Worth its own PR sequence (#29-#30). Not pilot-blocking — the wizard can ship pre-Fork-C records (5-7 records) and migrate to delegated DKIM transparently later.

### 3.6 Entri integration

Per Field Expert: industry has converged on Entri Connect for ~70% of small-business registrars.

- Entri requires a sales call (no self-serve signup). Daniel's manual task. Pricing is per-MAU; for ~50 pilot users → cohort 5 (~500 users), expect <$500/mo.
- Entri ships a JS SDK that mounts an iframe modal. Customer OAuths into their DNS provider, Entri writes records via the registrar's API, returns success/failure to our callback.
- Integration: `<EntriConnect>` component on the wizard pending state, conditionally rendered when `detectDnsProvider()` returns a supported registrar.
- Fall back to records-grid + rescue flow if Entri unsupported or user declines.

PR #28 — separable from rescue flow PRs.

---

## PR sequence

Eight PRs to ship Fork C. Each is independently mergeable and pilot-launch-incrementally-improving. Sequence designed so PR #26 alone unblocks pilot if cohort-1 timing tightens.

| PR | Title | Scope | Pilot-blocker? |
|---|---|---|---|
| #26 | feat(byo): rescue handoff core (PR #26 in handoff doc) | `ops.handoff_links` migration, `sendDnsHandoffEmail`, `RescueHandoffDialog`, public `/dns-help/[token]` page with verify button, "Send to your tech person" button on wizard, history list | Yes |
| #27 | feat(byo): SMS handoff channel | Generic SMS sender (new edge function or extend `sms-otp-send`), recipient input auto-detects phone, Twilio path | Soft (pilot can launch email-only) |
| #28 | feat(byo): Entri Connect integration | `<EntriConnect>` widget, `detectDnsProvider()` integration, primary CTA on supported registrars | Soft (rescue flow handles unsupported case) |
| #29 | feat(byo): DKIM delegation subdomain — DNS infra | `dkim.unusonic.com` sub-zone setup, key publishing service, env wiring | No — internal infra, no user-visible change |
| #30 | feat(byo): DKIM delegation subdomain — wizard migration | Customer-facing record set drops to 3-4 records, migration path for already-verified workspaces | No — improvement-only |
| #31 | feat(byo): mobile escape — "finish on desktop" | Reuses `ops.handoff_links` with `kind='mobile_handoff'`, viewport-conditional CTA in wizard | No — Phase 1.5 sibling |
| #32 | feat(byo): registrar-specific tips on public page | Per-registrar instructions block (Cloudflare/GoDaddy/Squarespace/Namecheap/Google Domains), pulls from `detectDnsProvider()` snapshot | No — quality-of-life |
| #33 | feat(byo): Aion brief integration + lobby tile | Insight evaluator `dns_handoff_unconfirmed` (48h threshold), `lobby.dns_handoff_pending` tile | No — discoverability |

Total estimated build time: 3-4 weeks. Critical path is #26 (~3 days), #28 (~3 days, gated on Daniel's Entri sales call), #29-#30 (~5-7 days, gated on Daniel's Cloudflare DNS setup).

---

## What Daniel does manually

These are Daniel's actions, not in any PR:

- **Entri sales call.** Schedule via entri.com, get pricing + API keys, hand to Claude. Blocks PR #28 merge.
- **Cloudflare DNS for `dkim.unusonic.com`.** Add NS records or sub-zone delegation, generate API token with edit permissions on the sub-zone. Blocks PR #29 merge.
- **Twilio account verification for outbound rescue SMS.** May require a new sender phone number registered for non-OTP messaging. Blocks PR #27 merge if existing OTP sender restricted to OTP-only by Twilio.
- **Decide email From-domain.** Currently `noreply@unusonic.com`. Could move to `notifications@unusonic.com` to segregate auth-vs-rescue reputation. My recommendation: keep `noreply@unusonic.com` for warming-in-place. Easy to split later.
- **Postmark/Resend abuse contact.** Add `abuse@unusonic.com` to platform documentation as a clearly-monitored escalation path.

---

## Open questions

1. **Entri pricing.** If pricing is genuinely $500+/mo for cohort-1 of 1 workspace, defer PR #28 until cohort 5. Doesn't change rescue flow viability — Fork A path serves the 70% Entri would have covered, just with more clicks.
2. **Reply-To owner email.** Privacy: do we want Mike Web to see the owner's literal email address, or use a shielded `replies+{owner_id}@unusonic.com` alias? My take: literal email. Mike already knows Linda; shielding adds friction without adding privacy.
3. **Phone-number SMS in international workspaces.** Twilio international rates / regulatory. For pilot (US-only), skip; flag for cohort 5+.
4. **Aion brief copy register.** Should the nudge use the casual "wanna nudge John?" voice or the precision-instrument register from `docs/reference/design/copy-and-voice-guide.md`? Lean toward the precision register: "DNS setup pending — sent to John 2 days ago. Resend?"
5. **Public page brand register.** Mike Web is not a Unusonic customer. Do we surface Unusonic branding on the public page (defensible — "this is what's powering this") or strip it (more defensible — "this is Linda's setup, we're invisible infrastructure")? Lean toward minimal Unusonic branding: small logo footer, "Powered by Unusonic" only. Page-as-a-service vs page-as-a-product.

---

## Critic's concerns — how each is addressed in Fork C

| Concern | Resolution |
|---|---|
| Unusonic-branded email = phishing-flag risk | From-name dominance ("Linda Arthur (via Unusonic)") + subject names owner+domain + plain-text records embedded + recipient-named-by-owner audit trail. Field Expert confirmed this is the standard pattern that survives modern spam filters. |
| Token expires mid-flow | 30 days (industry standard). Owner has revoke + resend in history. |
| Records drift after Resend regenerates | Snapshot in `payload jsonb` at send-time. Public page surfaces stale-record banner if owner re-ran wizard. |
| Two-party race condition | DNS verification is idempotent. No race possible. |
| Wrong recipient | Confirmation modal pre-send + revoke from history. |
| IT person edits records to "fix" them | Per-record verification status pills on public page surface failures immediately. |
| IT person never opens email | 48h Aion nudge offers re-send. |
| 5-7% adoption math | Fork C ships rescue flow as one of three paths (Entri primary, self-serve, rescue). Even if rescue is 5%, the same primitive serves the mobile-escape sibling and future workflows. |
| Mobile reality | SMS channel + viewport-responsive composer + "finish on desktop" sibling reuses the same `ops.handoff_links` table. |
| "IT person" framing | "Send to your tech person." Microcopy targets fear, not complexity. |

All Critic's technical fixes survive into the spec. The spec didn't get smaller — it got harder on the right axes (snapshot, From-name dominance, no login, 30-day token, idempotent verify) and bigger only on the strategic axes (Entri, DKIM delegation) where Field Expert's research said the industry has moved.

---

## Out of scope for Fork C — Phase 2/3 deferrals

- BIMI logos in Gmail (requires VMC certificate ~$1,500/yr)
- Auto-detect domain ownership change (daily cron checking that customer didn't accidentally remove records)
- Per-channel SMS threading for the Replies feature (separate initiative)
- DKIM key rotation UI (the delegation subdomain makes this server-side; UI only needed if customers want visibility into rotation history)
- Parallel domain strategy (`myproduction.com` + `myproduction-email.com` per Linear/Vercel pattern)

---

## Pre-session knowledge for next agent

If picking this up cold, read in order:
1. This doc
2. `docs/reference/replies-design.md` — sibling initiative; same recipient flow patterns
3. `docs/reference/code/email-sending.md` — sender model rules
4. `git show claude/handoff-doc:docs/handoff/2026-04-24-replies-byo-pilot-foundation.md` — pilot context, what's already shipped
5. `git show claude/handoff-doc:docs/roadmap/byo-sending-domain.md` — earlier roadmap framing

Memory notes worth checking:
- `feedback_postgres_function_grants.md` — REVOKE pattern (sev-zero bug class)
- `feedback_security_definer_dual_context.md` — dual-context auth pattern for owner+anon RPCs
- `project_pilot_owners.md` — Invisible Touch Events context
- `feedback_premium_over_speed.md` — why Fork C, not Fork A

---

End of design doc. Sequence: Daniel approves → PR #26 build kicks off (3 days, pilot-blocker) → #27/#28/#29-30 in parallel as their dependencies clear.
