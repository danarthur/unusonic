# Sales Brief v2 — The Capture Loop

> The first time software actually catches Jim-from-the-BBQ.

This doc describes the v2 of the Aion Daily Brief for the Sales preset, and the companion lobby-wide **Capture primitive** that closes its data-gap. It extends `docs/reference/aion-daily-brief-design.md`. When this doc disagrees with the v1 doc on sales-specific behavior, this doc wins.

---

## 1. Why v2

V1 shipped a dashboard card with an AI paragraph plus 4 evaluators, preview-then-confirm Sheet, and a right-side action flow. It's correct for what it is. But the research panel (User Advocate, Field Expert, Signal Navigator, Critic) converged on three findings that v1 doesn't address:

1. **Capture gap.** ~25–40% of a relationship-driven SMB seller's real sales signal is AI-readable today. Phone calls, BBQ conversations, texts, side notes — none of it enters the system. No amount of evaluator sophistication closes that gap. The brief must be paired with a frictionless capture primitive.
2. **The brief isn't another queue.** V1 re-surfaces items that sibling sales widgets (`owed-today`, `gone-quiet`, `awaiting-signature`) already list. The brief's right-to-exist is **cross-card synthesis** — collapsing compound stories ("deposit late AND proposal cold") and showing items those cards can't show (cross-deal client aggregation, date-hold pressure, forward-looking prep).
3. **Preview-then-confirm is over-engineered for drafts.** Inline-editable drafts in the row (HoneyBook/Granola pattern) beat two-step preview-confirm for client-facing outbound. Two-step stays for reversible-but-costly actions only.

V2 is the answer to all three.

---

## 2. Mental model

The v2 Sales brief is **the editor's note above the dashboard**, paired with **the lobby capture primitive**.

Editor's note means: Aion read the overnight signal, collapsed compound stories, pinned the 3–5 things that need the user's attention today, and pre-staged the action for each. The user scans, edits what's off, one-taps what's right, and captures what Aion couldn't see.

Capture means: a persistent lobby affordance (voice-first, type-fallback). The user says "Met Jim at the country club BBQ, he's GM, booking next summer." Aion parses, resolves or creates a ghost entity, seeds a follow-up, and surfaces it in tomorrow's brief.

The brief and the capture are two sides of the same loop: capture is input, brief is triage.

---

## 3. Scope (what's in v2)

### 3.1 Changes to the brief card

- **Five sales evaluators** (replaces the 2 sales-relevant ones in v1).
- **Compound-story synthesis** — a single insight row can reference multiple underlying triggers.
- **Inline-editable drafts** in the insight row for email/SMS follow-ups. Sheet remains for reversible-but-costly actions only.
- **Pin-to-top** per insight — user preserves their own ranking judgment.
- **Hover-rationale** — the "why" behind the rank is auditable on hover.
- **Forward-looking empty state** — degrades from Act → Prepare → Watch. Never blank.
- **Kill-switch-with-graceful-degradation** — turning off the brief still populates `owed-today` and `gone-quiet` because the evaluators keep running.
- **Continue-in-chat affordance** — Sheet → Brain tab with seeded prompt.
- **Deal-Lens deep-link** replaces Sheet for per-deal drafting (keeps draft composition in one place).

### 3.2 New: lobby capture primitive

- **Capture button** on the lobby, persistent, always reachable.
- **Voice-first, type-fallback.** Audio is transcribed and parsed by Aion.
- **Structured output** — Aion returns resolved entity, suggested follow-up, note text.
- **Review step** — the parsed result is presented for one-tap confirm or edit before it writes.
- **Ghost Protocol compliant** — unknown entities become ghosts per existing platform rules.
- **Capture → brief loop** — capture writes produce follow-up queue items and may fire brief evaluators on the next cron.

### 3.3 Explicitly out of scope for v2

- Multi-snooze ceiling with forced modal. Replaced with soft "park" tray (see §11).
- Finance and production evaluators (remain v1 set until this lands).
- Seasonal-peak-prep, hot-lead multi-view, deal-stuck-in-stage evaluators (deferred to v3 — measure act-rate on v2 set first).
- Auto-send to repeat clients or deals above a value threshold (see §8).
- Full sentiment mining of reply text (design debt tracked separately).

---

## 4. The five sales evaluators

