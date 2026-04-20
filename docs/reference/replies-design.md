# Replies

> Did the client write back? Unusonic already saw it.

Replies mirrors client email (Phase 1) and SMS (Phase 1.5) into the deal the client is responding to. Owners keep composing in Gmail. When a reply lands, Unusonic shows it inline on the deal, flips the matching follow-up row to `acted`, and offers one-tap stage advancement. The feature is a one-way mirror, not an inbox replacement. Production-company owners have told us they will not switch mail apps; we do not ask them to.

Status: pre-launch, greenfield. Phase 1 target: 8 weeks, email only. Phase 1.5: +6 weeks, adds SMS + Aion classification + portal visibility.

---

## 1. Mental Model

The owner's question, every time, is *"did the client write back?"* Today they answer it by swiping to Gmail and scanning for the client's name under newsletter noise. Replies answers it in the place they already look for everything else about that deal.

Three things must be true for the feature to earn its keep:

1. A client reply must appear on the deal within 30 seconds of arriving in the owner's mailbox.
2. The matching `ops.follow_up_queue` row must auto-resolve — no nagging nudge the next morning.
3. The owner must never feel like they gave up Gmail to use Unusonic.

If any of the three break, the feature is theater. The north star is the 4:47pm-at-Home-Depot moment: phone buzzes, one tap marks the deal Confirmed, owner closes the phone and buys paint. Everything else in this document is wrapper.

---

## 2. Scope

### 2.1 In scope for Phase 1 (8 weeks)

Email only. Outbound via Resend (existing infrastructure). Inbound via Resend's inbound parsing webhook pointed at a per-thread alias on `replies.unusonic.com`. Follow-up auto-resolution on inbound. Timeline extension. Urgent-reply detection via keyword heuristics (no Aion classification yet). Inline Replies card on the Deal Lens. Outbound composer (single component, two entry points: Replies card + Aion card). Unresolved triage at `/replies/unresolved`. Privacy model: deal-scoped messages workspace-visible; identity privacy gates cross-deal views only.

### 2.2 Deferred to Phase 1.5 (+6 weeks)

- SMS inbound + outbound via Twilio with a workspace-shared number (10DLC A2P registration during onboarding)
- Aion classification of reply intent (interested / objection / scheduling / declined / OOO), gated on ≥85% precision against a labeled eval set of 200 real replies from the beta cohort
- Entity detail sheet Messages tab (cross-deal history)
- Portal visibility — `ops.portal_messages_v` view mirroring `portal_follow_up_queue`
- Daily Brief evaluator `inbound_reply_needs_triage`
- Attachment "Save to deal files" chip action

### 2.3 Future phases

- **Phase 2 (Q3 2026) — Read.** Gmail OAuth + Microsoft Graph read-only sync for historical threads with workspace contacts. Gated on CASA security assessment (4-8 weeks, $5-15k) which kicks off day one of Phase 1 ship.
- **Phase 3 (Q4 2026) — Draft.** Aion-generated reply drafts on the Replies card, using the existing `generateFollowUpDraft()` + dispatch API preview/confirm pattern. One tap to accept and send.
- **Phase 4 (2027) — Touring.** WhatsApp Business API for international and touring clients. Close-style reply-time heatmap. Front-style per-thread SLA timer.

### 2.4 Explicitly not in scope, ever

- Unified-inbox replacement for Gmail / Outlook / Apple Mail
- iMessage blue-bubble outbound (Apple Messages for Business is invite-only and not available to SMB CRMs; Twilio delivers gray SMS and that is the permanent limit)
- Full-inbox OAuth scope (`gmail.readonly` on everything) — only workspace-contact-scoped threads via filter rules in Phase 2
- Auto-created ghost entities from unknown senders (Ghost Protocol per CLAUDE.md §4 requires human-initiated creation)

---

## 3. The Three Surfaces

### 3.1 Deal Lens — Replies card

Lives inline on the deal view, between the Timeline card and the Production Team card.

**Resting state** (no messages):

> **Replies**
> No replies yet. When your client writes back, you'll see it here first.

Single "Compose" button in the card header that opens the outbound composer.

**Live state** (one or more threads):

