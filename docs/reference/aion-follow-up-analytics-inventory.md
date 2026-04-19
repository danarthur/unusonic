# Aion follow-up analytics — full signal inventory

**Scope:** every data point the Aion deal card + follow-up engine reads or
writes to build its suggestions, organized by source and purpose.

**Status:** reflects branch `claude/gracious-ptolemy-b92e12` at commit
`dcbd781` + downstream fixes. See `aion-deal-card-unified-design.md` for
the design intent that drives what's tracked and what isn't.

**Terminology:**
- *Owner* = the user who owns a deal (`public.deals.owner_user_id`).
- *Member* = any authenticated user belonging to the workspace.
- *Personalize* = Aion uses a signal to shape voice or priority.
- *Gated* = only applied when the sample-quality threshold passes AND
  workspace opt-in is on.

---

## 1. What Aion learns ABOUT the owner

The personalization layer. All computed from actions the owner has taken
themselves — feedback-loop-guarded so Aion doesn't train on its own
suggestions.

| Signal | Source | Used for | Gated? |
|---|---|---|---|
| Typical days between proposal sent → first follow-up | `public.proposals.email_delivered_at` → `ops.follow_up_log.created_at` | Voice: "past your typical check-in window"; priority boost when exceeded | ✓ |
| Typical days between consecutive follow-ups | `ops.follow_up_log` (window-lagged over same deal) | Nudge cadence timing | ✓ (Scope 3 only) |
| Stddev on both of the above | Same | Coefficient-of-variation gate — behavior too variable means no personalization | ✓ |
| Preferred channel per pipeline stage tag | `ops.follow_up_log.channel` grouped by `ops.pipeline_stages.tags` | Shifts Outbound CTA verb ("Draft a text" vs "Draft a check-in") | ✓ |
| Sample size | `COUNT(*)` on qualifying follow-up-log rows | Hard gate — under 20 rows = no personalization at all | n/a (threshold) |
| Oldest-sample age | `MIN(created_at)` vs now | Staleness gate — rows older than 180d don't count | n/a (threshold) |
| Draft-edit classification | `ops.follow_up_log.edit_classification` + `edit_distance` | Feeds `workspaces.aion_config.learned.vocabulary`; Aion's drafts drift toward the owner's voice | Always-on |

**Feedback-loop guard (non-negotiable):** the owner-cadence RPC excludes
any follow-up act where `queue_item_id IS NOT NULL AND queue.linked_insight_id IS NOT NULL`.
Only unprompted, human-initiated acts feed learning.

