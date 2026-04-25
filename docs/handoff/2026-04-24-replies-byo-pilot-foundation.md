# Handoff — Replies + BYO Pilot Foundation

**Session:** 2026-04-23 → 2026-04-24 (multi-day)
**Worktree:** `/Users/danielarthur/Documents/unusonic/.claude/worktrees/dreamy-austin-a8ad25`
**Repo:** github.com/danarthur/unusonic
**Pilot user:** Invisible Touch Events (Daniel's dad's production company)

---

## TL;DR

Eight PRs shipped end-to-end. Inbound Replies pipeline is hardened. Replies card v2 (Apple Mail-style threading) replaces v1 monolith. Cross-deal discoverability ships via lobby widget. BYO sending-domain wizard is correctness-complete + pilot-polished. Invisible Touch Events is ready for white-glove onboarding.

```
PR  | Title                                              | State
----|---------------------------------------------------|------
#18 | fix(proxy): allow webhook bypass                  | Merged
#19 | fix(replies): inbound hardening                   | Merged
#20 | feat(replies): card v2                            | Merged
#21 | fix(replies): nested-button hot-fix               | Merged
#22 | feat(replies): Recent Replies lobby widget        | Merged
#23 | chore(migrations): prod-sync                      | Merged
#24 | fix(byo): correctness pass                        | Merged
#25 | feat(byo): pilot polish                           | Merged
```

Last commit on main: `0f0acf7`.

Approximately **5,000 LOC + 3,000 LOC tests + 6 migrations applied to live DB + 4 design docs**.

---

## Working agreements & decision patterns

These will save the next session real time.

- **Daniel chooses the fuller scope when offered a fork.** Don't pre-cut. Present a clear A/B/C menu; he picks the ambitious one. *Source: memory note `feedback_premium_over_speed.md`.*
- **Research before non-trivial features.** Spawn Critic + User Advocate + Field Expert + Plan/Explore in parallel before building. Roughly doubles tokens, catches correctness bugs and UX-fatal ambiguities. *Source: memory note `feedback_research_team_before_build.md`.*
- **The "Marcus" persona is fictional.** He's the User Advocate's composite production-company-owner voice, not a real Unusonic user. Don't conflate with Daniel or Daniel's dad. The actual pilot user is Invisible Touch Events.
- **Explicit deferral over silent shortcut.** When scoping out of a PR, write the deferred items with rationale into the PR body. Don't silently skip.
- **Premium pre-launch.** Pre-pilot is a gift to do it right, not a license to ship fast. Don't compress polish to win 30 minutes.

---

## Current architecture state

### Replies feature (inbound + outbound + UI)

**Inbound pipeline** — `src/app/api/webhooks/postmark/route.ts`
- Postmark Inbound Server registered for `replies.unusonic.com`
- Auth via padded `timingSafeEqual` (closes length side-channel)
- DLQ-first writes to `ops.inbound_raw_payloads` (every POST traceable)
- Auto-reply classifier — RFC 3834 + heuristic cascade, classifies OOO/bounce/bulk
- Thread resolution: alias-first (`thread-{uuid}@replies.unusonic.com`) → RFC 2822 fallback
- Unmatched alias = 200 with `parse_status='unmatched_alias'` (NEVER silent thread creation — that was the original bug)
- Workspace-scope assertion in `record_inbound_message` RPC
- Unique partial index on `(workspace_id, provider_message_id)` — DB-level idempotency
- Sentry breadcrumbs at 12 pipeline stages

**Outbound** — `src/features/comms/replies/api/send-reply.ts`
- Insert-first-then-stamp pattern via `record_outbound_message_draft` + `stamp_outbound_provider_id`
- Reply-To alias attached ONLY when sender is on `unusonic.com` platform domain
- BYO workspaces use native From-based reply routing (Reply-To alias would trigger spam filters)
- Inbound mirror for BYO domains is Phase 1.5 (`replies.theirdomain.com` → Postmark)