Each thread renders as a collapsible group. Thread key is derived from RFC 2822 `References` / `In-Reply-To` headers (email) and Twilio `conversation_sid` (SMS, Phase 1.5). Header shows the client's display name (resolved from `from_entity_id` → `directory.entities.display_name`), the channel glyph, and a relative timestamp with absolute-time tooltip.

Thread body renders messages newest-first with minimal chrome: body text, attachment chips, subtle inbound/outbound edge styling. Attachment chips show filename, size, and a download action. In Phase 1, attachments land in workspace-scoped Supabase Storage at `workspace-{id}/messages/{message_id}/{filename}` with RLS on the bucket mirroring `workspace_id IN (SELECT get_my_workspace_ids())`.

Action strip at the bottom of each thread:

- **Reply** — opens composer, prefilled with thread context and recipient
- **Mark {stage}** — the single-best stage advancement Aion's keyword heuristics surface (see §4.2). One tap moves the deal, logs the timeline row, pings the PM, and fires the confirmed-deal automations. Never auto-fires — always the owner's tap.
- **Snooze** — 4h / tomorrow / next week
- **Assign** — when the deal has no owner

No classification badge in Phase 1. Phase 1.5 adds it, gated on the precision floor.

### 3.2 Entity detail sheet — Messages tab (Phase 1.5)

Deferred. When it ships, it renders read-only cross-deal chronological history for a given person, keyed on `from_entity_id`. Useful for "when did they last mention budget?" Replies still happen on the deal, not the entity sheet — the sheet is context, the deal is action.

### 3.3 `/replies/unresolved` — triage surface

The existing `/inbox` stub at `src/app/(dashboard)/inbox/page.tsx` is replaced by a new route at `/replies/unresolved`. Redirect from `/inbox` to the new path to cover any external links.

Two sections:

**Unresolved** — messages where sender→entity matching failed (no `directory.entities` row with matching email) or sender matched but no active deal could be bound. Each row shows the sender address, subject, first ~120 chars of body, relative time. Three actions:

- **Link to deal** — autocomplete across active deals in the workspace; Aion surfaces top 3 suggestions based on subject and body keyword match against deal titles + recent timeline entries
- **Create new lead** — spawns a deal with ghost entity for the sender (`summonPersonGhost` path, human tap initiates)
- **Dismiss** — stamps `dismissed_at`, row leaves the queue

**Needs Response** — messages bound to deals where an inbound reply has been sitting >4 business hours without an outbound logged. Ages in red once past SLA.

Empty state: *"All replies are on their deals. Aion is watching for new ones."*

Kill criterion for the Unresolved queue: if any workspace sees >15 unresolved/week sustained, the sender-matching logic needs review (false-negative rate too high).

---

## 4. Data Flow

### 4.1 Schema

Three new tables in `ops`:

**`ops.message_threads`** — conversation boundary. Keyed on thread identity (RFC 2822 References chain for email, Twilio conversation_sid for SMS), not on deal. One deal may have many threads (couple thread + planner thread + venue thread).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `workspace_id` | `uuid` NOT NULL | RLS gate |
| `provider_thread_key` | `text` NOT NULL | Normalized RFC 2822 Message-ID root or Twilio conversation_sid |
| `channel` | `text` CHECK | `email` / `sms` / `call_note` (call_note is Phase 1.5+) |
| `subject` | `text` | Email subject; NULL for SMS |
| `deal_id` | `uuid` | FK → `public.deals.id`, nullable. Application-level join — matches `ops.follow_up_log` pattern. |
| `primary_entity_id` | `uuid` | FK → `directory.entities.id`, resolved sender |
| `last_message_at` | `timestamptz` | For sort |
| `unread_by_user_ids` | `uuid[]` | Per-user read state |
| `needs_resolution` | `boolean` DEFAULT false | True when sender match failed or deal couldn't be bound |
| `dismissed_at` | `timestamptz` | Set by "Dismiss" in Unresolved |
| `created_at` | `timestamptz` | |