All run in the daily cron, share the batch-fetched deal dataset, write via `cortex.upsert_aion_insight()`. Reason strings are pre-formatted — never numeric scores. Each evaluator includes a **compound detection check** (§5.1).

| Trigger Type | Condition | Reason String | Suggested Action |
|--------------|-----------|---------------|------------------|
| `proposal_viewed_unsigned` | `proposals.view_count >= 1` and `status != 'signed'`, age ≥ 3d | `"Proposal viewed {viewCount}x · unsigned {days}d · ${value}"` | Inline draft reply |
| `deposit_gap` | `finance.invoices.deposit_due_date < now()` and no matching `finance.payments` row | `"Deposit {days}d past due · ${amount} — {clientName}"` | Inline draft reminder |
| `quote_expiring` | `proposals.expires_at ≤ now() + 3d` and `status='sent'` | `"Quote expires {days}d · {clientName} · ${value}"` | Inline draft nudge |
| `gone_quiet_with_value` | No activity ≥ 14d AND deal value ≥ workspace.median_deal_value | `"Gone quiet {days}d · ${value} — {clientName}"` | Call reminder (no draft) |
| `hot_lead_multi_view` | `proposals.view_count ≥ 3` in ≤ 48h, no reply | `"Viewed {viewCount}x in {hours}h · {clientName} · ${value}"` | Inline draft reply |

**Deposit data source.** Per CLAUDE.md, `public.invoices` is removed. Deposit truth lives in `finance.invoices` + `finance.payments`. The evaluator joins `proposals.accepted_at` → `finance.invoices.proposal_id` → `finance.payments` to compute "paid or not."

**Quote expiry.** Adds column `proposals.expires_at timestamptz`. Default = `accepted_at + 30d` for existing rows, workspace-configurable going forward. Migration: `20260416_proposal_expiry.sql`.

**Gone-quiet threshold.** Uses `workspace.median_deal_value` (new computed column OR runtime RPC). Prevents "$2k DJ gig ranked above $90k corporate ask" — Critic's rank-collision scenario.

**Compound detection.** See §5.1 — a proposal that is both unsigned AND has a late deposit does not surface as two insights. It surfaces as one compound insight with two stripes.

---

## 5. Cross-card synthesis

### 5.1 Compound story collapsing

Before writing insights, the evaluator pipeline runs a **collapse pass**: insights grouped by `(workspace_id, deal_id)` collapse into a single insight when 2+ evaluators fire on the same deal. The collapsed insight uses:

- The **highest-urgency stripe** from its components
- A **reason string that lists both**: `"Deposit 4d late AND proposal unopened 6 days · $45k Stern"`
- A **context array** preserving the component trigger types for audit / chat escalation

### 5.2 Cross-deal client aggregation

A second pass runs after collapse: insights grouped by `(workspace_id, client_entity_id)` where count ≥ 3 surface as a single insight: `"3 active deals with Brandi Jane Events need a coordinated reply"`. Suggested action is a deep-link to a pre-filtered CRM lens.

### 5.3 Date-hold pressure

When two or more open deals share the same event date (`proposed_date`), neither has won yet, and at least one has been viewed in the last 48h, surface: `"Two deals want June 12 · Rotary ($18k) and Meyer Wedding ($32k) — who gets the hold?"`. Action: Aion drafts a hold-confirmation message to both contacts framed as your choice.

Date-hold pressure is already computed by the follow-up-queue cron (per Signal Navigator) — wire into the brief evaluator pipeline.

### 5.4 What the brief does NOT re-surface

Raw `deal_stale` with no compound component and no above-median value → goes to `gone-quiet` widget only, never the brief. Raw `proposal_viewed_unsigned` below 3 days → goes to `awaiting-signature` only. The brief is the **summit**, not the shore.

---

## 6. Insight ranking and auditability

### 6.1 Under-the-hood score

A hidden numeric score orders the 3–5 visible insights:
```
score = base_urgency(trigger) 
      + value_weight(deal_value / workspace.median_deal_value)
      + decay(age_of_signal)
      + compound_bonus(component_count)
      + user_pin_override
```

The score is never shown. Reason strings and stripes are.

### 6.2 Pin-to-top

Right-click / long-press on an insight → "Pin for today." Pinned insights render first regardless of score, with a small pin icon. Resets at midnight workspace-local.