**Replies card v2 (Deal Lens)** — `src/features/comms/replies/ui/RepliesCard.tsx`
- Apple Mail-style: threads collapsed by default, one-expanded-at-a-time
- Card height ~240px at rest regardless of message volume
- Show latest 5 + "Show N earlier messages · date range" ghost row
- "Owed" indicator in card chrome (replaces v1 filter row Marcus rejected)
- Snooze: 4h / Tomorrow / Next week (RPC `ops.snooze_thread`)
- Fork C owed override: heuristic + manual override via `owed_override` column
- ⌘F search across all messages on the deal
- Per-message quoted-reply collapse (`lib/quote-stripper.ts`)
- Auto-replies muted (italic, opacity 0.62, "Auto-reply" label)
- Bounce: red dot + "Bounced" chip on collapsed thread row

**Discoverability** — `src/widgets/recent-replies/`
- Lobby widget: latest 12 inbound across the workspace
- Deep-links to `/crm?selected={dealId}`
- Auto-replies aggregated into muted footer row
- Per-item `isOwed` flag for the dot
- Registered in `lobby.recent_replies` for the Sales preset

### BYO sending domain

**Already in place pre-session** (don't rebuild):
- `getWorkspaceFrom()` — `src/shared/api/email/core.ts:65`
- `workspaces` columns: `sending_domain`, `sending_domain_status`, `resend_domain_id`, `sending_from_*`, `dmarc_status`
- Resend SDK wrappers — `src/shared/api/resend/domains.ts`
- Webhook handler for `domain.updated` — `src/app/api/webhooks/resend/route.ts`
- Settings page + 3-state UI — `src/app/(dashboard)/settings/email/`
- All sender modules correctly use `getWorkspaceFrom()` (proposal/billing/Aion). Auth emails correctly use `getFrom()` directly.
- `unusonic.com` already verified in Resend (Daniel's account). Default sender is `Unusonic <hello@unusonic.com>` — NOT the placeholder `onboarding@resend.dev`.

**Shipped this session:**
- DMARC default: `p=quarantine; pct=100; rua=mailto:dmarc-aggregate@unusonic.com; adkim=r; aspf=r;`
- `preflightSendingDomain()` server action — checks parent for MX/SPF/DMARC, surfaces non-blocking findings ("your existing email keeps working")
- `detectDnsProvider()` server action — maps NS patterns to 8 known registrars
- `sendVerificationTestEmail()` server action — fires test from verified domain to user's auth email
- Live polling on pending state (30s/5min then 60s/30min)
- Before/after sender preview in State A
- Cloudflare orange-cloud warning when CF nameservers detected
- Per-record status pills on DnsRecordRow
- Failure copy with collapsible 4-cause expand
- Reply-To same-domain rule in `send-reply.ts`
- Spoofing reserved-domains list (basic)

### DB state

**Live production migrations applied this session:**
1. `20260424213000_replies_inbound_hardening.sql` — DLQ table, idempotency unique index, auto-reply columns, triage columns
2. `20260424213100_replies_rpc_thread_id_first.sql` — `record_inbound_message` accepts explicit `thread_id`
3. `20260424230147_replies_card_v2.sql` — snooze columns, owed_override columns, RPCs

**Schemas in active use:**
- `directory` — `entities` (people, companies, venues — knowledge graph nodes)
- `ops` — `events`, `messages`, `message_threads`, `inbound_raw_payloads`, `follow_up_queue`, etc.
- `cortex` — `relationships` (graph edges), `aion_*`, `memory`
- `finance` — invoices, payments, QBO sync
- `public` — legacy + grandfathered (deals, proposals, contracts, etc.)

### Vercel + DNS state

- Production at `unusonic.com` (Vercel Pro)
- Last deploy: `0f0acf7` (PR #25)
- Postmark Inbound Server bound to `replies.unusonic.com` (Daniel's account)
- Postmark DMARC monitoring on apex `unusonic.com`
- Resend domain `unusonic.com` verified (us-east-1)
- Apex DMARC: `p=none; pct=100; rua=mailto:dmarc@unusonic.com; fo=1; aspf=r; adkim=r;` (week-1 monitoring; flip to `p=quarantine` after clean digests)
- Google Workspace MX on apex (`hello@unusonic.com` aliased to `daniel@`)
- 11 aliases on Daniel's mailbox: `hello@`, `support@`, `billing@`, `sales@`, `daniel.arthur@`, `security@`, `legal@`, `dmarc@`, `aion@`, plus reserved `abuse@`/`postmaster@` (Google auto-routes)

---

## Roadmap (in priority order)

### Pilot launch — Invisible Touch Events

**White-glove (Daniel's manual work, not in PRs):**
- 15-min Zoom with dad to set up `invisibletouchevents.com` BYO domain
- Walk through the wizard, observe failure modes
- Pre-create test threads to demo
- Calibrate Aion brief copy if needed

**Day-1 monitoring:**
- Watch DLQ status counts daily for first week
- Postmark DMARC weekly digest landing in Daniel's inbox
- Sentry breadcrumbs for `postmark.webhook.*` events

### Phase 1.5 (next 2-4 weeks, after pilot week 1)

**P0 — needed before cohort 2:**
- "Email this to my IT person" rescue flow (Marcus State C — 35% of users) — server action + token + email composition
- Mobile magic-link "finish at your computer" escape
- Registrar-specific tabs in BYO wizard (Cloudflare, GoDaddy, Squarespace, Namecheap, Google Domains — 80% coverage)
- Aion thread classification chips (`Question`, `Decision needed`, `Wants meeting`) — gated on ≥85% precision floor
- Sender filter chips inside expanded threads (conditional: ≥4 senders or ≥20 messages)
- Per-message role badges in expanded thread (Bride / Planner / Venue from `cortex.relationships`)
- Aggregated auto-reply collapse ("3 auto-replies between Apr 14–21 · expand")

**P1 — should ship before 100 workspaces:**
- HMAC-signed thread tokens (replace raw UUIDs in Reply-To alias)
- Per-channel SMS threading (when SMS lands)
- Internal team comments on threads (Front-style "FYI Sam, tread carefully")
- Templates / snippets ("thanks, will revert by EOD")
- Cross-deal sender history ("show all of Pramila's messages across deals")
- Aion thread summary line for threads >20 messages
- DKIM key rotation when Resend exposes pre-rotated selectors
- DMARC aggregate report ingestion + per-workspace deliverability dashboard

### Phase 2 / 3 (post-100-workspaces)

- Push notifications (10:47pm dinner scenario — service worker + PWA + web push)
- Full-screen `/crm/[dealId]/replies/[threadId]` view for monolith threads
- BIMI logos in Gmail (requires VMC certificate ~$1,500/yr from Entrust or DigiCert)
- iframe-isolated raw HTML render ("Show original" toggle)
- Aion-suggested reply chips per inbound message (Superhuman pattern, requires voice-learning infrastructure)
- Gmail OAuth parity audit (cross-check that nothing falls through Unusonic)
- Per-workspace rate limiting (currently global)
- Postgres FTS for in-card search when threads exceed ~200 messages
- Auto-detect domain ownership change (daily cron)

---

## Open threads / known issues

### Active

- **Outstanding open PRs from prior sessions** — #17 (proposal builder), #5 (network person stats), #3 (Aion Phase A planning). NOT touched this session. Status unknown — verify with the user before resuming any.
- **Apex DMARC at `p=none`** — set during email setup. After 2 weeks of clean Postmark DMARC digests, flip to `p=quarantine`. After 90 days clean, flip to `p=reject`. Reminder this is a manual DNS edit Daniel does in Cloudflare.
- **Resend → `mail.unusonic.com` migration** — captured in earlier conversation as a "before pilot launch" reputation-isolation task. NOT done. Apex Resend works fine for current volume; only matters at scale or if Daniel wants to send personal mail from `daniel@unusonic.com` independent of the Aion outbound pipeline.

### Verified / closed

- ✅ Test C round-trip works in production (Daniel sent verify-pr19-fresh-compose-2026-04-24, message landed on thread 1b0d97d7 correctly)
- ✅ All proxy webhook endpoints reachable (no more 307→login)
- ✅ Migrations applied successfully via Supabase MCP
- ✅ Dev server runs cleanly on `claude/replies-card-v2` and subsequent branches

### Things to watch

- **DLQ growth rate** — `ops.inbound_raw_payloads` grows unboundedly. Phase 1.5 archival job (raw JSONB → cold storage after 90 days) is on the roadmap. For pilot volume (1 workspace, <50 inbound/week), not near-term concern.
- **Per-record status from Resend** — current `DnsRecord.status` type only includes `not_started | verified | failure`. If Resend adds `temporary_failure` to per-record status, update the discriminated union.
- **`sendVerificationTestEmail` requires `sending_domain_status='verified'`** — refuses to send otherwise. By design (the action's job is to PROVE BYO works), but if a future flow wants a generic "send a test from default sender," it's a separate action.

---

## File map (where things live)

```
src/
├── app/
│   ├── api/webhooks/
│   │   ├── postmark/                    # Inbound Replies webhook (PR #19)
│   │   │   ├── route.ts                 # Main handler
│   │   │   ├── __lib__/
│   │   │   │   ├── auth.ts              # Padded timingSafeEqual
│   │   │   │   ├── auto-reply.ts        # RFC 3834 classifier
│   │   │   │   └── thread-key.ts        # RFC 2822 cascade
│   │   │   └── __tests__/               # 95+ tests
│   │   └── resend/route.ts              # Outbound delivery + domain.updated
│   ├── (dashboard)/
│   │   ├── (features)/crm/
│   │   │   ├── unmatched-replies/page.tsx   # Triage page (PR #19)
│   │   │   └── deal/[id]/page.tsx           # Hosts RepliesCard
│   │   ├── lobby/lobby-card-renderer.tsx    # Registers Recent Replies
│   │   └── settings/email/                  # BYO wizard
│   │       ├── page.tsx
│   │       └── EmailDomainSettings.tsx      # Multi-state wizard UI
│   └── proxy.ts                             # PUBLIC_ROUTES gate (PR #18)
├── features/
│   ├── comms/replies/
│   │   ├── api/
│   │   │   ├── get-deal-replies.ts          # Per-thread aggregates
│   │   │   ├── send-reply.ts                # Outbound w/ Reply-To rule
│   │   │   ├── snooze-thread.ts
│   │   │   └── set-owed-override.ts
│   │   ├── ui/                              # Card v2 components
│   │   │   ├── RepliesCard.tsx              # Top-level orchestrator
│   │   │   ├── ThreadRow.tsx
│   │   │   ├── ExpandedThread.tsx
│   │   │   ├── MessageTile.tsx
│   │   │   ├── ParticipantAvatars.tsx
│   │   │   ├── ThreadOverflowMenu.tsx
│   │   │   ├── OwedIndicator.tsx
│   │   │   ├── CardSearchInput.tsx
│   │   │   └── ReplyComposer.tsx
│   │   └── lib/quote-stripper.ts            # RFC 2822 quote detection
│   └── org-management/api/
│       └── email-domain-actions.ts          # BYO server actions
├── widgets/
│   └── recent-replies/                      # Lobby widget (PR #22)
│       ├── api/get-recent-replies.ts
│       ├── ui/RecentRepliesWidget.tsx
│       └── index.ts
├── shared/
│   ├── api/
│   │   ├── email/core.ts                    # getWorkspaceFrom, getResend
│   │   └── resend/domains.ts                # SDK wrappers
│   └── lib/
│       ├── metrics/registry.ts              # lobby.recent_replies entry
│       └── lobby-layouts/presets.ts         # Sales preset
└── types/supabase.ts                        # Auto-gen types

supabase/migrations/
├── 20260424213000_replies_inbound_hardening.sql
├── 20260424213100_replies_rpc_thread_id_first.sql
└── 20260424230147_replies_card_v2.sql

docs/
├── reference/
│   ├── replies-design.md
│   └── replies-card-v2-design.md            # Created this session
├── roadmap/
│   └── byo-sending-domain.md                # Created this session
└── handoff/
    └── 2026-04-24-replies-byo-pilot-foundation.md   # This file
```

---

## Pre-session knowledge to skim

If the next session is fresh, glance at these in order:

1. **`CLAUDE.md`** at repo root — project rules, schema layout, design system
2. **Memory notes** under `~/.claude/projects/.../memory/`:
   - `project_pilot_owners.md` — Invisible Touch Events context
   - `project_replies_initiative.md` — Replies feature design intent
   - `feedback_premium_over_speed.md` — Daniel's choice pattern
   - `feedback_research_team_before_build.md` — research-first methodology
   - `project_brand_philosophy.md` — Unusonic / Aion brand context
   - `project_design_direction.md` — Stage Engineering current state
3. **`docs/reference/replies-card-v2-design.md`** — full v2 spec
4. **`docs/roadmap/byo-sending-domain.md`** — BYO Phase 1.5 roadmap

---

## Suggested next-session opening prompts

If picking up where we left off, here are reasonable continuations Daniel might ask for, with the right starting move for each:

| User intent | Right move |
|---|---|
| "Pilot is launching this week, prep checklist" | Verify migrations applied, walk Daniel through `/settings/email` BYO setup for `invisibletouchevents.com` (15-min Zoom equivalent). Generate test fixture data for dad's first deal. |
| "Build the IT-person rescue flow" | Phase 1.5 PR #26. Server action that takes a recipient email + workspace context, composes a clean DNS-records email, sends. UI on the BYO wizard's pending state for "Email this to my IT person." Add token-based deep-link back to wizard. |
| "Build registrar-specific tabs" | Top 5 (Cloudflare, GoDaddy, Squarespace, Namecheap, Google Domains). Lots of copy work — screenshots optional Phase 1.5, defer to Phase 2 if scope creeps. |
| "Aion classification chips on inbound" | Gated on ≥85% precision floor. Spawn the Aion classifier work first, then surface chips in MessageTile. Phase 1.5 territory. |
| "Auto-detect domain ownership change" | Daily cron in `src/app/api/cron/`, similar shape to existing crons. Re-checks each verified domain's DKIM, flips status + emails owner if records disappeared. |
| "Sender filter chips in expanded thread" | Already designed in PR #20's docs but deferred. Conditional render (≥4 senders or ≥20 messages). ~80 LOC in ExpandedThread.tsx. |
| "Why did X break in production?" | Start by tailing `ops.inbound_raw_payloads` for `parse_status != 'parsed'`. Then Sentry breadcrumbs filtered to `postmark.webhook.*`. |

---

## What was tried that didn't work

For the next session: don't waste cycles on these.

- **Field Expert claimed the default sender was `onboarding@resend.dev`.** Wrong. It's `Unusonic <hello@unusonic.com>` and has been since before this session. Verify env values directly when in doubt.
- **Initial poll for "deploy live" used a fake signal** (`x-vercel-id` per-request, not per-deploy). Use DLQ row appearance via Supabase REST API instead, or query Vercel deployment status via `gh api` if needed.
- **DocuMentation referenced `daniel.arthur` etc. as user names.** Daniel is the founder, not a typical workspace user. The pilot user is Daniel's dad at Invisible Touch Events.
- **`+` aliases in Google Workspace.** Daniel's workspace blocks the `+` character on Admin Console alias creation. Use dot-addressing (`daniel.postmark@`) — plus-routing still works automatically without an alias entry.
- **The User Advocate "Marcus" persona.** He's a research composite, not a real person. Don't onboard him to the system.

---

## Session metrics

- ~50 tool turns to complete
- ~150 tests landed across 8 PRs
- 0 production incidents
- All migrations applied without rollback
- All PRs merged with squash strategy
- Test C end-to-end verified in production after PR #19

---

End of handoff. Next session can pick up from this doc + `git log origin/main` + the file map above.
