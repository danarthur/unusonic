# Aion Daily Brief

> Jarvis, not a chatbot. Aion already did the thinking. You approve.

The Daily Brief is a lobby dashboard card that acts as an autonomous co-pilot. It surfaces a daily AI-generated brief paragraph plus actionable insight rows. Users tap an insight and Aion executes the action (drafts follow-ups, confirms crew) via a right-side Sheet -- no chat required. Aion only escalates to conversation when it genuinely needs a decision.

---

## 1. Mental Model

The brief is the first thing a user sees in the lobby. It answers "what needs my attention today?" without requiring them to open a chat window. Every insight is a pre-evaluated condition -- Aion ran the analysis overnight, and the user either approves the suggested action or dismisses it.

This is the first Aion surface that is not conversational. It sets the pattern for all future Aion ambient features.

---

## 2. Architecture

### 2.1 Data Layer

Two tables feed the widget:

| Table | Schema | Created by |
|-------|--------|------------|
| `ops.daily_briefings` | ops | Migration `20260415120000_daily_briefings_and_reason_types.sql` |
| `cortex.aion_insights` | cortex | Migration `20260408180000_aion_proactive_insights.sql` |

Both are populated by the daily cron. The briefing is a single paragraph summarizing the day. Insights are individual actionable items, each tied to a trigger type and an entity (deal, crew member, etc.).

**RPCs (all SECURITY DEFINER):**
- `cortex.upsert_aion_insight()` -- insight writes (cron)
- `cortex.resolve_aion_insight()` -- mark insight resolved after action
- `cortex.dismiss_aion_insight()` -- user dismissal

### 2.2 Insight Evaluators

`src/app/api/aion/lib/insight-evaluators.ts`

Four evaluators run during the daily cron:

| Trigger Type | Condition | Suggested Action |
|-------------|-----------|------------------|
| `proposal_viewed_unsigned` | Proposal viewed but not signed | Follow-up email/SMS |
| `deal_stale` | No notes or activity in N days | Follow-up email/SMS |
| `crew_unconfirmed` | Crew assigned but not confirmed | Batch confirm crew |
| `show_no_crew` | Event within window, no crew assigned | Link to deal for manual assignment |

**Query optimization:** The evaluators share a batch-fetched dataset. `getUpcomingDealsWithCrew()` fetches all upcoming deals + crew in 2 queries. Notes, logs, and org lookups are batched per evaluator. Total query count is O(6) constant regardless of deal count (was O(4N+1)).

### 2.3 Consolidated Server Action

`src/widgets/todays-brief/api/get-brief-and-insights.ts`

Returns `{ brief, insights, workspaceId }` in one call. Uses the system client because `ops` and `cortex` schemas are not PostgREST-exposed. Workspace scoping is enforced via WHERE clause on `workspace_id`.

### 2.4 Dispatch API

`POST /api/aion/dispatch`

Two-step flow prevents accidental execution:

1. **execute** -- returns a preview (draft text, crew list, or link)
2. **confirm** -- performs the action, resolves the insight

**Auth chain:** cookie session -> `canExecuteAionAction` tier gate -> kill switch check.

**Staleness guard:** every handler re-validates the underlying condition before executing. If the situation changed since the insight was generated, the handler returns `already_resolved`.

#### Handler Map

| Trigger Type | Execute | Confirm |
|-------------|---------|---------|
| `proposal_viewed_unsigned` | Generate follow-up draft via `generateFollowUpDraft()` | Send email via Resend, log action |
| `deal_stale` | Generate follow-up draft via `generateFollowUpDraft()` | Send email via Resend, log action |
| `crew_unconfirmed` | Fetch crew list with confirmation status | Batch confirm selected crew members |
| `show_no_crew` | Return deal link for manual assignment | N/A (action is navigation) |

**Shared draft generation:** `src/app/api/aion/lib/generate-draft.ts` exports `generateFollowUpDraft()` and `buildFollowUpPrompt()`. Reused by both the dispatch API and the existing `/api/aion/draft-follow-up` route. A synthetic `FollowUpQueueItem` is constructed from insight context -- no dependency on the follow-up queue table.

#### Dispatch Utilities