**`ops.messages`** — one row per message event.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `workspace_id` | `uuid` NOT NULL | RLS gate |
| `thread_id` | `uuid` NOT NULL | FK → `ops.message_threads.id` |
| `direction` | `text` CHECK | `inbound` / `outbound` |
| `channel` | `text` CHECK | Mirror of thread |
| `provider_message_id` | `text` NOT NULL UNIQUE | Resend `email_id` or Twilio `MessageSid`. Unique constraint enforces webhook idempotency — duplicate webhook POSTs conflict and are dropped by the RPC. |
| `in_reply_to` | `uuid` | FK → `ops.messages.id`, self-reference for thread stitching |
| `from_entity_id` | `uuid` | FK → `directory.entities.id`, nullable when sender match fails |
| `from_address` | `text` NOT NULL | Raw sender — email or E.164 phone |
| `to_addresses` | `text[]` NOT NULL | |
| `cc_addresses` | `text[]` | |
| `body_text` | `text` | Always populated — multipart MIME rule from `docs/reference/code/email-sending.md` |
| `body_html` | `text` | Nullable for SMS |
| `attachments` | `jsonb` DEFAULT `'[]'` | `[{storage_path, filename, mime, size}]` |
| `sent_by_user_id` | `uuid` | FK → `auth.users.id`, outbound only |
| `delivered_at` / `opened_at` / `clicked_at` / `bounced_at` | `timestamptz` | Resend webhook-populated |
| `replied_at` | `timestamptz` | Set when a later inbound references this outbound |
| `urgency_keyword_match` | `text` | Phase 1: populated by keyword heuristic. Phase 1.5: renamed or supplemented by `ai_classification` |
| `ai_classification` | `text` | Phase 1.5+ |
| `ai_summary` | `text` | Phase 1.5+ |
| `hide_from_portal` | `boolean` DEFAULT false | Phase 1.5+ |
| `created_at` | `timestamptz` | |

**`ops.message_channel_identities`** — per-user connected identities.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `workspace_id` | `uuid` NOT NULL | |
| `user_id` | `uuid` | FK → `auth.users.id`, nullable for workspace-shared identities |
| `channel` | `text` CHECK | `email` / `sms` |
| `identity_address` | `text` NOT NULL | Email or E.164 phone |
| `provider` | `text` | `resend` / `twilio` / `gmail_oauth` (Phase 2) |
| `provider_credential_ref` | `text` | Secret reference, not the secret |
| `verified_at` | `timestamptz` | |
| `is_private` | `boolean` DEFAULT false | See §5.2 privacy model — this gates cross-deal views only, not deal-scoped messages |
| `revoked_at` | `timestamptz` | Set when owner disconnects |

Indexes: `(deal_id, last_message_at DESC)` on threads, `(thread_id, created_at DESC)` on messages, `(workspace_id, needs_resolution)` on threads for the Unresolved query.

### 4.2 RPCs

All SECURITY DEFINER. All REVOKE EXECUTE FROM PUBLIC, anon at creation (per `feedback_postgres_function_grants.md` — the sev-zero bug class we have already shipped once).

**`ops.record_inbound_message(p_provider_payload jsonb)`** — the inbound ingress. Called by `/api/webhooks/resend/route.ts` (and `/api/webhooks/twilio/route.ts` in Phase 1.5) after signature verification.

Steps:
1. Parse payload. Extract `provider_message_id`, `provider_thread_key`, `from`, `to`, `cc`, subject, body.
2. Early-return with no-op if `provider_message_id` already exists on `ops.messages` (idempotency on retry).
3. Match `provider_thread_key` → `ops.message_threads.id`. If no match, create a new thread. Workspace is resolved by looking up the per-workspace alias in `to` addresses against a `replies.unusonic.com` alias table.
4. Match `from` email → `directory.entities` via the `email` attribute. No match or ambiguous → leave `from_entity_id = NULL`, set `thread.needs_resolution = true`.
5. Insert `ops.messages` row.
6. If thread has a `deal_id` and any `ops.follow_up_queue` row matches (`deal_id = thread.deal_id AND status = 'pending'`): call `ops.resolve_follow_up_on_reply(queue_id, message_id)` — flips `status = 'acted'`, stamps `acted_by = NULL` (reply-auto-resolved), logs `ops.follow_up_log` row with `action_type = 'reply_received'`, supersedes sibling pending rows on the same deal.
7. Run keyword heuristics on body (Phase 1) — match against workspace-configurable urgency keywords (default: `deposit`, `confirmed`, `booked`, `cancel`, `decline`, `contract`). Hits populate `urgency_keyword_match`.
8. If urgency hit AND deal has an assignee: dispatch notification via the existing Daily Brief dispatch API with trigger `inbound_reply_urgent`. If no assignee, surface to anyone with deal access ordered by most-recent activity; first tap to assign claims ownership.
9. Enqueue `cortex.memory` embedding job (async, server-side — Phase 1.5 wires this once classification lands).
10. Return `message_id` for the webhook handler to ack.