This is load-bearing: the first time the user's gut-#1 ranks #4, they lose trust in the whole card. Pin-to-top gives the user the last word. Per Critic: "He brings the judgment, Aion brings the coverage."

### 6.3 Hover-rationale

Hovering an insight (focus on keyboard) shows a two-line tooltip:
- **What scored it:** "viewed 3x in 48h · $45k · 6-month client relationship"
- **What knocked it down:** "ranked below Stern because Stern's deposit is 4d overdue and the payment lane is tighter right now"

Makes the ranking auditable. Prevents black-box distrust.

---

## 7. The action row (inline draft)

### 7.1 Row anatomy

```
┌─ urgency stripe
│ "Proposal viewed 3x in 48h · Goldman · $45k"
│ 
│ [draft email preview, 3 lines, click to expand → editable]
│ Hi Rick, I saw you looked at the updated quote a few times...
│
│ [send] [edit] [call instead] [park] [×]
└─
```

- **Draft visible in the row**, not behind a button. Editable in place with a textarea expansion.
- **[send]** — one-tap Resend + `logFollowUpAction` + `cortex.resolve_aion_insight`. Two-step confirm ONLY fires if the send falls into a danger zone (§8).
- **[edit]** — keyboard edit mode, or deep-link to Deal Lens follow-up card for full composition.
- **[call instead]** — logs a reminder for phone, dismisses the draft, does not pre-compose a call script.
- **[park]** — soft snooze, see §11.
- **[×]** — dismiss with optional reason (keyboard: `x`, then `r` for reply-received, `d` for dead, etc.).

### 7.2 When there's no draft (call reminder only)

For `gone_quiet_with_value` and any insight in the Sev-4 danger zone (§8), the row shows a **call reminder** instead of a draft:

```
"Gone quiet 17d · $62k — Henderson Wedding"
[log call] [draft anyway] [park] [×]
```

- **[log call]** — opens a quick-log capture (see §10). Not a message draft.
- **[draft anyway]** — only offered for user override; never default.

### 7.3 Sheet usage (narrower than v1)

The ActionFlowSheet is still present but opens only for:

- Batch crew confirmation (`crew_unconfirmed` — unchanged from v1)
- Date-hold pressure coordinated outreach (two drafts, side-by-side, approve-each)
- Cross-deal client aggregation composition
- Invoice send, mark-won, mark-lost (reversible but costly)

Per-deal drafting **deep-links to Deal Lens's follow-up card** instead of opening the Sheet. Keeps composition in one canonical place.

---

## 8. Draft danger zones (no autonomous draft)

For any of the following, show a **call reminder**, not a draft:

1. **Repeat clients** — `deal.client_entity_id` has ≥ 2 prior won deals. Relationship tone is learned, don't average it into LinkedIn-SaaS-speak.
2. **High-value threshold** — `deal.value ≥ workspace.auto_draft_ceiling` (default 2× median, workspace-configurable).
3. **Last-touch was phone** — most recent `follow_up_log.channel = 'call'`. They're on a voice cadence, don't break it.
4. **Condolences / personal context** — any `cortex.memory` entry tagged `personal_sensitive` on the entity in the last 180d.
5. **First-touch-after-referral** — deal has `context_data.referral_source_entity_id`. The referrer's voice should lead.

User can override by clicking **[draft anyway]**. Override is logged to `follow_up_log.draft_original_overridden=true` to inform voice learning.

---

## 9. Copy — the vocabulary contract

### 9.1 Approved words (use verbatim)

- **owed** ("Stern owes deposit")
- **follow-up** (never "touchpoint")
- **client** (never "account")
- **show** (never "event" in UI copy; `ops.events` is a DB term, fine)
- **proposal** (never "quote" in the UI — "quote" is only for internal threshold labels)
- **deposit**
- **contract**
- **gone quiet** (verbatim; never "stalled," "inactive," "dormant" in UI)
- **nail down** / **lock it in** / **pencil them in**
- **set aside** (for parking a deal that isn't dead but isn't moving — never "mark dead")
- **got a feeling about it**

### 9.2 Forbidden words (UI)

lead, prospect, account, touchpoint, pipeline, pipeline velocity, nurture, re-engage, cadence, MQL, SQL, conversion, funnel, opportunity (as noun), CRM, close rate, pipeline health, sales motion, deal rotting, at-risk, stale (as UI text — fine as internal `trigger_type` slug)