- `resolve-insight.ts` -- calls `cortex.resolve_aion_insight` RPC
- `send-dispatch-email.ts` -- Resend send + `logFollowUpAction` + `recordAionAction`

---

## 3. Widget UI

### 3.1 Component Tree

```
TodaysBriefWidget
  |-- WidgetShell (shared lobby card wrapper)
  |-- Brief paragraph (markdown-rendered)
  |-- InsightRow[] (AnimatePresence for exit animation)
  |-- ActionFlowSheet (dynamic import, ssr: false)
        |-- DraftPreview (email/SMS follow-ups)
        |-- CrewPreview (crew confirmation list)
```

### 3.2 TodaysBriefWidget

`src/widgets/todays-brief/ui/TodaysBriefWidget.tsx`

Fetches via `getBriefAndInsights()` on mount. Renders the brief paragraph, insight rows, and the action Sheet. Shows "Nothing urgent right now." when there are no insights -- the card is always visible, never hidden.

Marks insights as surfaced (once per mount) via `markInsightsSurfaced()` so Aion chat can reference them without repeating.

### 3.3 InsightRow

`src/widgets/todays-brief/ui/InsightRow.tsx`

Each row has:
- Urgency stripe using semantic classes (`stage-stripe-error`, `stage-stripe-warning`, `stage-stripe-accent`, `stage-stripe-neutral`)
- Truncated title
- "Go" action button (opens ActionFlowSheet)
- External link (when applicable)
- Dismiss X

Animated with `motion.div` using `STAGE_LIGHT` spring and `AnimatePresence` exit.

### 3.4 ActionFlowSheet

`src/widgets/todays-brief/ui/ActionFlowSheet.tsx`

Right-side Sheet with a state machine:

```
idle -> executing -> preview -> confirming -> completed (auto-close 1.5s)
                  -> clarify (re-submit with answer)
                  -> error
```

Dynamic imported via `next/dynamic` with `ssr: false` for bundle optimization.

### 3.5 DraftPreview

`src/widgets/todays-brief/ui/DraftPreview.tsx`

Editable draft with:
- Recipient name/email
- Subject line (email only)
- Auto-expanding textarea for body
- SMS character count

### 3.6 CrewPreview

`src/widgets/todays-brief/ui/CrewPreview.tsx`

Crew list with:
- Checkboxes per crew member
- Select-all toggle
- Name, role, and email per row

---

## 4. Data Flow

```
Daily Cron
  -> ops.daily_briefings   (brief paragraph)
  -> cortex.aion_insights   (4 evaluators)

Lobby Load
  -> getBriefAndInsights()  [system client]
    -> ops.daily_briefings
    -> cortex.aion_insights
  -> Widget renders brief + insight rows

User taps insight
  -> ActionFlowSheet opens
  -> POST /api/aion/dispatch { action: 'execute' }
  -> Handler generates preview (draft / crew list)
  -> Sheet shows preview

User approves
  -> POST /api/aion/dispatch { action: 'confirm' }
  -> Handler executes (send email / confirm crew)
  -> logFollowUpAction() + recordAionAction()
  -> cortex.resolve_aion_insight()
  -> Sheet auto-closes, row animates out
```

---

## 5. Lobby Integration

### 5.1 Registry

`lobby.todays_brief` in `src/shared/lib/metrics/registry.ts`:
- `kind: 'widget'`
- `widgetKey: 'todays-brief'`
- `requiredCapabilities: []` (no capability gate -- data fetcher scopes to the viewer)
- `refreshability: 'daily'`
- `roles: ['owner', 'pm', 'finance_admin']`

### 5.2 Presets

Position 0 in all three layout presets (sales, production, finance) and `DEFAULT_DUPLICATE_SEED`. See `src/shared/lib/lobby-layouts/presets.ts`.

### 5.3 Greeting Dedup

Aion chat greeting (`src/app/api/aion/chat/route.ts`, lines ~868-909) now says "I surfaced N items on your brief" instead of listing each insight individually. Prevents the user from seeing the same information twice.

---

## 6. Design Decisions

1. **System client for widget fetch.** `ops` and `cortex` schemas are not PostgREST-exposed. The server action uses the system client with explicit workspace_id WHERE clauses.