**`ops.record_outbound_message(p_thread_id, p_channel, p_body_text, p_body_html, p_attachments, p_sent_by_user_id)`** — the outbound persist step. Called by the composer server action *before* Resend's send API.

Steps:
1. Insert `ops.messages` row with `direction = 'outbound'`, `delivered_at = NULL`.
2. Return `message_id`. Composer then calls Resend's send; Resend returns `provider_message_id`; composer stamps it on the row.
3. Resend's delivery/open/click/bounce webhooks update the same row via `provider_message_id` lookup.

**`ops.resolve_follow_up_on_reply(p_queue_id, p_message_id)`** — the auto-resolution primitive. Pure bookkeeping on the follow-up side; separated so the inbound RPC stays single-purpose.

### 4.3 Per-thread alias scheme

Outbound emails set `Reply-To: thread-{thread_id}@replies.unusonic.com`. The alias is stable for the lifetime of the thread and stored on `ops.message_threads.provider_thread_key` (the email case uses the Message-ID of the first outbound as the key).

Why per-thread, not per-deal: a deal may carry three distinct threads (couple, planner, venue). Per-deal aliases flatten them all into one visual thread and lose sender disambiguation. Per-thread aliases let the Replies card render threads as separate collapsible groups while still binding all of them to the deal.

DNS requirements on `replies.unusonic.com`:
- SPF hard-pass (no soft-fail)
- DKIM aligned (Resend manages the signing key)
- DMARC policy: `quarantine` at launch, `reject` once bounce rate stabilizes <2%
- Bounce rate monitoring: >2% pauses sends on the domain with a loud settings-page banner

### 4.4 Timeline extension

The `ops.deal_timeline_v` view (created in `supabase/migrations/20260428000000_deal_timeline_view.sql`) is extended via `CREATE OR REPLACE VIEW` with a third `UNION ALL` arm from `ops.messages`. The view already handles mixed `actor_kind` values; inbound messages surface as `actor_kind = 'client'` (new kind added to the `DealTimelineActorKind` type in `src/app/(dashboard)/(features)/crm/actions/get-deal-timeline.ts`). Metadata carries `thread_id`, `message_id`, and a preview so the Timeline card can deep-link to the Replies card for the full body.

---

## 5. Non-Negotiables

### 5.1 Privacy model (revised from initial vision)

**Deal-scoped messages are workspace-visible regardless of the sending identity's `is_private` flag.** The deal is the workspace-shared artifact; the message landed there because a workspace-member identity is corresponding with a client on a workspace deal. Hiding it from teammates defeats the entire team-visibility value prop.

**`is_private = true` on an identity only gates the cross-deal Entity Messages tab (Phase 1.5).** That tab aggregates all messages from a given person across all deals and channels. Private identities' contributions are excluded from that aggregation for viewers other than the identity owner. Deal-level visibility is never affected.

Default `is_private` on a newly connected identity: **false** (workspace-visible). The connect-identity flow shows a second screen with a "Keep this identity's cross-deal history private to me" toggle, defaulted off. Opt-in to privacy, not opt-out of visibility.

This reverses the initial vision's default and is the single most consequential call in the design.

### 5.2 Ghost Protocol holds

Unknown senders land in the Unresolved queue. Ghost entities are never auto-created from inbound messages. The owner taps "Create new lead" on the Unresolved row, which calls `summonPersonGhost(workspace_org_id, display_name, from_address)` — the existing human-initiated path. Per CLAUDE.md §4.

### 5.3 REVOKE EXECUTE FROM PUBLIC, anon on every new SECURITY DEFINER RPC

Non-negotiable. Audit query in the same migration (per the memory note on the sev-zero bug):

```sql
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc
WHERE pronamespace = 'ops'::regnamespace
  AND prosecdef
  AND proname IN ('record_inbound_message', 'record_outbound_message', 'resolve_follow_up_on_reply');
```

Expect `anon_can_execute = false` for all three. Any `true` fails the migration review.

### 5.4 Webhook idempotency

