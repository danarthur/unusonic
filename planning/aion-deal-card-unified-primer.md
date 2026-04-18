# Aion Deal Card — Unified Card Planning Primer

**Purpose:** This doc briefs the Claude chat that will plan and build **Fork C — a unified Aion deal card** that merges the existing follow-up card (outbound comms) with the AionSuggestionRow (pipeline advance) into a single surface per deal.

**Source chat:** 2026-04-18 follow-up-engine P0 build.

**Target branch:** `claude/pensive-lederberg-e34adc` (or create a new worktree off `main` — see "Starting the chat" at the bottom).

---

## Read this doc first, then:

1. `CLAUDE.md` — project guardrails
2. `planning-primer.md` (repo root) — Unusonic condensed context
3. This doc's "Fork C brief" section

After that you have enough to run research agents.

---

## 1. What shipped in this session (P0 follow-up engine)

Three DB migrations applied to the live Supabase project, all idempotent:

- **`supabase/migrations/20260423000000_follow_up_p0_schema.sql`**
  - Feature flag `pipelines.triggers_enabled` flipped ON globally, workspace default changed
  - Added columns to `ops.follow_up_queue`: `hide_from_portal`, `escalation_count`, `last_escalated_at`, `priority_ceiling`, `dismissal_reason` (text + CHECK), `originating_stage_id`, `originating_transition_id`, `primitive_key`, `superseded_at`
  - Added `triggers_snapshot jsonb` to `ops.deal_transitions` (no index — TOAST'd by design)
  - Dropped legacy `follow_up_queue_deal_uniq` index, replaced with two dedup indices: `(originating_transition_id, primitive_key)` unconditional, and `(deal_id, reason_type) WHERE status='pending'`
  - Extended `reason_type` CHECK with `nudge_client`, `check_in`, `gone_quiet`, `thank_you`
  - Created `ops.active_deals` view (working OR won-with-future-event) with `security_invoker=true, security_barrier=true`
  - Created `ops.portal_follow_up_queue` view (hide_from_portal=false + superseded_at NULL + pending) with same security options
  - Added index `ops.events(project_id, starts_at DESC)` and pending-supersession lookup index

- **`supabase/migrations/20260423000100_follow_up_p0_transition_and_claim.sql`**
  - Updated `record_deal_transition()` to snapshot the target stage's `triggers` jsonb onto the new transition row AND stamp `superseded_at` on stale pending follow-ups from prior stages
  - Updated `ops.claim_pending_transitions(p_batch_size)` to return `COALESCE(t.triggers_snapshot, s.triggers)` (snapshot wins; live fallback) and expose `stage_tags text[]`
  - Added `ops.has_primitive_fired(transition_id, primitive_type) → boolean` as a second-line idempotency check

- **`supabase/migrations/20260423000200_follow_up_p0_seed_triggers_and_sla.sql`**
  - Added `ops.seed_default_triggers(workspace_id)` — idempotent, matches by stage tags (not slug/label), merges on `primitive_key`, skips silently if tag missing
  - Backfilled all existing workspaces
  - Chained into the existing workspace-creation trigger
  - Added `ops.evaluate_dwell_sla(p_batch_size)` RPC — returns deals in stages with `dwell_sla` triggers past `dwell_days` where the SLA enrollment hasn't fired yet
  - All new RPCs `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`

Seeded default triggers by tag (idempotent):

| Tag | Event | Primitive | Config |
|---|---|---|---|
| `initial_contact` | on_enter | `enroll_in_follow_up` | reason=`nudge_client`, dwell=3, channel=email |
| `proposal_sent` | on_enter | `enroll_in_follow_up` | reason=`check_in`, dwell=7, channel=email |
| `proposal_sent` | dwell_sla (14d) | `enroll_in_follow_up` | reason=`gone_quiet`, priority_boost=20 |
| `contract_out` | on_enter | `create_task` | "Confirm contract sent", assignee=owner |
| `deposit_received` OR `ready_for_handoff` | on_enter | `trigger_handoff` | open_wizard=true |
| `won` | on_enter | `enroll_in_follow_up` | reason=`thank_you`, dwell=1, hide_from_portal=false |

### Shared libraries added

- `src/shared/lib/triggers/schema.ts` — Zod schemas for stage triggers (max 10 per stage, 4KB serialized cap, dwell_sla refine)
- `src/shared/lib/triggers/primitives/enroll-follow-up.ts` — primitive with DB-dedup-aware insert (catches Postgres error 23505), channel resolver (entity aion_memory → trigger config → email), base priority 10
- `src/shared/lib/triggers/dwell-sla.ts` — dispatcher for `dwell_sla` triggers, runs hourly via `/api/cron/dwell-sla/route.ts` (new cron entry in `vercel.json`)
- `src/shared/lib/follow-up-copy.ts` — reason_type → human copy mapping (TE/Leica voice, no exclamation marks)
- `src/shared/lib/follow-up-portal-filter.ts` — typed reader for portal routes (prophylactic, no current portal consumers)

### Dispatcher changes (core)

- `src/shared/lib/triggers/dispatch.ts` — parses `event`, `dwell_days`, `primitive_key` from trigger shape; filters to `event === 'on_enter'` on main path; passes `primitiveKey`, `event`, `stageTags` through to primitives
- `src/shared/lib/triggers/types.ts` — extended `TriggerContext` (stage_trigger variant) with `primitiveKey`, `event`, `stageTags`
- `src/shared/lib/triggers/registry.ts` — registered `enrollInFollowUpPrimitive`

### UI changes

- `src/app/(dashboard)/(features)/crm/components/aion-suggestion-row.tsx` — **new** client component, self-fetches insight for a deal, renders ★ row with Accept/Reject; Reject popover has 5-enum options + free-text "other"
- `src/app/(dashboard)/(features)/crm/actions/aion-suggestion-actions.ts` — **new** server actions (`getStageSuggestionForDeal`, `acceptStageSuggestion`, `rejectStageSuggestion`). Uses `getSystemClient()` for cortex reads/writes because cortex schema is not PostgREST-exposed (documented caveat — see issue #3 below). Validates workspace membership via `workspace_members` lookup before service-role read.
- `src/app/(dashboard)/(features)/crm/components/stream-card.tsx` — renders AionSuggestionRow only when card is `selected` AND `item.source === 'deal'` (avoids N+1 fetch across pipeline)
- `src/app/(dashboard)/(features)/crm/components/deal-lens.tsx` — renders AionSuggestionRow under the Pipeline Tracker inside the Deal pipeline panel
- `src/app/(dashboard)/(features)/crm/archive/page.tsx` — **new** route, lists past deals with pending follow-ups, low-density; full toggle + drilldown deferred to P1

### Evaluator + tag gating

- `src/app/api/aion/lib/evaluators/stage-advance-suggestion.ts` — **new** evaluator, gates on `stage.tags` (not slug). Two heuristics:
  - Deal in `initial_contact` stage AND non-draft proposal exists → suggest advance to `proposal_sent`
  - Deal in `proposal_sent` stage AND accepted proposal → suggest advance to `contract_out`
- `src/app/api/aion/lib/insight-evaluators.ts` — wired new evaluator into `evaluateAllInsights`
- `src/app/api/aion/lib/insight-trigger-domains.ts` — added `stage_advance_suggestion: 'sales'`

### Cron + webhook changes

- `src/app/api/cron/follow-up-queue/route.ts` — removed won/lost blanket DELETE; now stamps `superseded_at` on non-`thank_you` pending rows for won/lost deals (belt-and-suspenders; transition trigger is primary). Added §7.5 escalate-in-place pass: pending non-superseded non-`thank_you` rows get `priority_score *= 1.15` capped at `priority_ceiling`, escalation_count +1, safety-capped at 100 runs.
- `src/app/api/cron/dwell-sla/route.ts` — **new** hourly cron, wraps `dispatchDwellSla`
- `src/app/api/stripe-webhooks/client-billing/route.ts` — after `advance_deal_stage_from_webhook` succeeds, calls `dispatchPendingTransitions` synchronously so deposit → handoff-wizard has no 60s cron wait
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts` — `dismissFollowUp` now accepts enum reason + free text; act/snooze/dismiss all reset `escalation_count` (and `last_escalated_at` on snooze/dismiss)

### Query-surface changes

- `src/app/(dashboard)/(features)/crm/actions/get-crm-gigs.ts` — swapped `deals` query to `ops.active_deals` view
- `src/widgets/gone-quiet/api/get-gone-quiet.ts`, `src/widgets/dashboard/api/get-action-queue.ts`, `src/widgets/owed-today/api/get-owed-today.ts` — added `superseded_at IS NULL` filter
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts` `getFollowUpQueue/getFollowUpForDeal` — added `superseded_at IS NULL`

### Test additions

- `src/shared/lib/triggers/__tests__/schema.test.ts` — 13 tests (schema shape, size caps, enum completeness)
- `src/shared/lib/triggers/__tests__/enroll-follow-up.test.ts` — 6 tests (fresh insert, dedup 23505 no-op, channel fallback, entity memory preference, config validation, preview)
- Updated registry.test.ts count expectations (5→6 primitives) and dispatch.test.ts fixtures (added `stage_tags` to ClaimedTransitionRow)

All 39 trigger tests passing. 3 pre-existing failures on main (LibraryDrawer x2, metrics library manifest x1) — confirmed NOT caused by this work via `git stash` check.

### Types + build

- `src/types/supabase.ts` regenerated via `npm run db:types` post-migration. All new columns, views, RPCs present. Build green.

---

## 2. What's live on the DB right now

**Production workspace being tested against:** `96feecb1-ad20-4ad0-bb93-eb3c440efd05` ("Invisible Touch Events", created 2026-02-14).

**Data state as of handoff:**

- Pipeline triggers: seeded on both `sales` pipelines (see issue #1 below about duplicate pipelines)
- Active deals include "Alex and Christine's Wedding" (`1a5a3126-4cc3-40de-86e8-40c7760e6d2b`) and "Ally & Emily Wedding" (`238cabce-78c4-4be4-999c-47436f37437c`) — both inquiry stage, both have demo insights + enrolled follow-ups

**Demo data seeded manually for the UI verification loop (not from real evaluator heuristics — both deals are in Inquiry without proposals, so the heuristics returned nothing):**

- `cortex.aion_insights` row for Ally & Emily (id `d225abff-8b00-4461-b81a-91ddd629dfc8`), trigger_type=`stage_advance_suggestion`, suggested_stage_tag=`proposal_sent`
- `cortex.aion_insights` row for Alex & Christine (id `9701152a-188b-41ad-8ab4-9bbc52885545`), same shape
- `ops.follow_up_queue` row for Ally & Emily (id `4826114a-d4e7-4c86-9f83-4ec884a79a79`), reason_type=`nudge_client`, originating_transition_id=`afb9812f-8ceb-4617-94d7-7dc9e950ae89`
- Transition `afb9812f-8ceb-4617-94d7-7dc9e950ae89` (Ally & Emily into Inquiry) marked `triggers_dispatched_at = now()` to prevent re-fire

**If you need a clean demo for research, drop these and re-run the real evaluator.** They exist only so the UI was visibly working at handoff.

**Dev server state:**
- Running on port 3000 from this worktree
- `.env.local` symlinked from `/Users/danielarthur/Documents/unusonic/.env.local`
- `CRON_SECRET=dev-local-cron-secret` added to `.env.local` (so cron endpoints can be hit locally if needed)
- Diagnostic `console.log` statements used during end-to-end UI verification have been removed. The committed `getStageSuggestionForDeal` in `src/app/(dashboard)/(features)/crm/actions/aion-suggestion-actions.ts` is production-clean.

---

## 3. Locked decisions from this chat

These are closed. Don't reopen in research — build on top.

- **Aion writes to the follow-up queue only. Never auto-sends client-facing messages.** All sends are owner-clicked drafts.
- **Deterministic webhooks auto-advance stages** (deposit_received from Stripe). That's a rule, not AI.
- **Aion SUGGESTS stage moves.** Owner approves with one click. This is the AionSuggestionRow flow.
- **Feature flag `pipelines.triggers_enabled` ON by default globally.** Seeded defaults only on workspace-seeded Sales pipeline. Custom pipelines start empty (admin gets "Copy triggers from Sales" button in P2).
- **Past deals go to `/crm/archive`** (not mixed into Today). "Past" = driven by deal temporal state (won with all-past events, lost, archived).
- **Re-queue debounce = escalate-in-place.** `priority_score ×= 1.15` daily, capped at `priority_ceiling`. Dismiss/snooze resets.
- **Stage versioning via snapshot.** Live stage edits don't retroactively rewrite in-flight transitions. `ops.deal_transitions.triggers_snapshot` is the source of truth; live is the fallback.
- **`hide_from_portal` default = true.** Portal-facing follow-ups require explicit opt-in.
- **Channel precedence:** entity aion_memory (scope=episodic, fact prefix `channel:`) most-recent → trigger config → email fallback. Never prompts the owner.
- **Dismissal reasons enum:** `tire_kicker`, `wrong_timing`, `manual_nudge_sent`, `not_ready`, `other`. "other" opens free text.
- **Archive default scope:** residual-only (past deals with pending follow-ups). "Show all past deals" toggle is P1.
- **Idempotency carried by DB-level unique indexes**, not app-level checks. The `(originating_transition_id, primitive_key)` index is unconditional (no WHERE status filter) because a dismiss → re-dispatch sequence would otherwise double-insert.

---

## 4. Critic findings the next chat should know

Stress-test findings from this session that DID ship (so don't re-fix):

- **C1 — view RLS bypass:** `ops.active_deals` and `ops.portal_follow_up_queue` both created with `WITH (security_invoker = true, security_barrier = true)`. Default Postgres view behavior runs as creator (superuser during migration) and would leak cross-workspace rows — NOT an option here.
- **C2 — primitive idempotency:** enforced via DB-level unique index. `enroll_in_follow_up` primitive catches Postgres `23505` errors as success no-ops. Dispatcher docs explicitly require primitives to be idempotent.
- **C3 — rapid-advance supersession:** `record_deal_transition` stamps `superseded_at` on prior-stage pending rows when a deal moves. Cron also has belt-and-suspenders logic for won/lost.
- **C4 — no parallel claim paths:** all stage-transition dispatch goes through existing `ops.claim_pending_transitions`. `dwell_sla` is a separate cron with its own RPC, but dedup is still via the same unique index.

Findings that DIDN'T ship (still open, low priority):

- **H5 — DB-level portal role:** my ESLint+helper approach for portal isolation is two of three lines of defense. A dedicated portal DB role that can only SELECT from `ops.portal_follow_up_queue` (never raw table) would be the third. Worth tracking but no active portal reader exists yet.
- **M1 — archive 90-day window:** archive currently shows "past deals with pending follow-ups." If owner dismisses all their follow-ups on a won deal, it vanishes from archive. Consider adding `archived_at > now() - 90 days` as an additional predicate so recent wins stay visible.
- **M2 — `p_actor_kind` for Aion accepts:** `record_deal_transition` currently infers `actor_kind='system'` when auth.uid() is null. Aion-initiated advances run under service-role and can't be distinguished from Stripe webhooks in activity logs. Add an explicit p_actor_kind RPC wrapper.
- **M4 — already handled:** dismissal_reason is text+CHECK, not native enum. Good call.

---

## 5. Fork C brief — Unified Aion deal card

### What it is

Merge the two Aion-voice primitives on the deal detail page into one unified card:

- **Current state:** Two cards. `AionSuggestionRow` (★ Advance to Proposal) under the Pipeline Tracker. Follow-up card ("Stalling — 21 days in Inquiry") under Activity. Separate UIs. Different verbs. Same voice.
- **Target state:** One card per deal that houses both the nudge-the-client workflow AND the advance-the-deal workflow. Distinct sub-actions, shared visual treatment, shared dismissal reasoning.

### Why

- Both primitives are Aion speaking. Two separate cards feel like two voices.
- Premium pre-launch UX expects cohesion. Daniel's memory: **"premium outcome over speed"** — Fork C (deep integration) beats Forks A (data link) and B (visual unify) on cohesion.
- Common real-world case: *"the proposal has been sent, the owner forgot to move the stage, and the client hasn't replied"* — one card that offers BOTH "advance to Proposal" AND "draft a nudge" is the correct surface for that state.

### The 10 open questions (research must resolve these)

1. **Visual hierarchy when insight + follow-up both exist.** One headline? Nested sections? What gets primary visual weight — the nudge or the stage advance?
2. **Clean-deal insight-only state.** If a deal has a stage-advance insight but no follow-up (no stall signal), what does the card look like? Just the advance button without the whole "Stalling" context?
3. **Dismissal semantics — shared vs separate.** Dismiss "advance stage" ≠ dismiss "nudge client". Two reason pickers? Shared? If shared, how does the owner distinguish *which* Aion suggestion they're rejecting?
4. **Acceptance semantics — does advance auto-draft the nudge?** If owner clicks "Advance to Proposal", do we also pre-populate the Draft-a-message flow? Or is advance silent?
5. **Stream-card AionSuggestionRow fate.** Currently appears at the bottom of the selected stream-card on `/crm`. If follow-up card becomes THE surface, does the stream-card version stay (compact summary) or go away (one surface only)?
6. **Today widget.** Does the stage-advance insight surface alongside nudges in Today, or stays deal-detail-scoped? If it surfaces in Today, what's the action — click-through to the deal, or inline accept?
7. **Data model linkage.** Three options: (a) `ops.follow_up_queue.linked_insight_id` FK; (b) embed insight snapshot into `follow_up_queue.context_snapshot` jsonb; (c) keep them separate and join at read-time. (a) forces a schema migration. (b) duplicates data. (c) is the lightest-weight.
8. **Conflicting Aion advice.** What if the `stage_advance_suggestion` evaluator says "advance to Proposal" but the `stall_signal` evaluator says "you're stalling in Inquiry, nudge the client"? These are contradictory on the same deal. Does one suppress the other? Do both show?
9. **Portal exposure.** Stage-advance insights should never leak client-facing. `hide_from_portal` on follow-ups is already enforced; insights have no equivalent. Is this a real risk (insights aren't read in portal code today) or a future landmine?
10. **Evaluator interaction.** Should `stage_advance_suggestion` suppress `stall_signal` or vice versa? Or should both fire and the UI dedupe? This is a data-layer decision that depends on (8).

### Research pipeline

Before writing code, run these in parallel:

- **User Advocate** — How does a production company owner think about "nudge the client" vs "advance the deal internally"? Are they conflated in their mental model, or distinct? What language do they use? Does the unified card make their life easier or push them toward premature stage moves?
- **Signal Navigator** — Where else in Unusonic does this surface? Does the daily brief reference these insights? Does the crystallize-deal flow care about follow-up state? Are there downstream consumers of `follow_up_queue.status = 'acted'` that would be affected by the unified card's workflow?
- **Field Expert** — What do other CRM / sales-ops tools do? HubSpot, Pipedrive, Linear — do any have a single "AI copilot" card per deal? Is there a convention for separating outbound actions (send an email) from pipeline actions (advance stage) in one surface?
- **Critic** — Given the 10 questions above, rank them by risk. Which answers must be locked before UI design starts? Which are tactical and can be decided at implementation?

After research lands, write **`docs/reference/aion-deal-card-unified-design.md`** with the full spec. Then a second Critic pass on the design. Then build.

### Build phases (tentative, subject to research)

**Phase 1 — Data layer**
- Decide linkage model (question 7)
- Migration: add `follow_up_queue.linked_insight_id` OR JSONB embedding
- Update `enroll_in_follow_up` primitive if insights should link at enrollment time
- Update `stage_advance_suggestion` evaluator if it should check for existing follow-ups and merge rather than generate separately

**Phase 2 — UI refactor**
- Replace `aion-suggestion-row.tsx` with a unified `aion-deal-card.tsx` (or similar)
- Refactor `follow-up-card.tsx` to be a sub-component of the unified card
- New Stage Engineering design tokens if needed (see `docs/reference/design/`)
- Stream-card variant (question 5)

**Phase 3 — Behavior**
- Dismissal flow (question 3)
- Acceptance flow (question 4)
- Conflict resolution (question 8)
- Today widget integration (question 6)

**Phase 4 — Validation**
- Unit tests for the linkage + composition
- E2E on the full deal page with both primitives present

---

## 6. Known open issues unrelated to Fork C (do not chase)

- **Duplicate "Invisible Touch Events" workspace.** `c440e76a-67a3-4585-ae93-86e7182f0649` is empty (0 deals, 0 events, 0 members). Should be dropped. The active one is `96feecb1-ad20-4ad0-bb93-eb3c440efd05`.
- **Duplicate sales pipelines on active workspace.** Two rows in `ops.pipelines` with slug=`sales`, is_default=true, same workspace_id, same created_at timestamp. Both have seeded triggers (identical payloads). Root cause is pre-existing — likely a race in `seed_default_pipeline`. Needs a data-hygiene migration to pick a winner, re-parent deals, drop the orphan.
- **`stream-filter-chips.tsx` SSR error.** `document is not defined` in a `createPortal` call during SSR. Pre-existing, unrelated to follow-up engine. Throws warnings in dev log but doesn't break page render.
- **3 pre-existing test failures on main.** LibraryDrawer x2 (rendering library assertion), metrics library manifest x1 (widget folder without registry entry). Confirmed unrelated via `git stash` check.
- **Cortex schema PostgREST exposure.** Authenticated client's `.schema('cortex').from('aion_insights')` silently returns empty rows. `getStageSuggestionForDeal` works around this via `getSystemClient` + explicit workspace_members membership check. If someone exposes cortex properly in Supabase Dashboard, my workaround can be simplified.
- **ops schema typed cast lag.** Some code uses `(supabase as any).schema('ops')` patterns — pre-existing (PR 6.5 pending). Not something to "fix" in Fork C; it's infrastructural.

---

## 7. What NOT to touch in Fork C

- **Legacy tables** — `public.deals`, `public.proposals`, `public.proposal_items`, `public.packages`, `public.contracts`, `public.run_of_show_cues`. Grandfathered. Read/write in place but don't add columns or sibling tables.
- **Three prior build chats' work** — client-as-node CRM redesign (`create_deal_complete` v3 with p_hosts/p_poc/CO_HOST), multi-date/series deals (`is_series`, series_rule, event-scoped deal_crew), status-enum collapse (migration 20260417160000). Already merged.
- **The Feature-Sliced Design layering** — App → Widgets → Features → Entities → Shared. No upward imports.
- **Supabase RLS patterns** — public uses direct subquery, directory/ops/finance use `get_my_workspace_ids()`, cortex.relationships is SELECT-only (writes via SECURITY DEFINER RPC).
- **Brand voice** — Aion, not ION. Unusonic, not Signal. Sentence case. No exclamation marks. "Show" not "event". "Crew" not "resources". "Advance" not "promote/move".

---

## 8. Starting the chat

### Preferred — continue on current branch

```bash
# From repo root
git fetch origin main
git rebase origin/main   # pick up anything new since this session
npm run dev              # if not already running
```

Open a new Claude chat with this prompt:

> **Plan and build Fork C — unified Aion deal card.**
>
> Start by reading `planning/aion-deal-card-unified-primer.md` in full — it's the handoff from the P0 follow-up-engine session. It covers what shipped, the decisions already locked, the 10 open UX/data questions, and the research pipeline.
>
> Before writing any code: run Critic + User Advocate + Field Expert + Signal Navigator in parallel on Fork C. Absorb findings. Write `docs/reference/aion-deal-card-unified-design.md`. Run Critic again on the design. Then build.
>
> Present scope choices as a fork; I'll pick the fuller scope. Do not pre-cut.

### Alternative — clean worktree

If you want to isolate Fork C from the P0 follow-up engine branch:

```bash
git worktree add -b fork-c-aion-deal-card ../../aion-deal-card origin/main
cd ../../aion-deal-card
```

Copy or re-reference this primer (`planning/aion-deal-card-unified-primer.md` lives on `main` once the P0 branch merges).

---

## 9. Open questions for Daniel before the new chat starts (optional, can be answered during Fork C research)

These weren't closed in this chat but the Fork C planner will need directional answers:

- **Is "advance to Proposal" a primary CTA or secondary?** If primary, it competes with "Draft a message" for the main action slot. If secondary, the nudge stays primary and advance is a smaller button.
- **How rare is the "clean-deal insight-only" state in production?** If most deals with an insight also have a stall signal, the clean state is an edge case and can get simpler UI.
- **Does the Today widget show stage-advance insights today?** (In the follow-up engine P0, it does — they flow through `aion_insights` → brief. Unclear if that's desired long-term.)
- **Should accepting "advance stage" auto-mark the follow-up as `acted`?** Semantically: if owner advances past the stall point, the nudge is arguably obsolete. But maybe the owner still wants to nudge AFTER advancing. Research question.

---

**Handoff complete.** If the new chat hits something not covered here, the answer is almost certainly in `CLAUDE.md`, `planning-primer.md`, `docs/reference/design/`, or the three P0 migrations themselves.