2. **Two-step dispatch.** Preview before execute prevents accidental sends. The only exception is dismiss, which is a single-step action that already existed.

3. **Synthetic FollowUpQueueItem.** The dispatch handlers build a `FollowUpQueueItem` from insight context rather than reading the follow-up queue table. `getDealContextForAion` only needs 3 fields: `reason`, `reason_type`, `suggested_channel`.

4. **show_no_crew is limited.** Full crew recommendation requires availability/skill matching that does not exist yet. The MVP returns a deal link for manual assignment.

5. **Dynamic import for ActionFlowSheet.** `next/dynamic` with `ssr: false` keeps the widget's initial bundle lean since most users will not open the Sheet on every page load.

6. **Always-visible card.** Shows "Nothing urgent right now." when empty rather than hiding. The card's presence reinforces Aion as an ambient presence, and avoids layout shift when insights appear.

7. **Priority-based display.** Insights are sorted by priority, not filtered by preset category. Small teams wear multiple hats -- a production manager still needs to see an overdue proposal.

---

## 7. File Map

| File | Purpose |
|------|---------|
| `src/widgets/todays-brief/ui/TodaysBriefWidget.tsx` | Main widget -- brief + insights + Sheet |
| `src/widgets/todays-brief/ui/InsightRow.tsx` | Single insight row with urgency stripe |
| `src/widgets/todays-brief/ui/ActionFlowSheet.tsx` | Right-side execution Sheet |
| `src/widgets/todays-brief/ui/DraftPreview.tsx` | Editable follow-up draft preview |
| `src/widgets/todays-brief/ui/CrewPreview.tsx` | Crew confirmation list |
| `src/widgets/todays-brief/api/get-brief-and-insights.ts` | Consolidated server action (system client) |
| `src/widgets/todays-brief/api/get-todays-brief.ts` | Original brief-only fetcher (kept for other callers) |
| `src/widgets/todays-brief/index.ts` | Barrel exports |
| `src/app/api/aion/dispatch/route.ts` | Dispatch API route handler |
| `src/app/api/aion/dispatch/lib/dispatch-handlers.ts` | Per-trigger-type handlers |
| `src/app/api/aion/dispatch/lib/resolve-insight.ts` | Insight resolution utility |
| `src/app/api/aion/dispatch/lib/send-dispatch-email.ts` | Email send + log utility |
| `src/app/api/aion/lib/generate-draft.ts` | Shared draft generation module |
| `src/app/api/aion/lib/insight-evaluators.ts` | Batch-optimized insight evaluators |
| `src/app/api/aion/draft-follow-up/route.ts` | Thin wrapper calling generate-draft |
| `src/shared/lib/metrics/registry.ts` | Widget registration |
| `src/shared/lib/lobby-layouts/presets.ts` | Layout presets (all include brief) |
| `src/app/api/aion/chat/route.ts` | Greeting dedup (lines ~868-909) |

---

## 8. Database Dependencies

| Object | Type | Notes |
|--------|------|-------|
| `ops.daily_briefings` | Table | Migration `20260415120000_daily_briefings_and_reason_types.sql` |
| `cortex.aion_insights` | Table | Migration `20260408180000_aion_proactive_insights.sql` |
| `cortex.upsert_aion_insight()` | RPC | SECURITY DEFINER, insight writes |
| `cortex.resolve_aion_insight()` | RPC | SECURITY DEFINER, insight resolution |
| `cortex.dismiss_aion_insight()` | RPC | SECURITY DEFINER, user dismissal |

Service role needs GRANT on both tables. Ensure migrations include explicit grants.

---

## 9. Future Work

These are identified extensions, not committed work:

- **Finance evaluators** -- overdue invoices, deposit gaps, QBO sync issues
- **Production evaluators** -- equipment conflicts, day sheet completeness
- **Crew recommendation** -- `show_no_crew` handler returns availability-matched suggestions instead of a deal link
- **Real-time subscription** -- Supabase realtime on `cortex.aion_insights` for live updates
- **Multi-domain brief** -- brief paragraph references production + finance facts (currently sales-only)
- **Ambient urgency escalation** -- insight priority increases through the day if unresolved