Both Resend and Twilio retry on 5xx or timeout. `ops.messages.provider_message_id` has a UNIQUE constraint. `record_inbound_message` checks existence first and short-circuits the entire pipeline if the provider message ID already landed. This prevents duplicate Replies card entries, duplicate urgent pushes, and duplicate follow-up resolutions.

### 5.5 Never auto-send to clients (revised rule)

**Client messages are never auto-sent without explicit per-workspace opt-in. Default: off.** When on, auto-sends are limited to the Follow-Up Engine's approved template set and always produce a timeline row tagged `sent by Aion`, including the full rendered body and the template ID. This preserves the trust floor while unblocking Follow-Up Engine V2's autonomous-send ambitions.

(Revised from the vision's absolute rule to allow the follow-up engine to ship its V2 autonomy behind an owner-gated setting. The default remains off; the visible-timeline-row requirement is load-bearing.)

### 5.6 Attachment storage protocol

Attachments land in Supabase Storage at `workspace-{workspace_id}/messages/{message_id}/{filename}`. The bucket has RLS enforcing the caller is a member of `workspace_id` (same pattern as the workspace-scoped buckets already in use per `docs/reference/code/storage-and-uploads.md`). Inbound attachments are written by the webhook handler's service-role context; downloads go through the user-session client so RLS applies. Never inline base64 in the `ops.messages.attachments` JSONB — store only metadata.

Staging during Resend's webhook parse: the handler writes the attachment to the workspace-scoped path directly, no temporary bucket. Resend's parse delivers attachment bytes in the webhook payload (or a signed URL we fetch), so there's no intermediate state.

### 5.7 Service role never client-exposed

Webhook handlers run server-side only. `ops.record_inbound_message` is called from the webhook route handler using `src/shared/api/supabase/system.ts`. The composer server action uses the user-session client and the RPC handles workspace scoping. Per the `project_triggers_module_leak.md` memory: any new imports into client components from the messages code path must be audited to ensure they don't transitively pull `system.ts` into the client bundle.

### 5.8 10DLC before first SMS (Phase 1.5)

Workspace cannot send or receive SMS until A2P 10DLC brand + campaign are registered. Gate in onboarding. Estimated wall-clock: 2-4 weeks per workspace. Toll-free verification path available as an alternative for workspaces that cannot register a brand. Block the send, do not queue it and hope.

### 5.9 Sender matching confidence threshold

Matching inbound `from` address → `directory.entities` must use exact email equality first. Fuzzy matching (case, subdomain variants) is explicitly out of scope for Phase 1 — false positives on shared family emails (`thesmiths@gmail.com`) are worse than routing to Unresolved. An "override and link to entity" action on the message row handles the miss case.

---

## 6. Trust Spectrum

Three tiers. The matrix is visible to the workspace owner in settings.

| Action | Tier | Triggered by |
|---|---|---|
| Timeline row on inbound | Auto | System |
| Follow-up queue flip to `acted` | Auto | System |
| Sibling follow-up supersession | Auto | System |
| Urgent-keyword push to assignee | Auto | System |
| Cortex memory embed with entity tags | Auto | System (Phase 1.5+) |
| Daily Brief row for unresolved-over-SLA | Auto | System (Phase 1.5+) |
| Stage advancement proposal ("Mark Confirmed?") | One tap | Owner |
| Draft contract from accepted proposal | One tap | Owner |
| Crew availability ping on confirmed deal | One tap | Owner |
| Reply draft acceptance | One tap | Owner (Phase 3) |
| Sending any message to a client (default) | Never auto | Always human |
| Sending any message to a client (with FUE V2 opt-in) | Auto, template-set-restricted | Aion, with visible timeline row |
| Ghost entity creation from unknown sender | Never auto | Always human |
| Stage advancement itself (the state change) | Never auto | Always human |

The owner-facing rule: *Unusonic never emails your clients without you tapping send, unless you turn on Follow-Up Engine V2's auto-send and opt into a specific template set. Everything else is fair game for automation because nothing else leaves the workspace.*

---

## 7. Phase 1 Ship List

Ordered by P0 (ship or don't ship) → P1 (feature complete) → P2 (polish, first to defer).

**P0 — the 4:47pm moment works end-to-end.**

1. Migrations: `ops.messages`, `ops.message_threads`, `ops.message_channel_identities`, with workspace RLS and the REVOKE audit query
2. `ops.record_inbound_message()`, `ops.record_outbound_message()`, `ops.resolve_follow_up_on_reply()` — all REVOKE-hardened, idempotent on `provider_message_id`
3. Per-thread alias provisioning on `replies.unusonic.com` with SPF/DKIM/DMARC green
4. Extend `src/app/api/webhooks/resend/route.ts` with inbound parse, `email.opened`, `email.clicked` event handling
5. Replies card on Deal Lens: thread groups, resting/live states, Reply / Mark {stage} / Snooze / Assign actions, attachment chips
6. Outbound composer component at `src/features/comms/compose/ReplyComposer.tsx` — one component, two entry points (Replies card + Aion card), attachments via workspace-scoped storage path, draft autosave
7. `ops.deal_timeline_v` extension — third `UNION ALL` arm from `ops.messages`; `DealTimelineEntry.source` union extended to include `'message'`
8. Keyword-heuristic urgent detection + push via Daily Brief dispatch API

**P1 — feature complete for launch.**

9. `/replies/unresolved` route with link-to-deal / create-lead / dismiss actions; redirect from `/inbox`
10. `ops.message_channel_identities` connect/disconnect flow at `src/app/(dashboard)/settings/messaging/page.tsx` — owner-only capability-gated
11. Resend delivery/open/click/bounce webhook wiring onto `ops.messages.delivered_at`, `opened_at`, `clicked_at`, `bounced_at`
12. Bounce-rate monitoring banner on the settings page (>2% pauses outbound on `replies.unusonic.com`)
13. SLA timer on Needs Response rows — business-hours-aware aging from `messages.created_at`

**P2 — polish, defer first if timeline slips.**

14. Snooze state persistence and surface on the Replies card header
15. Thread unread state in `message_threads.unread_by_user_ids[]` with Replies card unread count
16. Attachment inline previews (PDFs, images) in the thread group
17. Composer signature preview (from workspace settings)

**Deferred to Phase 1.5** (do not attempt in Phase 1):

- Twilio SMS inbound + outbound + 10DLC onboarding
- Aion classification of reply intent + classification badge on Replies card
- Aion summary line under each message
- Entity detail sheet Messages tab
- Portal `hide_from_portal` + `ops.portal_messages_v`
- Daily Brief `inbound_reply_needs_triage` evaluator
- Attachment "Save to deal files" chip action
- Cortex memory embedding with entity tags

---

## 8. Hard Calls

**Default `is_private` on newly connected identity:** false. See §5.1. The initial vision had this as true; Critic correctly flagged that the privacy-maximalist default defeats team visibility in small workspaces where only the owner connects early. Deal-scoped messages are workspace-visible regardless.

**Outbound composer entry points:** two — the Replies card and the Aion card. One component (`src/features/comms/compose/ReplyComposer.tsx`). Replies card opens it with thread context; Aion card opens it with Aion's prefilled draft (Phase 3). Consistency over symmetry.

**Inbound reply on unowned deal:** surfaced to anyone with deal access, ordered by most-recent-activity. First tap on Assign claims ownership. Workspace admins see it too, not preferentially — production shops are flat. If nothing claims in 2 hours, Daily Brief surfaces it to all admins (Phase 1.5+).

**Unresolved notification cadence:** silent during business hours, digest at 6pm local if >3 unresolved sitting >4h. Daily Brief carries the urgent ones at 8am (Phase 1.5+). No push notification for every spam message Aion couldn't place.

**Attachments on client replies:** stay on the message. No auto-link to deal capture surface. Phase 1.5 adds a "Save to deal files" chip action with provenance ("From Sarah Smith's reply, 2026-04-19"). Human-initiated filing, always.

**Naming:** "Replies" everywhere. The initial vision's "Inbox" for global triage was killed — the distinction would collapse in user parlance within a month. Global triage = `/replies/unresolved`. "Inbox" name is reclaimable later when there's a real inbox product to match.

**SMS in Phase 1:** no. Phase 1.5. 10DLC wall clock (2-4 weeks) is an external blocker, existing-client SMS still lives on the owner's personal cell, and the workspace Twilio number captures a small fraction of actual comms in year one. Better to ship email-only honestly in 8 weeks than to ship "email + SMS shaped like email but actually very limited" in 10.

---

## 9. Risks & Dependencies

**Resend single-point-of-failure.** If Resend rate-limits, delays inbound parsing, or has a bad Tuesday, Replies has a bad Tuesday. Documented degraded mode:
- Inbound parse queue delays: the webhook retries are idempotent, so catch-up is automatic once service resumes. Settings-page banner surfaces when inbound parse latency (measured via a heartbeat email) exceeds 5 minutes.
- Outbound send failure: composer errors loudly, offers "retry" and "copy body to clipboard to send from Gmail." Never silently drops.
- No automatic fallback provider. If Resend is down for >1h in business hours, that's a platform-level incident, not a Replies-specific issue.

**DKIM alignment.** Required on `replies.unusonic.com` before first outbound send. Checked by DNS health monitor in `src/app/api/cron/` (new cron job). Missing DKIM → outbound paused with a settings banner. This is where "silently ends up in spam" becomes "loud visible problem."

**Webhook signature verification.** Mirrors the existing Resend handler pattern — `timingSafeEqual` against the webhook secret. Verified before any DB access. The Stripe pattern from CLAUDE.md §Security Constraints applies identically.

**Sender matching false positives.** Exact-email-only matching caps the false-positive rate. A family email hitting the wrong entity is the failure mode; mitigation is the manual "override and link" action on the message row, plus the Unresolved queue absorbing ambiguous cases.

**`/inbox` stub reference audit.** Grep the codebase for internal references to `/inbox` before cutover. Add redirect in middleware. External deep links (if any exist in old emails) 301 forward.

**Resend inbound parse feature.** Confirm Resend's inbound-parse endpoint is available and documented before Phase 1 kickoff. If Resend doesn't offer inbound parsing at the tier we need, fall back to SendGrid Inbound Parse or Postmark Inbound — same architectural shape, different vendor. Does not change any table or RPC design.

**Beta cohort channel-mix validation.** Before Phase 2+ commits to Gmail OAuth, interview 8 production owners: scroll their sent-proposal thread for the last 10 deals and count the channel of the first substantive reply. If email <40%, rethink Phase 2-4. If ≥70%, green-light. Runs in parallel with Phase 1 build — no schedule impact. Internal number published before Phase 1.5 scope is locked.

---

## 10. Reference

**New files (Phase 1):**
- `src/features/comms/replies/RepliesCard.tsx`
- `src/features/comms/compose/ReplyComposer.tsx`
- `src/app/(dashboard)/settings/messaging/page.tsx`
- `src/app/(dashboard)/replies/unresolved/page.tsx`
- `supabase/migrations/{ts}_ops_messages_tables.sql`
- `supabase/migrations/{ts}_ops_record_message_rpcs.sql`
- `supabase/migrations/{ts}_deal_timeline_v_messages_arm.sql`
- `supabase/migrations/{ts}_replies_alias_dns.sql` (alias lookup table + workspace alias provisioning RPC)

**Extended files (Phase 1):**
- `src/app/api/webhooks/resend/route.ts` — add inbound parse, `email.opened`, `email.clicked`
- `src/app/(dashboard)/inbox/page.tsx` — redirect to `/replies/unresolved`
- `src/app/(dashboard)/(features)/crm/actions/get-deal-timeline.ts` — add `'message'` to `DealTimelineEntry.source` union; extend `getDealTimeline()` to read the new view columns
- `src/app/(dashboard)/(features)/crm/components/deal-lens.tsx` — insert the Replies card between Timeline and Production Team

**Phase 1.5 files (not in Phase 1 scope, listed for sequencing):**
- `src/app/api/webhooks/twilio/route.ts`
- `src/features/auth/smart-login/api/sms-actions.ts` — extend with workspace-sender variant
- `src/app/api/aion/lib/insight-evaluators.ts` — add `inbound_reply_needs_triage`
- `src/app/api/aion/classify-reply/route.ts` — new endpoint for the Phase 1.5 classifier

**Referenced patterns:**
- `supabase/migrations/20260428000000_deal_timeline_view.sql` — timeline view idempotent extension pattern
- `docs/reference/aion-daily-brief-design.md` §2.2 — insight evaluator registry
- `docs/reference/crm-page-state-and-flow.md` §14-15 — entity sheet layout
- `docs/reference/code/email-sending.md` — Resend wrapper conventions
- `docs/reference/code/storage-and-uploads.md` — workspace-scoped storage path protocol