### 9.3 Reason-string template

`"{past-tense verb or state} · {age} · {$value} — {clientName}"`

Examples:
- `"Proposal unopened 6d · $45k Goldman"`
- `"Gone quiet 17d · $62k — Henderson Wedding"`
- `"Viewed 3x in 48h · Goldman · $45k"`
- `"Deposit 4d late · $12k — Stern Corporate"`

Clean, scannable, no math.

---

## 10. The lobby capture primitive

### 10.1 Surface

A persistent button anchored to the lobby layout (position: bottom-right floating, respects mobile safe area). Keyboard shortcut `shift + c` when the lobby is focused.

Never inside the brief card. Capture is workspace-wide, not brief-scoped.

### 10.2 Flow

```
[capture button]
  → [record audio (Web Audio API, 60s max)]
  → [stop + transcribe (existing Aion Voice infra)]
  → [parse via Aion with capture-context prompt]
  → [review card]
    - Entity: "Jim Henderson (Country Club Catering) — new contact?"
      [yes, create] [different person] [edit]
    - Note: "Summer 2026 event, GM, booking authority"
      [save to entity]
    - Follow-up: "Reach out next week about summer event"
      [schedule for Mon] [edit] [don't schedule]
  → [confirm] → writes
```

- Audio stored to Supabase Storage under `captures/{workspace_id}/{capture_id}.webm`
- Transcript + parsed structure stored in `cortex.capture_events`
- If entity resolved, attaches note to `cortex.memory` against that entity
- If follow-up scheduled, writes `ops.follow_up_queue` row with `reason_type='captured_intent'`
- Capture produces a `cortex.aion_insights` row (NOT on the brief, but in the capture's own review queue) if the transcript implies urgency

### 10.3 Schema

```sql
CREATE TABLE cortex.capture_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  audio_storage_path text,
  transcript text,
  parsed_entity jsonb,         -- {type: 'person'|'company', name, confidence, resolved_entity_id?}
  parsed_follow_up jsonb,      -- {text, suggested_channel, suggested_when}
  parsed_note text,
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending','confirmed','dismissed','failed')),
  resolved_entity_id uuid REFERENCES directory.entities(id),
  created_follow_up_queue_id uuid REFERENCES ops.follow_up_queue(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  dismissed_at timestamptz
);
```

RLS: SELECT where `workspace_id IN (SELECT get_my_workspace_ids())`. Writes via `cortex.confirm_capture()` and `cortex.dismiss_capture()` SECURITY DEFINER RPCs per cortex-write-protection rule.

### 10.4 Parse prompt contract

Aion receives: `{ transcript, workspace_entities_index, recent_deals_index }`. Returns:

```typescript
{
  entity: { 
    type: 'person' | 'company' | 'ambiguous',
    name: string,
    match_candidates: Array<{ entity_id, name, confidence }>,
    new_entity_proposal?: { name, attributes }
  },
  follow_up: {
    text: string,
    suggested_channel: 'call' | 'email' | 'sms' | 'unspecified',
    suggested_when: ISO8601 | null
  } | null,
  note: string | null,
  confidence: number  // 0-1, drives whether we ask for review or pre-fill
}
```

### 10.5 Review card UX

If `confidence ≥ 0.85` and entity is resolved: show a single "Save" / "Edit" / "Not this person" row. One tap confirms.

If `confidence < 0.85` or entity is ambiguous: show field-by-field review (entity picker, editable note, editable follow-up). Never auto-save when confidence is low.

### 10.6 Degradation

- No mic permission → type input falls back transparently
- Transcription fails → show raw audio preview + "type it instead"
- Aion parse fails → save to `cortex.capture_events.status='failed'` with the transcript, keep in review queue

---

## 11. Snooze / park model

V1 and the sales-dashboard-redesign memory both proposed "after 2 snoozes force log-outcome." Research panel converged: this is a friction dam.

**V2 behavior:**

- **[park]** button on every insight. Unlimited parks.
- Parked insights **dim** and move to a collapsible "Parked (4)" tray below the main list.
- Each park has a `parked_until` (default: 3 days) and a `park_count` on the underlying insight.
- When `park_count ≥ 3`, the insight gets a small "needs-decision" dot. No modal, no forced input.
- When `age_since_first_surfaced > 30d` with no resolution, the insight auto-closes with `status='expired'` and an email summary goes to the user: "5 insights expired this month without action. Want to see what Aion can learn from that?"

The auto-close summary IS the snooze-ceiling enforcement — after the fact, not in the moment. Aion learns the user's implicit no-action patterns.

---

## 12. Kill switch and graceful degradation

Today's behavior (v1): `workspaces.aion_config.kill_switch=true` disables all Aion autonomous actions. The brief card shows empty.

**V2 behavior:**

- Kill switch disables **drafting and dispatch**, not evaluators.
- Evaluators keep writing `cortex.aion_insights`. The brief card renders them as **read-only reason strings** with only [call reminder] / [park] / [×] actions.
- `owed-today` and `gone-quiet` widgets continue to function fully (they don't depend on Aion drafts).
- The kill-switch toast on first-disable explains: "Aion will stop drafting and sending. The brief keeps surfacing what needs attention — you just take every action manually."

Sales preset stays useful when Aion is off. This is non-negotiable.

---

## 13. Cold start

Day 1 with zero history:

- Brief paragraph: "Welcome. Once you've logged a handful of clients, I'll start surfacing what needs your attention. For now — let's set up."
- Insight rows are **onboarding tasks** styled identically to real insights:
  - "Import your contact list" → [upload]
  - "Connect your email" → [connect]
  - "Log your first deal" → [create]
  - "Try the capture button" → [tutorial]
- As onboarding tasks complete, they're replaced by real evaluator output.
- Day 7+ runs real evaluators on whatever exists.
- Day 30+ is steady-state.

Never show the generic v1 "Nothing urgent right now" during cold start. That message is reserved for established workspaces with a temporarily quiet inbox.

---

## 14. Continue-in-chat

Any insight row has a keyboard shortcut `shift + ?` (or menu item) to escalate into the Brain tab with a seeded prompt:

- **Seed:** "Tell me why you ranked {reason_string} today" or "Help me think about {insight.title}"
- **Mechanism:** write `{ sessionId, seedPrompt, insightId }` to `localStorage['unusonic.chat_seed']`. Navigate to `/aion`. ChatInterface mounts, detects seed, pre-fills the composer (does not auto-send — the user reviews and sends).
- **State return:** when the chat resolves the underlying action (sends an email, dismisses the insight), the insight is resolved normally. No return navigation required.

---

## 15. Data flow — end to end

```
                      ┌─────────────────────────┐
  Capture primitive ──►   cortex.capture_events │
  (lobby button)      │        │                │
                      │        ▼                │
                      │   ops.follow_up_queue   │◄──┐
                      │   cortex.memory         │   │ 
                      └────────┬────────────────┘   │
                               │                    │
                               ▼                    │
                      ┌─────────────────────────┐   │
                      │   Daily cron            │   │
                      │   ├── follow-up queue   │   │
                      │   ├── insight evaluators│   │
                      │   │     (5 sales + 2    │   │
                      │   │      generic)       │   │
                      │   ├── compound collapse │   │
                      │   ├── cross-deal agg.   │   │
                      │   └── date-hold press.  │   │
                      └────────┬────────────────┘   │
                               │                    │
                               ▼                    │
                      ┌─────────────────────────┐   │
                      │  cortex.aion_insights   │   │
                      │  ops.daily_briefings    │   │
                      └────────┬────────────────┘   │
                               │                    │
                               ▼                    │
                      ┌─────────────────────────┐   │
  User loads lobby ──►│  TodaysBriefWidget      │   │
                      │  ├── brief paragraph    │   │
                      │  ├── pinned insights    │   │
                      │  ├── ranked insights    │   │
                      │  └── parked tray        │   │
                      └────────┬────────────────┘   │
                               │                    │
          ┌────────────────────┼────────────────────┤
          ▼                    ▼                    │
     [send inline]      [deal-lens link]     [continue chat]
     [call reminder]    [Sheet: reversible]  [/aion seed]
          │                    │                    │
          └────┬───────────────┘                    │
               ▼                                    │
      logFollowUpAction()                           │
      recordAionAction()                            │
      cortex.resolve_aion_insight() ────────────────┘
```

---

## 16. Phased build plan

**Phase 1 — Capture primitive (independent of brief).** 5–7 days.
- `cortex.capture_events` table + RLS + RPCs
- Audio recording UI + Supabase Storage upload
- Transcription wire (reuse Aion Voice infra)
- Parse prompt + structured output + review card
- Write paths: entity creation, follow-up queue seed, note attach
- Ship behind a feature flag; dogfood internally

**Phase 2 — Evaluator upgrade.** 3–5 days.
- Add `proposals.expires_at` column + default backfill
- Rewire `deposit_gap` evaluator to read from `finance.payments`
- Add `quote_expiring`, `gone_quiet_with_value`, `hot_lead_multi_view` evaluators
- Remove sales-unrelated evaluators from the sales preset weighting
- Workspace median-deal-value computation (runtime RPC)

**Phase 3 — Cross-card synthesis.** 3–4 days.
- Compound-story collapse pass (post-evaluator)
- Cross-deal client aggregation
- Date-hold pressure wiring
- Insight schema: `component_triggers jsonb` for audit

**Phase 4 — UI changes.** 4–5 days.
- Inline-editable drafts in `InsightRow`
- Pin-to-top + hover-rationale
- Deal-Lens deep-link wiring (replace Sheet for per-deal drafting)
- Continue-in-chat seed + route handling
- Kill-switch graceful degradation
- Copy pass through §9 vocabulary contract

**Phase 5 — Cold start + park + auto-close.** 2–3 days.
- Onboarding-tasks-as-insights path
- Park tray + `park_count` + auto-close job
- Expired-insights email summary

**Phase 6 — Polish + measure.** 2 days + ongoing.
- Telemetry on: act-rate per evaluator, snooze distribution, pin usage, capture confirm rate, empty-state frequency
- 30-day review gate before considering v3 evaluators

**Total: ~20–25 working days**, roughly 4–5 weeks. Shippable in phases — Phase 1 alone is a meaningful user-visible improvement.

---

## 17. What we measure (and what we defer)

### 17.1 Instrument at launch

| Metric | Why | Threshold to act |
|--------|-----|------------------|
| Act-rate per evaluator | Which triggers actually drive action | < 20% over 30d → cut or reweight |
| Snooze distribution per trigger | Which evaluators are noise | > 60% snooze → cut |
| Pin-to-top frequency | Where Aion's ranking disagrees with user | > 30% of sessions use pin → reweight score |
| Capture confirm rate | How often the parsed entity/follow-up is right | < 70% → tune parse prompt |
| Capture → action conversion | Does captured intent lead to real follow-through | < 40% → surface captures more aggressively in brief |
| Empty-state frequency | Is cold start degrading to broken | > 3 consecutive days "nothing urgent" → insert Watch tier |

### 17.2 Don't design yet (measure first)

- Whether to add `seasonal_peak_prep` (wait 30 days — if Prepare tier stays empty, add)
- Whether to add `hot_lead_multi_view` as v2+ threshold (we're adding it in v2 — measure act-rate before adding multi-view variants)
- Whether voice capture needs real-time streaming (ship 60s-max recording first, iterate if users want continuous)
- Whether inline draft should auto-regenerate on edit (ship one-tap "regenerate," measure usage)

---

## 18. Open questions

1. **Capture button placement.** Bottom-right floating, inside the brief card, or a persistent lobby header slot? Needs a design review pass before Phase 1 lands.
2. **Transcription provider.** Reusing Aion Voice infra (Deepgram?) vs. a dedicated path. Confirm what's wired before Phase 1.
3. **`workspace.median_deal_value`** — runtime RPC vs. daily-computed materialized value. Runtime is simpler; evaluate cost on workspaces with 500+ deals.
4. **Date-hold pressure already exists in follow-up-queue cron.** Confirm whether we read it from there or recompute inside the insight evaluator (Signal Navigator flagged this — needs code read).
5. **Does `follow_up_log.stakeholder_id` exist?** Signal Navigator said "promised addition, not yet confirmed." If missing, Phase 3 needs the migration added.
6. **Repeat-client detection.** `deal.client_entity_id has ≥ 2 prior won deals` — where does "won" live cleanly today? Confirm before Phase 4 wires the danger-zone check.

---

## 19. File map (anticipated)

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260417_capture_events_and_expiry.sql` | `cortex.capture_events`, `proposals.expires_at`, RPCs |
| `src/widgets/lobby-capture/ui/CaptureButton.tsx` | Lobby capture surface |
| `src/widgets/lobby-capture/ui/CaptureReviewCard.tsx` | Parsed review step |
| `src/widgets/lobby-capture/api/capture-parse.ts` | Parse invocation |
| `src/widgets/lobby-capture/api/capture-confirm.ts` | Write-paths |
| `src/app/api/aion/capture/route.ts` | Parse endpoint |
| `src/app/api/aion/lib/evaluators/deposit-gap.ts` | New evaluator |
| `src/app/api/aion/lib/evaluators/quote-expiring.ts` | New evaluator |
| `src/app/api/aion/lib/evaluators/gone-quiet-with-value.ts` | New evaluator |
| `src/app/api/aion/lib/evaluators/hot-lead-multi-view.ts` | New evaluator |
| `src/app/api/aion/lib/collapse-compound-insights.ts` | Synthesis pass |
| `src/app/api/aion/lib/cross-deal-aggregation.ts` | Client-level group pass |

### Modified files

| File | Change |
|------|--------|
| `src/widgets/todays-brief/ui/InsightRow.tsx` | Inline-editable draft, pin, hover-rationale, park |
| `src/widgets/todays-brief/ui/TodaysBriefWidget.tsx` | Parked tray, cold-start branch |
| `src/widgets/todays-brief/api/get-brief-and-insights.ts` | Compound + cross-deal surfacing |
| `src/app/api/aion/dispatch/lib/dispatch-handlers.ts` | Deal-Lens deep-link branch, danger-zone check |
| `src/app/api/aion/lib/insight-evaluators.ts` | Register new evaluators, remove v1 stubs |
| `src/shared/lib/lobby-layouts/presets.ts` | Sales preset weighting annotation |
| `src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx` | Seed support for brief → deal-lens handoff |
| `src/app/(dashboard)/(features)/aion/ui/ChatInterface.tsx` | Read seed from localStorage |

---

## 20. Design decisions + rationale

1. **Editor's note, not queue.** The brief's right to exist depends on it not duplicating `owed-today` / `gone-quiet`. Compound synthesis + cross-deal aggregation + forward-looking prep is its moat.
2. **Capture primitive is workspace-wide, not brief-local.** Capture serves the whole platform. Scoping it to the brief box limits its reach. But it's specced here because the brief is its first consumer and strongest justification.
3. **Inline drafts, not preview-then-confirm.** For outbound comms to clients, inline-editable (HoneyBook/Granola pattern) beats two-step. Sheet remains for reversible-but-costly actions where preview adds safety without friction.
4. **Five evaluators, not ten.** Research panel unanimous: noise wins if we over-cover. Measure act-rate for 30 days before adding more.
5. **Danger zones refuse to draft.** Relationship-driven sellers have a voice. Averaging an auto-draft toward LinkedIn-SaaS-speak for a repeat client is a trust-destroying failure mode. Call-reminder-only is right.
6. **Pin-to-top + hover-rationale.** User brings judgment, Aion brings coverage. Auditable ranking is the only path to trust when the ranking has real stakes.
7. **Park, not force-log.** Soft friction that learns from inaction beats hard friction that drives uninstall.
8. **Kill switch degrades gracefully.** Evaluators keep running when Aion-drafting is off. The brief stays useful even in fully-manual mode.
9. **Cold start = onboarding tasks.** Empty "Nothing urgent" on day 1 reads as broken. Onboarding-as-insights preserves the pattern and builds the habit.
10. **Continue-in-chat via localStorage seed.** Existing session state is already in localStorage per the Aion chat docs. Re-use that lane. Don't invent a new session-handoff mechanism.

---

## 21. References

- `docs/reference/aion-daily-brief-design.md` — v1 (this extends it)
- `docs/reference/sales-dashboard-design.md` — sibling sales-preset cards
- `docs/reference/follow-up-engine-design.md` — shared drafting rails
- `docs/reference/aion-conversational-interface.md` — chat tool inventory
- `docs/reference/crm-page-state-and-flow.md` — Prism lenses, Stream filter chips
- `docs/reference/directory-schema.md` — Ghost Protocol rules for capture-created entities
- `docs/reference/cortex-schema.md` — relationships, memory, write protection

Research pass (2026-04-16) triangulated by User Advocate, Field Expert, Signal Navigator, and Critic. Points of convergence are baked into the spec; points of tension are resolved in §3.3, §7, §8, §11.