**Deliberately NOT learned** (creepy-line + Critic's hard constraints):
- Time-of-day or day-of-week preferences (banned; would shift the copy
  toward "I see you email at 9am Tuesdays")
- Cross-seat comparisons (never surfaced; workspace admins see that you
  opted in, not your numbers)
- Deal value as a behavioral fingerprint of the owner

---

## 2. What Aion reads ABOUT the deal

Deal-intrinsic signals. Recomputed per card render; no personalization
gate.

| Signal | Source | Used for |
|---|---|---|
| Days until event | `ops.events.starts_at` (min upcoming), fallback `public.deals.proposed_date` | Priority multiplier (0.8–2.0 ramp); voice "{N} days out" when ≤30 |
| Event archetype | `public.deals.event_archetype` — normalized to wedding/corporate/tour/other | Cadence keying; cold-start default lookup |
| Stage dwell time | `ops.deal_transitions.entered_at` (most recent into current stage) | Voice "21 days in Inquiry"; priority multiplier vs rotting_days |
| Workspace stall threshold | `ops.pipeline_stages.rotting_days` | Denominator for "past typical" framing |
| Proposal engagement — hot | `public.proposals.view_count` + `last_viewed_at` | Overrides stall voice: "Emily opened the proposal 3× in 48h" |
| Proposal sent timestamp | `public.proposals.email_delivered_at` (fallback `created_at`) | "Proposal sent 9 days ago" |
| Client first name | `directory.entities.attributes.first_name`, fallback `display_name` first token | Humanizes voice ("No reply from Emily") |
| Active stage-advance insights | `cortex.aion_insights` where trigger_type='stage_advance_suggestion' AND status IN ('pending','surfaced') | Pipeline section rows |
| Active follow-ups | `ops.follow_up_queue` where status='pending' AND superseded_at IS NULL | Outbound section rows |
| Linked insight ↔ follow-up | `ops.follow_up_queue.linked_insight_id` FK | Dedup across sections; prevents a deal_stale insight from surfacing alongside its matching follow-up |
| Series context | `ops.projects.is_series` + `ops.events` count | isSeries flag, totalShows, nextUpcoming |
| Deal value (backend only) | `public.deals.budget_estimated` | Priority ordering; NEVER voice-surfaced |

---

## 3. What Aion tracks about user ACTIONS

All writes to `ops.deal_activity_log` as `aion_card_{action}` events.
Unified namespace; legacy `aion_suggestion_accepted` and `follow_up_acted`
events continue to fire from non-card surfaces for the 30-day bridge.

| Event | When it fires | status values |
|---|---|---|
| `aion_card_accept_advance` | Owner clicks Move to {Stage} | `success` \| `noop` (if already advanced / already resolved) |
| `aion_card_revert_advance` | Owner clicks Undo within 10s | `success` |
| `aion_card_dismiss_advance` | Owner clicks × on Pipeline row | `success` |
| `aion_card_draft_nudge` | Owner clicks Draft a check-in | `success` |
| `aion_card_act_nudge` | Nudge sent (email/sms/call logged) | `success` |
| `aion_card_dismiss_nudge` | Owner dismisses Outbound row | `success` |
| `aion_card_snooze_nudge` | Owner snoozes 3d or 7d | `success` |

Every row's metadata carries:

```jsonb
{
  "card_variant":   "both" | "pipeline_only" | "outbound_only" | "collapsed",
  "source":         "deal_lens" | "stream_card" | "brief",
  "insight_id":     uuid | null,
  "follow_up_id":   uuid | null,
  "noop_reason":    "already_advanced" | "already_resolved" | null
}
```

Analyst UNION queries for the bridge period live in
`docs/reference/analytics/aion-card-events.md`.

---

## 4. Priority math

The formula that orders what shows up first:

```
final_score = (base + priority_boost)
            × (1 + escalation)
            × days_out_multiplier
            × cadence_multiplier
            × dwell_multiplier
```

capped at `priority_ceiling` (default 100).

| Input | Range | Source |
|---|---|---|
| Base | 10 | Hardcoded floor, `BASE_PRIORITY` in `enroll-follow-up.ts` |
| priority_boost | 0+ | Stage trigger config (per-stage YAML/JSONB) |
| Escalation | `1.15ⁿ` where n = `escalation_count` | Cron-maintained on `ops.follow_up_queue` |
| Days-out multiplier | 0.8 → 2.0 | Computed from `ops.events.starts_at` (see §2) |
| Cadence multiplier | 1.0 or 1.2 | 1.2 when owner exceeded their typical window AND sample_quality='sufficient' |
| Dwell multiplier | 1.0 → 1.5 | `daysInStage / rotting_days`, capped |
| Ceiling | default 100 | `ops.follow_up_queue.priority_ceiling` |

Every card row exposes this breakdown inline via the **"Why this?"**
tooltip — natural-language only; no raw scores in copy.

---

## 5. Consent + audit

Tracked about the user's consent itself, not their behavior.

| Table | Records |
|---|---|
| `cortex.consent_log` | Every accept + revoke of each term, with `term_version` + `accepted_at` + `revoked_at`. Append-only; we don't mutate past rows. |
| `cortex.feature_access_requests` | Member-submitted requests to enable gated features + admin review decisions |
| `cortex.ui_notices` | Disable-fanout banners + other admin-flip side-effect notifications. Per-user, dismissible |
| `workspaces.aion_config.learn_owner_cadence` | Workspace-level opt-in flag for cadence learning. Default false. |

---

## 6. Deferred — infrastructure exists, not yet ingested

Listed in design doc §20.12; not blocking v1.

| Signal | Why deferred | Cost estimate |
|---|---|---|
| Inbound-email reply timestamps | No webhook integration (Resend/SendGrid inbound) | High — new infra, entity resolution on email address |
| Per-client response-time history beyond proposal views | Depends on inbound email | Medium once inbound exists |
| Proposal-revision diff history | `public.proposals` edits are destructive today; no audit table | Medium — new table + write-path capture |
| Peer benchmarking across workspaces | Platform-level; requires anonymous aggregation design + legal review | High |
| Seasonality-adjusted cadence | Needs year+ of owner data; most workspaces won't have it | Medium — analytics only |
| Stage-exit reason on lost deals | No UI today captures it; `ops.deal_transitions.metadata` could carry it | Low — picker on Lost transition |
| Channel-preference voice verbs | Would shift "Draft a check-in" → "Draft a text" based on client history; creepy-line-adjacent | Medium — sub-project |

---

## 7. What Aion does NOT see

For the avoidance of doubt:

- **Any content of your emails or messages**, beyond what you explicitly
  draft via the Aion nudge flow
- **Time-of-day patterns** — we don't track when you're active
- **Other members' cadence** — your profile is per-user
- **Off-platform activity** — Aion reads Unusonic data only
- **Any data from outside your workspace** — all scoped by `workspace_id`
- **Personally-identifying client data** beyond what you've already
  captured (names, emails, proposal content) — Aion uses what's in the
  workspace, nothing imported

---

## 8. Gating + fallback logic

The layers that decide whether personalization applies to a render:

1. **Workspace opt-in**: `aion_config.learn_owner_cadence === true`?
   - No → use archetype defaults (wedding=5d / corporate=2d / tour=7d /
     other=4d), render no "Your typical…" copy
2. **Sample-quality gate** (per-user, per-archetype):
   - `sample_size >= 20` AND
   - `stddev / mean < 0.5` AND
   - `max(observation_age_days) < 180`
   - Fail any → `sampleQuality = 'insufficient'`, fall back as above
3. **Feedback-loop filter**: only count acts where `queue_item_id IS NULL`
   OR the queue row's `linked_insight_id IS NULL`
4. **Stage-advance resolution** (§11.1 case 2): when a stall-narrative
   follow-up enrolls, concurrent `deal_stale` insights are resolved at
   write-time so the brief doesn't double-render

---

## 9. Telemetry for accuracy (Critic P1-6, not yet wired)

Design doc §20.11 reserves one future slot: log `aion_card_cadence_accuracy`
when Aion renders a personalized "past your check-in window" string and
the owner acts. Predicted-window accuracy running below 60% over 100
acts auto-disables personalization for that user until re-qualification.

Currently **not implemented** — ships as part of the telemetry maturity
pass after v1 is rolled out to a handful of workspaces.

---

## 10. Related docs

- `aion-deal-card-unified-design.md` §20 — full analytics design
- `analytics/aion-card-events.md` — event-schema deep dive + bridge
  UNION queries
- `audits/aion-deal-card-a11y-2026-04-18.md` — a11y gate
- `follow-up-engine-design.md` — the P0 engine this layer sits on
- `sales-dashboard-design.md` — where these signals feed other surfaces
