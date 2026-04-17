# Capture Surfaces — How voice notes become durable knowledge

> "He doesn't think in 'captures.' He thinks 'what do I know about Alexa.'"

This doc specifies where captured notes surface across Unusonic, how users find and use them over time, and the architecture that threads a one-second voice memo through every place it should enrich. It is the read-side counterpart to the capture primitive shipped in Phase 1 of the Sales Brief v2 (commit `864a559`).

Read this alongside `sales-brief-v2-design.md` (the capture WRITE side), `cortex-schema.md` (memory + relationships), and `directory-schema.md` (entities).

---

## 1. The problem

The capture primitive exists. Users tap a mic or press `Shift+C`, dictate a thought, Aion parses it, a row lands in `cortex.capture_events`. Today that row is write-only: no UI reads it, nothing else in the product knows it exists, and the user who just dictated "Alexa from Pure Lavish, Ally and Emily's wedding, prefers text over email" cannot find that note anywhere. The capture primitive without a surfacing architecture is a voicemail box Aion never listens to.

This doc fixes that.

---

## 2. Mental model

### 2.1 The user's model

The production-company owner does not model "captures" as a first-class object. He thinks in people, clients, venues, deals. When he goes looking for a voice note he left three weeks ago about Alexa, he opens Alexa — not a notes app. When he asks "what did I say about that guy with the barn venue in Warwick," he asks Aion — not a search bar. When he captures "remind me to call her Tuesday," he expects Tuesday's owed-today to surface it — he doesn't want to set a separate reminder.

The three retrieval modes in rough frequency (per the User Advocate research pass):

| Mode | Frequency | Primary surface |
|---|---|---|
| **Recall before contact** ("phone's ringing, what did I say about her?") | ~60% | Entity detail page |
| **Deal audit trail** ("wait, when did we decide on the 4pm ceremony?") | ~25% | Deal lens / deal timeline |
| **Fuzzy search across time** ("that guy with the barn venue") | ~10% | Aion chat |
| **Passive browse / review** | ~5% | A reverse-chron list, nice to have |

### 2.2 Our architectural model

Captures are **episodic facts** that belong on the entity they describe. The primary home for a capture is the person, company, or venue it's about. Every other surface is a derivative view or a generative answer built on top of that primary home.

Above the raw timeline sits an **AI-maintained summary** — the Day.ai / Attio pattern. The user rarely reads a timeline of twelve notes about Alexa; he reads a one-paragraph narrative that the system keeps synthesized and a handful of pinned facts ("prefers text," "hates Tuesdays," "Pure Lavish Events, lead coordinator"). The timeline is for drill-down and audit; the summary is for glance.

Three durable writes happen per confirmed capture:

1. **`cortex.capture_events`** — audit row, the raw record (transcript + parse)
2. **`cortex.aion_memory`** — structured fact, entity-scoped, retrievable by Aion chat
3. **`cortex.memory`** — embedded chunk, searchable via `match_memory` RPC for RAG

The summary and pinned-facts layer is generated on-demand from these three plus existing entity context. Nothing is pre-rendered and stored as HTML — the presentation is always live.

### 2.3 What we do NOT build

The field-expert panel surfaced a pattern cemetery. Products that abandoned these, we don't rebuild:

- **No dedicated "Captures" top-level page.** Every shipping product that had one moved away from it (Mem's Collections replaced tags; Day.ai/Attio anchor on entity). A standalone notes silo is the first thing users stop visiting.
- **No manual tagging UI.** Users don't tag. AI-inferred links only.
- **No always-on ambient recording.** Microsoft Recall's cautionary tale. Push-to-talk only. Visibility: never-recording → explicit-opt-in-per-capture.
- **No auto-notifications on every capture.** Captures surface when the user looks, not as inbox noise.
- **No LLM answers without citations.** Every Aion recall answer links back to the specific `capture_events` row it quoted. Granola / Notion pattern.

---

## 3. Principles

These are what we commit to. When later decisions conflict, these win.

1. **Captures live on the entity, not in a silo.** Primary surface is always the person/company/venue/deal. Anywhere else is derivative.
2. **Distillation over preservation.** The raw transcript is archival; the summary is product. At scale (>50 captures per entity) the summary is the only thing most users read.
3. **Private by default.** Voice captures are interior monologue. Default visibility is `user` (owner-only). Workspace-shared is explicit, either via toggle at capture time or via verbal marker ("for the team:" prefix). This is the most important architectural decision in this doc. Getting it wrong detonates the feature.
4. **Misattribution recovery is first-class.** Voice transcripts mangle unfamiliar names; the LLM misparses entities. Every surface that displays a capture shows a one-tap "not this one" reassign. Without this, bad parses calcify on the wrong timelines and trust collapses.
5. **Cited recall only.** Aion chat answers that reference captures link back to the row. No orphan claims.
6. **Conservative auto-actions.** We auto-create follow-ups ONLY when the capture has an explicit, structured intent ("remind me Tuesday," "call her next week"). Observations don't seed the queue — the 80% junk rate the panel warned about would kill owed-today as a surface.
7. **Captures inform Aion's drafts.** When Aion drafts anything to an entity the user has captured about, it reads the captures first. "Alexa hates Tuesdays" + auto-drafted Tuesday proposal is the failure mode to avoid.
8. **No client-portal visibility.** Captures are a seller's mental notes. Never surface in `/(client-portal)/` routes.

---

## 4. Architecture

### 4.1 Data model

#### Existing tables touched

**`cortex.capture_events`** (already exists, Phase 1)

```sql
-- Add one column for the privacy tier
ALTER TABLE cortex.capture_events
  ADD COLUMN visibility text NOT NULL DEFAULT 'user'
  CHECK (visibility IN ('user', 'workspace'));

CREATE INDEX idx_capture_events_resolved_entity_id
  ON cortex.capture_events (resolved_entity_id, created_at DESC)
  WHERE status = 'confirmed';

CREATE INDEX idx_capture_events_workspace_created
  ON cortex.capture_events (workspace_id, created_at DESC)
  WHERE status = 'confirmed';
```

Visibility policy:

- `'user'` (default) — only the capturing `user_id` sees this capture. RLS extended.
- `'workspace'` — visible to any workspace member.

Default is `'user'` for safety; the composer sets `'workspace'` only on explicit toggle. This is the single most important schema addition in this doc — don't ship a multi-user workspace seeing raw captures without it.

**`cortex.aion_memory`** (already exists)

Already has `user_id` scoping and an `entity_id` field via `save_aion_memory` RPC. No schema change. The confirm-capture action gains a call to this RPC when a capture resolves to an entity — creating a structured fact like:

```
entity_id: <Alexa's id>
scope: 'episodic'
fact: "Met at Pure Lavish Events about Ally and Emily wedding (2026-04-17 capture)"
source: 'capture'
source_ref: <capture_events.id>
```

**`cortex.memory`** (already exists, RAG embeddings)

Gains a new `source_type` enum value: `'capture'` joins `'deal_note'`, `'follow_up'`, `'proposal'`, `'event_note'`. Embedding is generated from `transcript + parsed_note` concatenated. `source_id` is the `capture_events.id`.

#### New tables

None for this phase. All three write targets exist.

### 4.2 Write architecture

`confirmCapture()` (`src/widgets/lobby-capture/api/confirm-capture.ts`) gains three additional writes after the `cortex.write_capture_confirmed` RPC:

```
write capture_events row (today)
  → if resolved_entity_id and visibility != 'dismissed':
      → write aion_memory fact (entity-scoped, structured)
      → write memory embedding (for RAG recall)
  → if parsed_follow_up.suggested_when is an explicit ISO date:
      → write follow_up_queue row (see §4.3 for schema unlock)
```

All three additional writes are best-effort — a failure in any one returns `ok: true` with the capture_events row created, and an error log. Partial writes degrade gracefully; a missing memory row just means Aion chat won't surface the capture until the next cron-driven re-sync (a backfill job that catches orphans).

### 4.3 Read architecture

Five read surfaces, ranked by priority. Numbered sections §5–§9 spec each.

1. **Entity detail page** — primary home, per-entity summary + timeline
2. **Aion chat recall** — "what do you remember about Alexa?"
3. **Pre-contact brief** — on-demand "prep me for X" skill
4. **Activity feed** — filterable workspace-wide stream
5. **Deal lens** — captures about a deal's client surface on the deal

Each surface queries different slices; none of them is THE canonical view. The entity page is the primary surface for individual recall; Aion chat is the primary surface for cross-entity questions; the activity feed is the primary surface for workspace-wide awareness.

### 4.4 Deletion / edit / reassign

Captures are mutable. The user can:

- **Edit the transcript** — fix a misheard name, clean up text. Updates `capture_events.transcript` and triggers an embedding re-generation.
- **Reassign the resolved entity** — one-tap "not this one" reassign. Updates `resolved_entity_id`, invalidates the old `aion_memory` fact, writes a new one on the correct entity.
- **Change visibility** — toggle user→workspace or vice versa. Updates `visibility` column.
- **Delete** — soft-delete via `status='dismissed'` + `dismissed_at`. The audit row persists; all reads filter `status='confirmed'`.

All four operations happen via the same server action (`updateCapture`) with action type discrimination.

### 4.5 Follow-up queue unlock (schema migration)

Current constraint chain blocks capture→queue seeding:

- `ops.follow_up_queue.deal_id` is NOT NULL
- `reason_type` CHECK has no `'captured_intent'` value

Migration `20260418_follow_up_queue_capture_unlock.sql`:

```sql
-- Relax deal-scope constraint; captures without a deal are valid queue rows.
ALTER TABLE ops.follow_up_queue
  ALTER COLUMN deal_id DROP NOT NULL;

-- Add entity-scope column for non-deal follow-ups.
ALTER TABLE ops.follow_up_queue
  ADD COLUMN entity_id uuid REFERENCES directory.entities(id) ON DELETE SET NULL;

-- Expand reason_type CHECK.
ALTER TABLE ops.follow_up_queue
  DROP CONSTRAINT follow_up_queue_reason_type_check;
ALTER TABLE ops.follow_up_queue
  ADD CONSTRAINT follow_up_queue_reason_type_check
  CHECK (reason_type IN (
    'stall', 'engagement_hot', 'deadline_proximity', 'no_owner', 'no_activity',
    'proposal_unseen', 'proposal_bounced', 'proposal_sent', 'date_hold_pressure',
    'draft_aging', 'deposit_overdue', 'unsigned', 'dormant_client',
    'captured_intent'
  ));

-- Index for entity-scoped reads.
CREATE INDEX idx_follow_up_queue_entity_status
  ON ops.follow_up_queue (entity_id, status, created_at DESC)
  WHERE entity_id IS NOT NULL;
```

Existing readers (`getFollowUpQueue`, the cron, owed-today widget) need one-line updates to tolerate `deal_id IS NULL` rows — they currently assume deal scope. Audit these before shipping the migration.

---

## 5. Surface — Entity detail page (primary)

### 5.1 Purpose

Answer "what do I know about this person?" in ≤2 seconds. This is where the feature earns its existence. If this surface isn't excellent, nothing else matters.

### 5.2 Location

- `/network/entity/[id]` — the entity studio
- The `NetworkDetailSheet` panel composition (`src/widgets/network-detail/ui/NetworkDetailSheet.tsx`)

### 5.3 Composition (stacked top-to-bottom)

**A. AI-maintained narrative** (new component: `EntitySummaryCard`)

One paragraph, 2–4 sentences, the Day.ai pattern. Re-generated on entity page load via a lightweight LLM call (`generateObject` against a tight schema):

```
{
  narrative: "Alexa Infranca is a lead coordinator at Pure Lavish Events
              — active relationship over 6 weddings since March. Prefers
              text over email, hates Tuesday meetings. Last touch 3 days
              ago (Ally and Emily wedding).",
  pinned_facts: [
    "prefers text over email",
    "hates Tuesday meetings",
    "lead coordinator at Pure Lavish Events"
  ],
  last_touch: "2026-04-17T14:22:00Z"
}
```

The narrative is keyed by `(entity_id, captures_hash)` and cached until a new capture arrives. Cache-invalidation on: new capture for this entity, entity attributes change, new relationship. LLM call is Haiku, costs ~$0.0005 per regeneration. Users with no captures get an auto-generated narrative from entity attributes + relationships alone (no "no notes yet" dead state).

Pinned facts render as small chips under the narrative. Each can be individually X'd by the user if the AI over-extracted. X → stores a user override that prevents that fact from reappearing on next regeneration.

**B. Recent captures timeline** (new component: `CaptureTimelinePanel`)

Reverse-chron, default 5 visible, expandable. Each row shows:

- Date (relative, e.g. "3d ago")
- Parsed note (not transcript — the distilled version)
- "⋯" menu: Show transcript · Edit · Reassign · Change visibility · Delete
- Visibility badge (private = muted lock icon; workspace = no badge — workspace is assumed)

Empty state: "No notes yet. Tap the composer on the lobby to leave one."

**C. Pending follow-ups from captures** (new, optional)

If any `follow_up_queue` rows exist with `entity_id = this entity` and `reason_type = 'captured_intent'`, show a small "You wanted to:" section. Each row links to the row's deep-link.

### 5.4 Interactions

- **Tap a timeline row** → expand inline to show full transcript + parse details
- **Reassign** → opens a small picker modal with fuzzy entity search (same logic as capture's review card). Selecting a new entity updates `resolved_entity_id`, re-writes `aion_memory` on the new entity, removes from old entity's timeline.
- **Edit transcript** → inline textarea. Save re-generates the embedding.
- **Change visibility** → toggle user/workspace with confirm for user→workspace shift ("team members will be able to see this note").
- **Delete** → confirm dialog. Soft-deletes via `status='dismissed'`.

### 5.5 Scale

At 10–50 captures per entity: render all in an expandable timeline. Above 50: virtualize + show only the summary + "view all" link that opens a scrollable sheet. Most entities will stay under 10. The summary remains the read surface; the timeline is the audit trail.

### 5.6 Privacy enforcement

`CaptureTimelinePanel` query includes `visibility IN (workspace) OR (visibility = 'user' AND user_id = auth.uid())`. RLS enforces the same at the row level — defense in depth.

---

## 6. Surface — Aion chat recall

### 6.1 Purpose

Answer "what do I remember about [entity]?" and fuzzy questions across captures.

### 6.2 Mechanism

Two hooks:

**A. Capture → `aion_memory` auto-write** (already specced in §4.2) — captures become entity-scoped facts Aion reads by default on every chat turn. No new tool needed; the existing `getUserMemories()` in the chat route picks them up.

**B. New chat tool: `recall_about_entity(entity_id, top_k=5)`**

When the user asks a question naming an entity ("what about Alexa?"), the route resolves the entity (via OmniSearch / fuzzy match), calls this tool, which:

1. Fetches last N captures with `resolved_entity_id = entity_id` ordered by `created_at DESC`
2. Queries `cortex.memory` via `match_memory` RPC with query embedding + filter on entity-linked source_refs
3. Merges + dedups by `capture_events.id`
4. Returns top K ranked by recency × relevance

Response cites each capture with a link token: `[capture:abc-123]`. The chat UI renders these as inline pills that deep-link to the entity detail page's timeline, scrolled to that row.

### 6.3 Retrieval ranking

For the ranking layer, the simplest version that avoids the "drowns in low-signal" failure mode the Critic flagged:

```
score = 0.5 * recency_weight(created_at)
      + 0.5 * relevance_weight(cosine_similarity)
recency_weight = 1 / (1 + days_old / 30)    -- halves over 30 days
relevance_weight = cosine(query_embedding, capture_embedding)
```

Cap at top 5 returned. Apply a floor: score < 0.3 → drop. Prevents "Alexa" with 50 low-signal mentions from flooding the answer.

### 6.4 Workspace vs. user scope

Aion chat in `/aion` is user-scoped by default (each user sees their own captures + workspace-shared ones). Never leaks a colleague's `user`-visibility captures. RLS + explicit filter.

### 6.5 "No captures" response

If the user asks about an entity with zero captures, Aion still responds — drawing on entity attributes, relationships, deal history. Captures are ONE input to recall, not the only one.

---

## 7. Surface — Pre-contact brief (a chat skill)

### 7.1 Purpose

When the user is about to contact an entity — they open a deal, click a contact, or ask Aion "prep me for Alexa" — surface the last 3–5 things they captured, plus unresolved intents.

### 7.2 Mechanism

Two triggers:

**A. Explicit chat invocation.** The user types "prep me for [entity]" in Aion chat. Aion invokes the `recall_about_entity` tool (§6) and renders a brief.

**B. Implicit surface on entity detail page.** The `EntitySummaryCard` (§5.3.A) already surfaces this — the narrative IS the prep brief. No second UI needed.

### 7.3 What the brief covers

1. The AI-maintained narrative (same one on the entity page, reused)
2. Top 3 captures in last 90 days, by recency × relevance
3. Any pending `captured_intent` follow-ups for this entity
4. The user's last outbound action (email/SMS from `follow_up_log`)

### 7.4 Not building (v1)

No calendar-triggered auto-brief before meetings (Fellow's pattern). Requires calendar/meeting integration that doesn't exist in Unusonic today. If/when it does, this surface extends naturally.

---

## 8. Surface — Activity feed (filterable)

### 8.1 Purpose

Workspace-wide "what's happening" view. Non-primary for captures — just include them for completeness.

### 8.2 Mechanism

The existing `ActivityFeedWidget` (`src/widgets/activity-feed/ui/ActivityFeedWidget.tsx`) has a polymorphic `ActivityItem` union. Extend:

```typescript
type ActivityItem =
  | { type: 'deal_created'; ... }
  | { type: 'proposal_sent'; ... }
  | { type: 'proposal_signed'; ... }
  | { type: 'crew_confirmed'; ... }
  | { type: 'invoice_paid'; ... }
  | { type: 'event_completed'; ... }
  | { type: 'capture';                          // NEW
      id: string;
      capturedAt: string;
      capturedByUserId: string;
      capturedByName: string | null;
      resolvedEntityId: string | null;
      resolvedEntityName: string | null;
      summary: string;
      visibility: 'user' | 'workspace';
      href: string;
    };
```

Query in `get-activity-feed.ts` adds a branch that reads `cortex.capture_events WHERE visibility = 'workspace' OR user_id = auth.uid()`, maps to ActivityItem. Merged + sorted by timestamp with other event types.

### 8.3 Filter chip

A new `'captures'` filter chip, **OFF by default**. Prevents captures from dominating the unfiltered feed (Critic's 10:1 noise concern). Users who want to see them toggle on.

### 8.4 Not building

No auto-notifications when a capture lands. Never appears as a push notification, email, or inbox item.

---

## 9. Surface — Deal lens

### 9.1 Purpose

When a user opens a deal, captures about the deal's client or venue should surface in context.

### 9.2 Mechanism

The `DealLens` (`src/app/(dashboard)/(features)/crm/components/deal-lens.tsx`) has a `client-identity-card.tsx` that already references `cortex.memory`. Extend to query captures where `resolved_entity_id` is either:

- The deal's `organization_id` (client)
- The deal's `venue_id`
- Any `ops.deal_stakeholders` entity for this deal

Collapsed by default ("3 notes about this client") — expands to show timeline.

### 9.3 Scope

Read-only here. Edits/reassigns happen on the entity detail page. Don't duplicate the full interaction surface.

---

## 10. Privacy model

Three levels of defense.

### 10.1 Column — `visibility`

`cortex.capture_events.visibility` is `'user'` by default, `'workspace'` on opt-in. Every read respects this.

### 10.2 RLS policy

```sql
DROP POLICY IF EXISTS capture_events_select ON cortex.capture_events;

CREATE POLICY capture_events_select ON cortex.capture_events
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND (
      visibility = 'workspace'
      OR (visibility = 'user' AND user_id = auth.uid())
    )
  );
```

### 10.3 App-level filters

Every query that reads captures applies `visibility = 'workspace' OR user_id = auth.uid()` in the WHERE clause, even with RLS — defense in depth matters when a future bug or bypass happens.

### 10.4 Setting visibility at capture time

Three paths:

1. **Verbal marker** — user starts capture with "Just for me," "Personal note," "Private —" and Aion parse picks up the prefix, sets `visibility='user'` even if the workspace default was workspace-shared.
2. **Toggle in the review card** — a small Private/Team pill above the Save button. Default to `user`; toggle to `workspace` for this capture.
3. **Workspace default setting** — per-workspace default in `workspaces.feature_flags` or a dedicated `workspace_capture_settings` key. Solo/small workspaces default to `user`; teams set workspace default to `workspace` if they want shared-by-default (with per-capture override).

Daniel's dogfood workspace is solo → default `user` for safety.

### 10.5 Changing visibility after the fact

From the entity detail page's capture row menu. User→workspace requires an "are you sure" confirmation naming which team members will gain access.

### 10.6 What we explicitly DON'T do

- No per-capture encryption (overkill at B2B SMB)
- No selective-sharing-by-user (too enterprise)
- No audit log of who viewed which capture (not a compliance surface)

---

## 11. Misattribution recovery

The single most important UX surface after the primary entity page. The User Advocate panel ranked it above search, Aion recall, and timeline combined.

### 11.1 The failure mode

Voice → transcript → parse → resolved entity involves 4 opportunities for misattribution. Transcript mangles "Alexa" to "Alexis." Parse picks wrong entity when two candidates exist. LLM hallucinates a connection. Fuzzy match promotes the wrong Alexa because she was more recent. Each step is non-zero error rate. Compound: ~5–15% of captures land on the wrong entity.

### 11.2 The recovery surface

Three places:

**A. Entity detail timeline row** — every capture row has `⋯ → Not this person/company/venue → Pick the right one`. Opens fuzzy-match modal; selecting a new entity rewrites `resolved_entity_id` and re-indexes to the new entity's memory.

**B. Aion chat "it wasn't that person" response** — when Aion recalls a capture and the user says "no, different Alexa," the user can respond "reassign" in chat; the chat tool updates the capture and Aion acknowledges.

**C. Activity feed row** — the capture activity item has the same `⋯ → Reassign` menu.

### 11.3 Visibility of uncertain parses

At capture confirm time, if `CaptureParseResult.confidence < 0.5` OR `match_candidates.length >= 2` with close scores, the review card shows the candidate picker (already built in Phase 2). Post-confirm, these are flagged in the timeline with a small "uncertain" icon — one click re-opens the picker.

---

## 12. Phased build plan

### Phase A — Foundation (2 days)

1. Schema migration: `capture_events.visibility` column, RLS update
2. Confirm-capture writes to `aion_memory` + `cortex.memory` (the three-table pattern)
3. Reassign / edit / delete / change-visibility server actions
4. Composer review-card gains visibility toggle (default user)

### Phase B — Entity detail page (3 days)

5. `EntitySummaryCard` component — AI-maintained narrative + pinned facts, cached by `(entity_id, captures_hash)`
6. `CaptureTimelinePanel` component — reverse-chron rows with per-row menu
7. Integration into `NetworkDetailSheet` and entity studio
8. Pinned-fact override mechanism (user X's a fact → stored override)

### Phase C — Aion chat recall (2 days)

9. New chat tool `recall_about_entity(entity_id, top_k)` — joins aion_memory + cortex.memory, ranks by recency × relevance
10. Entity-resolution in chat ("what about Alexa?" → resolve to entity id)
11. Citation pills in chat responses that deep-link to timeline rows

### Phase D — Activity feed integration (1 day)

12. Extend `ActivityItem` union with `'capture'` type
13. Add query branch + filter chip (OFF by default)

### Phase E — Follow-up queue unlock (1 day)

14. Schema migration: `deal_id` nullable, `entity_id` column, `captured_intent` reason_type
15. Update existing queue readers to tolerate nullable `deal_id`
16. Confirm-capture auto-seeds a queue row when `parsed_follow_up.suggested_when` is an explicit ISO date
17. Owed-today widget displays captured-intent rows alongside deal-based ones

### Phase F — Deal lens + reassign polish (1 day)

18. Captures about a deal's client surface in `client-identity-card`
19. Reassign UX second-pass: loading states, undo toast, batch reassign for audit

### Phase G — Measure and tune (ongoing)

20. Telemetry on: 30-day lookup rate per surface, reassign rate (should be <10%), visibility distribution, capture-dismissal vs confirm rate, queue-seeding acceptance rate

**Total: ~10 working days**, roughly two weeks. Phase A+B alone delivers the primary feature; C–F are compounding wins.

---

## 13. Points of panel disagreement and resolution

### 13.1 Per-entity timeline: build it or cut it?

- **Keep** (User Advocate, Signal Navigator, Field Expert): primary expected home, every analogous product does it
- **Cut** (Critic): low lookup retention, bad-parse calcification risk, scale cliff at ~200

**Resolution:** Build it. The Critic's concerns are real but resolvable:
- Low lookup retention → AI summary above the timeline is the actual primary read surface; timeline is for drill-down (resolves "users don't read logs")
- Bad-parse calcification → misattribution recovery (§11) is first-class (resolves "wrong data calcifies")
- Scale cliff → summary absorbs high-volume cases; timeline paginates (resolves "noise dominates")

Without the timeline, the user's reflex ("I go to Alexa's page") hits a dead end and the feature is abandoned.

### 13.2 Auto-seed follow-up queue: aggressive or conservative?

- **Aggressive** (User Advocate: "silently appears in owed-today")
- **Conservative** (Critic: "20% have clean intent, 80% produce queue junk")

**Resolution:** Conservative. Auto-seed ONLY when `parsed_follow_up.suggested_when` is an explicit ISO date. Captures without a parseable "when" land in the capture's `parsed_follow_up.text` but don't create queue rows. If the user wants to turn a capture into a follow-up retroactively, they do so from the timeline row's menu ("Remind me about this" → opens date picker).

### 13.3 Privacy default: user or workspace?

- **User by default** (Critic, strongly): voice captures are interior monologue, shared-by-default is catastrophic
- **Workspace useful** (User Advocate): team collaboration benefits

**Resolution:** User by default. Workspace by per-capture opt-in via toggle OR verbal marker ("for the team:"). Workspace-level setting for teams that want shared-by-default (with per-capture override). Never start with shared default on a fresh install.

### 13.4 Activity feed: include captures or not?

- **Yes, trivial extension** (Signal Navigator)
- **Risks domination** (Critic: captures outnumber deal events 10:1)

**Resolution:** Include but filter OFF by default. The filter chip lets power users see captures; the default view doesn't get flooded.

### 13.5 How much to distill vs. preserve?

- **Preserve everything** (Rewind model)
- **Distill ruthlessly** (Fellow model, Critic's recommendation)

**Resolution:** Both. Store the raw transcript forever (audit); surface only the AI summary + distilled note by default. Transcript available via "show transcript" on the row. Summary is the product; transcript is the receipt.

---

## 14. File map (anticipated)

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260418_capture_visibility.sql` | Add `visibility` column + RLS update |
| `supabase/migrations/20260418_follow_up_queue_capture_unlock.sql` | Nullable `deal_id` + `entity_id` + `captured_intent` reason_type |
| `src/widgets/network-detail/ui/CaptureTimelinePanel.tsx` | Per-entity timeline component |
| `src/widgets/network-detail/ui/EntitySummaryCard.tsx` | AI-maintained narrative + pinned facts |
| `src/widgets/network-detail/api/get-entity-captures.ts` | Server action, filtered by visibility + entity |
| `src/widgets/network-detail/api/get-entity-summary.ts` | Summary generator (cached LLM call) |
| `src/widgets/network-detail/api/update-capture.ts` | Edit / reassign / visibility / delete |
| `src/app/api/aion/chat/tools/recall-about-entity.ts` | New chat tool |
| `src/app/api/aion/lib/capture-memory-sync.ts` | Write-through from capture → aion_memory + cortex.memory |
| `src/shared/lib/capture-visibility.ts` | Verbal-marker detection helper (user vs workspace) |

### Modified files

| File | Change |
|------|--------|
| `src/widgets/lobby-capture/api/confirm-capture.ts` | Add memory/embedding write-through; handle visibility |
| `src/widgets/lobby-capture/ui/CaptureModal.tsx` | Visibility toggle in review card |
| `src/widgets/network-detail/ui/NetworkDetailSheet.tsx` | Mount EntitySummaryCard + CaptureTimelinePanel |
| `src/app/(dashboard)/network/entity/[id]/EntityStudioClient.tsx` | Same as above for the studio route |
| `src/widgets/activity-feed/ui/ActivityFeedWidget.tsx` | Add capture item rendering + filter chip |
| `src/widgets/dashboard/api/get-activity-feed.ts` | Add capture query branch |
| `src/app/api/aion/chat/route.ts` | Register recall-about-entity tool; load entity captures on entity-naming prompts |
| `src/app/api/aion/lib/embeddings.ts` | Add `'capture'` to source_type union |
| `src/app/api/cron/follow-up-queue/route.ts` | Tolerate deal_id-null captured_intent rows |
| `src/app/(dashboard)/(features)/crm/components/deal-lens.tsx` | Surface captures in client-identity-card |
| `src/widgets/owed-today/ui/OwedTodayWidget.tsx` | Render captured_intent rows alongside deal rows |

---

## 15. Measurement plan

### What we instrument from day 1

| Metric | Purpose | Threshold to act |
|---|---|---|
| Capture volume per user per week | Adoption | <2/week = composer copy needs work |
| 30-day capture lookup rate | Is timeline useful | <20% = timeline may not be worth the investment |
| Reassign rate per capture | Parse quality | >15% = LLM parse needs tuning; consider confidence threshold tightening |
| Capture→queue acceptance rate | Auto-seed quality | <60% acceptance (user doesn't dismiss) = auto-seed too aggressive |
| Visibility distribution (user vs workspace) | Trust signal | If workspace tier stays near-0% in team workspaces = too scary to toggle |
| Time-to-find-capture (telemetry on timeline opens) | Recall speed | >10s = summary + search need improvement |
| "Private capture accidentally made workspace" support tickets | Privacy incidents | >0 is a P0 |

### What we defer measuring

- Long-term summary staleness (until we have workspaces with 6+ months of data)
- Cross-entity search patterns (until Aion recall tool ships and has usage)
- Distillation effectiveness (until we see what actually surfaces vs. what users re-search for)

---

## 16. Decisions log

1. **Entity page is primary home.** User's mental model + industry consensus. Non-negotiable.
2. **AI summary > raw timeline as primary read.** Scales to volume; absorbs bad-parse risk; matches Day.ai/Attio pattern. Raw timeline below for drill-down.
3. **Three-table write on confirm.** `capture_events` (audit) + `aion_memory` (entity-facts) + `cortex.memory` (RAG). Partial failure is OK; all three are best-effort.
4. **Private by default, workspace opt-in.** Blast radius of shared-by-default is catastrophic. Verbal marker or toggle to promote.
5. **Misattribution recovery is first-class.** One-tap reassign from every surface that displays a capture. Above search and recall in priority.
6. **Conservative follow-up seeding.** Only when explicit `suggested_when` ISO date is parsed. No observation-based queue rows.
7. **Activity feed inclusion with filter OFF by default.** Captures available but don't dominate workspace awareness.
8. **Citations required in chat recall.** No orphan claims; every reference links to a `capture_events` row.
9. **No notifications on capture creation.** Write-side is silent; read-side is pull.
10. **No calendar-triggered auto-brief yet.** Requires infra Unusonic doesn't have. When calendar/meeting surfaces ship, this extends naturally.
11. **No client-portal exposure.** Captures are a seller's mental notes; client tier never sees them.
12. **Store raw + surface distilled.** Transcripts persist forever (audit); summary + note are the user-facing layer.

---

## 17. Future work (not scoped here)

- **Pre-meeting calendar trigger** — when Unusonic integrates calendar / meeting surfaces, the `EntitySummaryCard` becomes a pushed brief
- **Weekly / monthly roll-ups** — "What we learned about Alexa this month" distillation email
- **Cross-capture linking** — when a capture mentions another entity (not just the resolved one), edge it in `cortex.relationships`
- **Global search** — if Unusonic gets a global search bar, captures are an index target
- **Voice commands beyond capture** — "show me Alexa" / "prep me for Jim" as inline voice, not just a capture primitive
- **Audio playback** — when we start uploading audio to the `captures` storage bucket (Phase 2 deferred from sales-brief-v2), the timeline row offers a play button
- **Shareable capture links** — a public token URL that surfaces a single capture for a client to see (rare, but useful for audit trails)
- **Team collaboration features** — mentions, reactions, threads on captures. Enterprise feature set; defer until a workspace asks.

---

## 18. References

- `docs/reference/sales-brief-v2-design.md` — capture write side (Phase 1)
- `docs/reference/directory-schema.md` — entity model
- `docs/reference/cortex-schema.md` — memory + relationships + RLS rules
- `docs/reference/follow-up-engine-design.md` — follow-up queue primitive
- `docs/reference/aion-conversational-interface.md` — chat tool inventory
- Research pass (2026-04-17): User Advocate + Field Expert (13 product benchmarks) + Signal Navigator + Critic

Research outputs summarized in §2 and §13. Points of convergence are baked into the spec; points of tension are resolved in §13.
