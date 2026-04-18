# Custom Pipelines

> The pipeline is the business, not the product. Workspaces shape it; Unusonic orchestrates it.

Every production company runs their deal flow differently. A corporate AV shop cares about site surveys and COI approval. A wedding DJ cares about song list lock and final payment. A touring-support vendor cares about advance, load-in, and settlement. Today Unusonic forces all of them into one hardcoded 7-stage flow defined in code. This document replaces that with a workspace-owned pipeline system where stages, tags, and behavior are first-class configuration — and where the hardcoded CRM grid, the separate portal pipeline view, and the check constraint on `public.deals.status` all collapse into one source of truth keyed on stable semantic tags.

Revision history:
- **Draft 1** — initial design. Single doc; 8–10 day estimate; triggers via `ops.domain_events`.
- **Draft 2 (this)** — post-research revision. Introduces stage-tag system as the central architectural primitive; separates trigger firing into its own table (`ops.deal_transitions`); defers multi-pipeline to its own follow-up doc; folds in 20+ hardcoded-slug call-site conversions; coordinates with Follow-Up Engine; estimate now 12–16 days for Phases 0–3.

---

## 1. Goals and Non-Goals

### Goals

- One pipeline per workspace that is **fully customizable** — stages can be added, renamed, reordered, hidden, and colored.
- **Stable semantic tags** on each stage that downstream systems (Aion, webhooks, cron, reports) key on — so a workspace that renames "Proposal Sent" to "Quote Out" doesn't silently break Aion insights or the Follow-Up Engine.
- **Async trigger dispatcher** that fires configured behavior when a deal enters a stage — notifications, tasks, emails, invoice generation, handoff wizard.
- **Portal `/pipeline`** and the CRM production grid read from the same pipeline definitions.
- Pipeline management is **role-gated** via a new capability `pipelines:manage`, exposed as a toggle in the role builder.
- **Existing behavior is preserved** — `deposit_received → handoff`, the lost-reason modal, the override-confirm flow on terminal stages — all survive through the tag + trigger system with no user-visible regression.

### Non-Goals

- **No multiple pipelines per workspace in v1.** Deferred to a follow-up project (see §13). The research pass surfaced that 95% of production companies run one business and one pipeline; multi-pipeline is HubSpot-envy, not requirement-driven at this stage. Multi-pipeline gets its own design doc and review cycle before any code lands.
- **No custom lost reasons in v1.** The 6 hardcoded reasons (`budget`, `competitor`, `cancelled`, `no_response`, `scope`, `timing`) stay. Custom reasons ship with multi-pipeline or as its own small project.
- **No template gallery in v1.** Every workspace gets one default "Sales" pipeline. A "Copy from another pipeline" primitive is shipped from day one so a future template gallery is a small follow-on. No pre-built "Weddings / Corporate AV / Touring" templates.
- **No arbitrary stage automation (conditional branches, delays, multi-step workflows) in v1.** A fixed 5-entry trigger catalog ships. Extensibility comes later, ideally unified with the Follow-Up Engine's cadence infrastructure.
- **Not a migration of `public.deals` out of the grandfathered `public` schema.** That's a separate long-term project (see `CLAUDE.md` grandfathered-tables section).

---

## 2. Scope Decisions (Locked)

These are settled. Flagged so reviewers don't relitigate:

1. **Single pipeline per workspace in v1.** Multi-pipeline → separate doc and project.
2. **Portal merges into the same pipeline.** The current hardcoded portal stages are deleted.
3. **Triggers supported** via a fixed v1 catalog, async dispatcher, coordinated with Follow-Up Engine primitives.
4. **Permission is role-toggleable.** Owner/admin get it by default; role builder grants it to custom roles.
5. **Stage-tag system is the central primitive** — every non-UI consumer keys on tags, not labels, not slugs.
6. **Single default pipeline** seeded on every workspace ("Sales", with the 7 stages that exist today). No template gallery. "Copy from existing pipeline" primitive ships.

---

## 3. The Stage-Tag System (Central Primitive)

**This is the most important architectural decision in the doc. Read first.**

### 3.1 Why tags exist

Today, consumers of `deals.status` key on literal slugs:
- `stall-signal.ts` treats `currentStage === 0` as Inquiry with a 7-day stall threshold
- `follow-up-queue/route.ts` filters `.in('status', ['inquiry','proposal','contract_sent'])`
- Aion evaluators embed `'proposal'` in user-facing copy (*"this inquiry has gone quiet"*)
- DocuSeal webhook writes `status = 'contract_signed'` literal
- Stripe webhook writes `status = 'deposit_received'` literal

If we let workspaces rename stages, every one of these **silently breaks** for every customer who customizes. The research pass catalogued 20+ such call sites.

The fix: every stage carries a `tags text[]` array of stable, semantic identifiers. Consumers key on tags. Labels are for humans. Slugs are for URLs.

### 3.2 The default tag vocabulary

Seeded tags (each stage may hold one or more):

| Tag | Meaning | Seeded onto |
|---|---|---|
| `initial_contact` | First touch, no proposal yet | Inquiry |
| `proposal_sent` | Proposal out, awaiting client review | Proposal Sent |
| `contract_out` | Contract out for signature | Contract Sent |
| `contract_signed` | Signed contract in hand | Contract Signed |
| `deposit_received` | Money in the bank | Deposit Received |
| `ready_for_handoff` | Ready to become a production event | Deposit Received |
| `won` | Deal closed-won (also implied by `kind = 'won'`) | Won |
| `lost` | Deal closed-lost (also implied by `kind = 'lost'`) | Lost |

Tags are workspace-editable but documented with canonical meanings. Renaming a stage does not touch its tags. Removing a tag from a stage is allowed but warned in the UI ("Aion insights that watch for 'proposal_sent' deals will no longer include deals in this stage").

### 3.3 Consumers that key on tags

Every listed consumer is converted in Phase 0 or Phase 2:

| Consumer | Today keys on | After migration keys on |
|---|---|---|
| `stall-signal.ts` ordinal stage index | `currentStage === 0/1/2` + hardcoded thresholds | `stage.rotting_days` column + `stage.sort_order` |
| `follow-up-queue/route.ts` filter | `status IN ('inquiry','proposal','contract_sent')` | `kind = 'working'` |
| Aion `proposal_viewed_unsigned` evaluator | `status = 'proposal'` | `tags @> ARRAY['proposal_sent']` |
| Aion `deal_stale` evaluator | per-status copy strings | `kind = 'working'` + tag-templated copy |
| DocuSeal webhook (`contract_signed`) | writes `status = 'contract_signed'` | resolves stage via `tags @> ARRAY['contract_signed']` |
| Stripe webhook (`deposit_received`) | writes `status = 'deposit_received'` | resolves stage via `tags @> ARRAY['deposit_received']` |
| `handoverDeal` can-handoff gate | `status IN ('contract_signed','deposit_received','won')` | `kind = 'working' AND tags @> ARRAY['ready_for_handoff']` OR `kind = 'won'` |
| Stream tabs (Inquiry/Active/Past) | literal status lists | `kind` + tag composition |
| Dashboard pipeline widget | hardcoded `STAGE_CONFIG` | dynamic from workspace's pipeline |
| Deal Lens PipelineTracker | hardcoded 4-stage map | dynamic from workspace's pipeline + `sort_order` |

### 3.4 Webhook semantic slots

DocuSeal and Stripe don't know about custom stages. They need a stable way to say "move this deal to the workspace's contract-signed stage" regardless of what the workspace called it.

The pattern: webhook handlers resolve the target stage via **tag lookup**:

```ts
// DocuSeal webhook (pseudo)
const targetStage = await resolveStageByTag(deal.pipeline_id, 'contract_signed');
await updateDealStage(deal.id, targetStage.id);
```

`resolveStageByTag(pipeline_id, tag)` returns the single stage in the pipeline holding that tag. If a workspace has removed the tag entirely (no stage tagged `contract_signed`), the webhook no-ops with a logged warning — the workspace has explicitly opted out of the automatic advance.

---

## 4. Data Model

### 4.1 New Tables (`ops` schema)

```sql
CREATE TABLE ops.pipelines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name               text NOT NULL,
  slug               text NOT NULL,
  description        text,
  is_default         boolean NOT NULL DEFAULT false,
  is_archived        boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, slug)
);

-- Exactly one default pipeline per workspace
CREATE UNIQUE INDEX pipelines_one_default_per_workspace
  ON ops.pipelines (workspace_id) WHERE is_default = true;
```

```sql
CREATE TABLE ops.pipeline_stages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id              uuid NOT NULL REFERENCES ops.pipelines(id) ON DELETE CASCADE,
  workspace_id             uuid NOT NULL,
  label                    text NOT NULL,
  slug                     text NOT NULL,
  description              text,
  sort_order               integer NOT NULL,
  kind                     text NOT NULL CHECK (kind IN ('working', 'won', 'lost')),
  color_token              text,
  tags                     text[] NOT NULL DEFAULT ARRAY[]::text[],
  rotting_days             integer,                    -- NULL = no rot detection for this stage
  requires_confirmation    boolean NOT NULL DEFAULT false,
  opens_handoff_wizard     boolean NOT NULL DEFAULT false,
  hide_from_portal         boolean NOT NULL DEFAULT false,
  triggers                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_archived              boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (pipeline_id, slug)
);

-- Deferrable so drag-reorder can temporarily violate uniqueness during swap
CREATE UNIQUE INDEX pipeline_stages_sort_order
  ON ops.pipeline_stages (pipeline_id, sort_order)
  DEFERRABLE INITIALLY DEFERRED;

-- Fast tag lookup
CREATE INDEX pipeline_stages_tags_gin ON ops.pipeline_stages USING GIN (tags);
```

**Invariants enforced via deferred constraint trigger:**

- Every pipeline must have exactly one `kind = 'won'` stage and exactly one `kind = 'lost'` stage.
- `kind = 'won'` and `kind = 'lost'` stages cannot be archived. They can be renamed and reordered.
- `sort_order` gaps are allowed. The drag-reorder RPC renumbers in bulk.

### 4.2 The trigger-firing table

The initial draft proposed reusing `ops.domain_events` for `deal.stage_entered`. **This is structurally impossible** — `ops.domain_events.event_id` is `NOT NULL REFERENCES ops.events(id)`, and a deal in Inquiry has no event. Separate table:

```sql
CREATE TABLE ops.deal_transitions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL,
  deal_id            uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  pipeline_id        uuid NOT NULL REFERENCES ops.pipelines(id),
  from_stage_id      uuid REFERENCES ops.pipeline_stages(id),  -- NULL on deal creation
  to_stage_id        uuid NOT NULL REFERENCES ops.pipeline_stages(id),
  actor_user_id      uuid REFERENCES auth.users(id),
  actor_kind         text NOT NULL CHECK (actor_kind IN ('user', 'webhook', 'system', 'aion')),
  entered_at         timestamptz NOT NULL DEFAULT now(),
  triggers_dispatched_at timestamptz,
  triggers_failed_at timestamptz,
  triggers_error     text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb  -- carries e.g. override_confirmed: true, webhook_event_id, etc.
);

CREATE INDEX deal_transitions_deal_id ON ops.deal_transitions (deal_id, entered_at DESC);
CREATE INDEX deal_transitions_pending_dispatch
  ON ops.deal_transitions (entered_at) WHERE triggers_dispatched_at IS NULL;
```

The transition row is the audit trail **and** the trigger-firing signal. The dispatcher watches `triggers_dispatched_at IS NULL` rows and processes them async (§7).

### 4.3 Changes to `public.deals`

```sql
ALTER TABLE public.deals
  ADD COLUMN pipeline_id uuid REFERENCES ops.pipelines(id),
  ADD COLUMN stage_id    uuid REFERENCES ops.pipeline_stages(id);

CREATE INDEX deals_stage_id_idx ON public.deals(stage_id);
CREATE INDEX deals_pipeline_id_idx ON public.deals(pipeline_id);
```

`status` (text) stays **permanently** as a denormalized fast path for `kind` — i.e. `status` holds the *kind* of the current stage (`'working' | 'won' | 'lost'`) plus the legacy tokens during migration. This is the Pipedrive pattern (Field Expert call). Every `status = 'won'` or `status = 'lost'` query continues to work; the legacy working-stage slugs (`'inquiry'`, `'proposal'`, etc.) are dual-written during Phases 1–2 and retired in Phase 3.

The CHECK constraint on `public.deals.status` is dropped in Phase 3 after all grandfathered readers convert.

### 4.4 RLS

`ops.pipelines`, `ops.pipeline_stages`, and `ops.deal_transitions` follow the `get_my_workspace_ids()` pattern per CLAUDE.md:

```sql
CREATE POLICY pipelines_select ON ops.pipelines FOR SELECT
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY pipelines_write ON ops.pipelines FOR ALL
  USING (workspace_id IN (SELECT get_my_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));
```

Write policies only gate **workspace isolation**. The `pipelines:manage` capability check is enforced at the server-action layer via `member_has_permission`.

`ops.deal_transitions` is INSERT-only from SECURITY DEFINER RPCs and SELECT via workspace. Never directly writable from client.

### 4.5 Workspace Seeding

Two surfaces:

1. **New workspaces** — `setupInitialWorkspace` in [src/app/actions/workspace.ts:83](src/app/actions/workspace.ts:83) calls `ops.seed_default_pipeline(workspace_id)` after creating the workspace row, before the `revalidatePath`.
2. **Existing workspaces** — one-shot idempotent data migration that:
   - Inserts one default pipeline per workspace (skip if `slug = 'sales'` already present)
   - Inserts the 7 default stages with canonical tags (§3.2)
   - Backfills `deals.pipeline_id` + `deals.stage_id` by matching current `deals.status` to the seeded stage slugs
   - Backfills `deals.status` to `kind` values for `won` / `lost`; leaves working-stage slugs intact during Phases 1–2
   - Post-migration assertion: `SELECT COUNT(*) FROM public.deals WHERE stage_id IS NULL` must be 0

### 4.6 Default Pipeline Seed

Every workspace is seeded with one default pipeline named "Sales" (slug: `sales`, `is_default = true`) containing 7 stages:

| slug | label | kind | tags | `rotting_days` | `opens_handoff_wizard` | `requires_confirmation` | triggers |
|---|---|---|---|---|---|---|---|
| `inquiry` | Inquiry | working | `[initial_contact]` | 7 | false | false | — |
| `proposal` | Proposal Sent | working | `[proposal_sent]` | 14 | false | false | — |
| `contract_sent` | Contract Sent | working | `[contract_out]` | 5 | false | false | — |
| `contract_signed` | Contract Signed | working | `[contract_signed]` | null | false | true | — |
| `deposit_received` | Deposit Received | working | `[deposit_received, ready_for_handoff]` | null | true | true | `[]` |
| `won` | Won | won | `[won]` | null | false | true | — |
| `lost` | Lost | lost | `[lost]` | null | false | false | — |

This preserves current behavior exactly. The `opens_handoff_wizard = true` flag on `deposit_received` replaces today's hardcoded check in [prism.tsx:327](src/app/(dashboard)/(features)/crm/components/prism.tsx:327). The `requires_confirmation = true` flags replace the current override-gated statuses in [prism.tsx:458](src/app/(dashboard)/(features)/crm/components/prism.tsx:458).

---

## 5. Stage Kinds

Three kinds: `working`, `won`, `lost`.

- **`working`** — every normal stage. Fully user-editable.
- **`won`** — exactly one per pipeline. Renamable, not removable. Semantic "deal is closed-won." Revenue roll-ups count `kind = 'won'`.
- **`lost`** — exactly one per pipeline. Renamable, not removable. Entering a `kind = 'lost'` stage opens the lost-reason modal.

The kind is the behavior contract. The label is the user-facing name. Renaming "Won" → "Booked" doesn't break anything because every finance/analytics caller checks `kind`, never label.

**Schema extensibility note:** the CHECK constraint allows adding kinds later (e.g. `paused` for on-hold deals that shouldn't count as working). Not in v1 scope but reserved.

---

## 6. Per-Stage Flags (Vertical Semantics)

Beyond kind and tags, each stage carries boolean flags that encode event-production domain behavior. All nullable/false by default; admins opt in per stage.

| Flag | Meaning | Replaces |
|---|---|---|
| `opens_handoff_wizard` | On entry, open the deal-to-event handoff wizard for the actor | Hardcoded `status === 'deposit_received'` check |
| `requires_confirmation` | On entry, show the override-confirm modal | Hardcoded `['contract_signed','deposit_received','won']` list |
| `hide_from_portal` | Do not show deals in this stage on `/(portal)/pipeline` | Prevents portal overwhelm (User Advocate) |

Reserved for Phase 3 or later (schema-ready, not wired in v1):

| Flag | Meaning |
|---|---|
| `locks_crew` | Crew assignments become firm; affects availability |
| `locks_inventory` | Gear allocated (once equipment module exists) |
| `requires_contract` | Blocks entry if no signed contract exists |
| `revenue_recognized` | Counted in booked revenue vs. forecast |

These are Flex Rental Solutions-style side-effect flags (Field Expert). Not wired in v1 but the schema supports them so follow-up work doesn't need a migration.

**`rotting_days` column** replaces the hardcoded thresholds in `src/shared/lib/stall-signal.ts:53`. Each stage can declare "a deal in this stage is stale after N days" — or `NULL` for no rot detection. Defaults match today's behavior exactly: `inquiry=7`, `proposal=14`, `contract_sent=5`, everything else `null`. Stall detection is preserved verbatim.

---

## 7. Triggers

### 7.1 Model

Triggers fire when a deal enters a stage. Mechanism:

1. `update_deal_stage` RPC commits the `stage_id` change on `public.deals` and inserts a row into `ops.deal_transitions` in the same transaction.
2. A dispatcher (`src/shared/lib/pipeline-triggers/dispatch.ts`) polls for `triggers_dispatched_at IS NULL` rows **async** — triggered by a short-interval cron (or pg LISTEN/NOTIFY if the infrastructure is present).
3. For each transition, the dispatcher loads the target stage's `triggers` JSONB array and runs each trigger handler.
4. On completion, stamps `triggers_dispatched_at`. On failure, stamps `triggers_failed_at` + error. Stage change already committed; trigger failure never reverses the deal move.

**Async is mandatory.** Inline dispatch was proposed in Draft 1 and is wrong for three reasons: (1) Resend `send_email` latency can be 1–3s p99; (2) User Advocate trust concern — users must see the deal move immediately, then the trigger happens; (3) industry norm. Every major CRM (HubSpot, Pipedrive, Close, Zoho) runs triggers async.

### 7.2 Trigger safety tiers

User Advocate surfaced a real trust risk: a client receiving an unexpected invoice because the admin wired an automation six months ago = uninstall.

Triggers split into two tiers:

**Internal (fire silently):**
- `notify_role` — in-app notification
- `create_task` — internal task
- `update_deal_field` — set/increment a deal field (e.g. stamp `won_at`)

**Outbound (confirm-before-fire by default):**
- `send_email` — email to a client
- `send_deposit_invoice` — generate and send invoice via `finance.spawn_invoices_from_proposal`
- `trigger_handoff` — opens the handoff wizard (user-visible, not headless — §7.4)

Outbound triggers fire inside a confirmation flow:
- When a user moves a deal into a stage with outbound triggers, a modal surfaces: *"Moving to Deposit Received will: open the handoff wizard, send a $5,000 deposit invoice to alex@acme.com. Continue?"*
- The modal is driven by the `requires_confirmation` flag (§6). Admins can disable confirmation per-stage if they explicitly want silent outbound.
- When a webhook (DocuSeal, Stripe) causes the transition, outbound triggers fire immediately without a confirm — webhooks are already a confirmation from the client.
- An **undo toast** appears for 15 seconds post-trigger. Undoing reverses the deal move AND cancels pending trigger side-effects (email is yanked if not yet delivered; invoice is voided).
- Every trigger result is written to a visible **deal activity log** on the Deal Lens — audit trail lives with the deal, not in a system dashboard.

### 7.3 v1 Catalog

| type | Tier | What it does | Config |
|---|---|---|---|
| `trigger_handoff` | outbound | Opens the deal-to-event handoff wizard for the user who moved the deal | none |
| `send_deposit_invoice` | outbound | Auto-generates a deposit invoice from the deal's accepted proposal via `finance.spawn_invoices_from_proposal` | `{ amount_basis: 'deposit' \| 'balance' }` |
| `notify_role` | internal | Sends an in-app notification to every workspace member with a given role | `{ role_slug: string, message?: string }` |
| `create_task` | internal | Creates a task in the workspace task list tied to the deal | `{ title: string, assignee_rule: 'owner' \| 'deal_rep' \| 'crew_chief' }` |
| `update_deal_field` | internal | Set/clear a deal field (e.g. stamp `won_at`, set `close_date = today()`) | `{ field: string, value: any \| 'now()' }` |

**`send_email`** is NOT in v1 — it overlaps too much with the Follow-Up Engine's cadence actions (§11). Customers wanting "send a templated email on stage entry" should enroll the deal into a follow-up cadence via `create_task` → manual follow-up, or wait for Phase 2 of the Follow-Up Engine.

### 7.4 `trigger_handoff` specifically

Not a headless background trigger — it still opens the wizard UI for the user who moved the deal. Implementation: when the dispatcher processes a `trigger_handoff`, it writes a signal to `cortex.user_notifications` (or equivalent) that the user's client picks up via realtime subscription and opens the wizard.

For webhook-initiated transitions (e.g. Stripe marks deposit received), `trigger_handoff` doesn't open a wizard (no user session) — instead it signals the deal as "handoff-ready" and surfaces a prominent action card in the CRM. The wizard runs the next time a user opens the deal.

### 7.5 Deduplication

A deal bounced `inquiry → proposal → inquiry → proposal` in ten seconds must not fire `proposal`-stage triggers twice. The dispatcher checks `ops.deal_transitions` for a prior transition into the same stage within a configurable window (default: 60 seconds). Bounce-fires are logged but skipped.

---

## 8. Permissions

### 8.1 New Capability

Add `pipelines:manage` to three places:

1. **`ops.workspace_permissions` DB row:** key, module, label, description, scope_support = false.
2. **TypeScript registry:** [src/shared/lib/permission-registry.ts:14](src/shared/lib/permission-registry.ts:14) — add `pipelines:manage` to the `CapabilityKey` union.
3. **Role builder metadata:** [src/features/role-builder/model/permission-metadata.ts:29](src/features/role-builder/model/permission-metadata.ts:29) — add UI metadata entry.

All three must be updated in the same PR. Missing any one leaves the feature half-wired.

Seeded to `owner` + `admin` system roles via `ops.workspace_role_permissions` in the Phase 1 migration.

### 8.2 Enforcement

Server actions gate on `member_has_permission(workspaceId, 'pipelines:manage')`:

- `create_pipeline`, `update_pipeline`, `archive_pipeline` (v1 ships pipeline-level ops even though only default pipeline exists — reuse for Phase 4)
- `create_stage`, `update_stage`, `archive_stage`, `reorder_stages`, `update_stage_triggers`, `update_stage_tags`

**Moving a deal between stages is NOT gated by `pipelines:manage`** — that's existing `deals:edit:*` capabilities. This capability is strictly about *pipeline structure*.

### 8.3 Role-builder escalation guard

Granting permissions requires `workspace:roles:manage`. A user with `pipelines:manage` alone cannot edit roles to grant themselves or others additional permissions. Guardian must add an explicit test for this.

---

## 9. Surface Changes

### 9.1 Copy: "Pipeline" vs "Deal Boards"

Per User Advocate: the word "pipeline" is SaaS-native and trips first-time production-company owners. Compromise:

- **Internal / code / settings page:** "Pipeline" (the technical term)
- **User-facing / dashboard / CRM grid / portal:** "Deal flow" or "Deal board" as the section header
- **Role builder capability label:** "Manage deal flow" (even though code key is `pipelines:manage`)

Specific UI labels to audit in Phase 2 build.

### 9.2 CRM Production Grid

[production-grid-shell.tsx](src/app/(dashboard)/(features)/crm/components/production-grid-shell.tsx) fetches stages from the workspace's default pipeline instead of the hardcoded array. Column order by `sort_order`. Column colors by `color_token`. Empty stages are rendered but visually de-emphasized. Deal cards show **age in stage** — derived from the latest `ops.deal_transitions.entered_at` for the deal (this is a User Advocate mandatory).

No pipeline-switcher UI in v1 (single pipeline).

### 9.3 Prism Status Dropdown

[prism.tsx:458](src/app/(dashboard)/(features)/crm/components/prism.tsx:458) renders the workspace's pipeline stages dynamically. Override-confirm fires on stages with `requires_confirmation = true`. Lost-reason modal fires on `kind = 'lost'` stages. No hardcoded status list remains.

### 9.4 Deal Lens

[deal-lens.tsx:41](src/app/(dashboard)/(features)/crm/components/deal-lens.tsx:41) PipelineTracker reads stages dynamically. Completed-vs-upcoming driven by `sort_order`. Age-in-stage visible on the currently-active stage pill.

### 9.5 Dashboard Pipeline Widget

[get-deal-pipeline.ts:24](src/widgets/dashboard/api/get-deal-pipeline.ts:24) drops `STAGE_CONFIG`. Reads the workspace's default pipeline. Counts grouped by stage `sort_order`; revenue roll-up grouped by `kind`.

### 9.6 Stream tabs (Inquiry / Active / Past)

[stream.tsx:30](src/app/(dashboard)/(features)/crm/components/stream.tsx:30) currently filters:
- Inquiry: `status in ('inquiry', 'proposal')`
- Active: events + `status = 'contract_sent'`
- Past: `status in ('won', 'lost')`

Post-migration:
- **Inquiry:** `kind = 'working' AND tags @> ARRAY['initial_contact']` OR `tags @> ARRAY['proposal_sent']`
- **Active:** events + (`kind = 'working' AND tags @> ARRAY['contract_out']` or later in sort order)
- **Past:** `kind IN ('won', 'lost')`

Tab definitions themselves are still hardcoded in code (tabs are product-defined, not workspace-defined). Only the filter conditions change.

### 9.7 Portal `/pipeline`

[pipeline-view.tsx:32](src/app/(portal)/pipeline/pipeline-view.tsx:32) deletes its separate hardcoded stage list. Reads the workspace's default pipeline, filters to employee's owned deals (`owner_entity_id = personEntity.id`). Stages with `hide_from_portal = true` are hidden. Deals in `kind = 'lost'` stages are hidden from the main view; accessible via a "Lost deals" filter.

No pipeline switcher in the portal.

### 9.8 Follow-Up Queue Cron

[follow-up-queue/route.ts:135](src/app/api/cron/follow-up-queue/route.ts:135) filter becomes `kind = 'working'` (returns all open deals for the cron to evaluate).

Per-deal stall evaluation inside the cron switches from hardcoded thresholds to `stage.rotting_days`.

### 9.9 Aion Insight Evaluators

[insight-evaluators.ts:166](src/app/api/aion/lib/insight-evaluators.ts:166), :379, :443, :453 — evaluators rewrite to key on tags.

User-facing copy that today embeds stage-specific strings ("this inquiry has gone quiet") switches to tag-templated copy:
- `deals.stage.tags @> ['initial_contact']` → "this lead has gone quiet"
- `deals.stage.tags @> ['proposal_sent']` → "this proposal has gone quiet"
- etc.

### 9.10 Webhooks

[stripe-webhooks/client-billing/route.ts:244](src/app/api/stripe-webhooks/client-billing/route.ts:244) and [docuseal-webhook/route.ts:219](src/app/api/docuseal-webhook/route.ts:219) switch from writing literal status slugs to calling `resolve_stage_by_tag(pipeline_id, 'deposit_received')` / `('contract_signed')` and writing the resolved `stage_id`.

### 9.11 Deal Creation Path

[create-gig-modal.tsx](src/app/(dashboard)/(features)/crm/components/create-gig-modal.tsx) — new deals land in the workspace's default pipeline + the first `kind = 'working'` stage (by `sort_order`).

[src/app/api/aion/chat/tools/actions.ts:48](src/app/api/aion/chat/tools/actions.ts:48) — Aion-created deals follow the same rule.

### 9.12 New Settings UI

**Route:** `/(dashboard)/settings/pipeline` (singular in v1 — multi-pipeline adds the plural route in its own project)

- Direct to the single pipeline's detail page (no list view for v1)
- Draggable stage list
- Per-stage drawer: label, slug, color, kind (readonly for non-working), tags editor, rotting_days, flags (`opens_handoff_wizard`, `requires_confirmation`, `hide_from_portal`), triggers
- "Add stage" primary action
- Archive stage: archive-only, never delete

Gated on `pipelines:manage`. Hidden from users who lack it.

### 9.13 Role Builder

One new capability row. Label: "Manage deal flow." Seeded on owner + admin. No structural changes.

---

## 10. `won_at` / `lost_at` Write Path

Today these timestamps are stamped inline when `updateDealStatus` transitions to `won` or `lost`. Post-migration: stamped by the `update_deal_stage` RPC when the target stage has `kind = 'won'` (stamp `won_at = now()`, clear `lost_at`) or `kind = 'lost'` (stamp `lost_at = now()`, clear `won_at`). Exclusive.

These columns stay on `public.deals` permanently as denormalized fast paths for reporting.

---

## 11. Follow-Up Engine Coordination

**This doc explicitly shares infrastructure with the Follow-Up Engine (see `docs/reference/follow-up-engine-design.md`).**

Signal Navigator flagged that the trigger system overlaps exactly with Follow-Up Engine v5's `ops.follow_up_cadences` + `ops.follow_up_rules`. Shipping parallel dispatchers = future technical debt. Coordination strategy:

### 11.1 Shared primitive registry

The 5 triggers in §7.3 are **primitives**. A primitive is a single discrete action (`notify_role`, `create_task`, `update_deal_field`, `trigger_handoff`, `send_deposit_invoice`). Primitives live in `src/shared/lib/triggers/primitives/*.ts` and export a uniform interface:

```ts
interface TriggerPrimitive<Config> {
  type: string;
  tier: 'internal' | 'outbound';
  schema: ZodSchema<Config>;
  run: (config: Config, context: TriggerContext) => Promise<TriggerResult>;
  undo?: (result: TriggerResult, context: TriggerContext) => Promise<void>;
}
```

### 11.2 Two consumers of the primitive registry

- **Pipeline stage triggers** (this doc): configured on a stage, fire on `deal_transitions` insert.
- **Follow-Up Engine cadence steps** (Follow-Up Engine v5): configured on a cadence step, fire on cadence schedule tick.

Both consumers run the same primitive implementations. A bug fix in `notify_role` flows to both. A new primitive (e.g. `send_email` when it ships) is immediately available to both.

### 11.3 Enrollment as a stage trigger

A natural v1.1 primitive: `enroll_in_cadence` — on stage entry, enroll the deal in a named follow-up cadence. This makes pipeline triggers and cadence enrollments composable. Not in v1 scope but reserved.

### 11.4 Dispatcher unification

Two dispatchers in v1 (pipeline triggers / cadence steps), but they live in the same directory tree and share utilities. When the job queue lands (per Follow-Up Engine Phase 5), both migrate to the same queue infrastructure in a single PR.

---

## 12. Migration Plan

Five phases. Each has a rollback point. Phase 0 is a prerequisite — runs and ships before any pipeline work lands.

### Phase 0 — Decouple stall-signal and follow-up cron from hardcoded ordinals (~2 days)

Non-breaking, zero user-visible change:

1. Add `rotting_days integer` column to a temporary stage-metadata structure OR hardcode a map from current status slug to rotting days (7/7/5/5/null/null/null).
2. Rewrite `src/shared/lib/stall-signal.ts` to read from this map instead of `currentStage === 0/1/2` branches.
3. Rewrite `src/app/api/cron/follow-up-queue/route.ts:135` filter to accept a list of status tokens from a constant (prepares for Phase 2 switch to `kind = 'working'`).
4. Rewrite `src/shared/lib/follow-up-priority.ts` `STATUS_TO_STAGE` to read from the same constant.

**This ships first, alone.** The purpose is to prove the stall-signal refactor works in production before pipeline customization exposes any bug.

**Rollback:** straightforward — constants revert to hardcoded values.

### Phase 1 — Schema + Seed + Backfill (~2 days, non-breaking)

1. Migration: create `ops.pipelines`, `ops.pipeline_stages`, `ops.deal_transitions` with RLS, tags, GIN index, deferrable sort_order.
2. Add `pipeline_id`, `stage_id` to `public.deals` (nullable).
3. Seed every workspace with a "Sales" pipeline + 7 stages (idempotent).
4. Backfill `pipeline_id` and `stage_id` from existing `status`.
5. Insert a synthetic `ops.deal_transitions` row for every deal's current state (so age-in-stage works from day one).
6. Add `pipelines:manage` to `ops.workspace_permissions` + seed onto owner/admin.
7. Add `pipelines:manage` to `permission-registry.ts` + `permission-metadata.ts`.
8. Type regen.

**No app code reads from the new tables yet. System stays on `deals.status`.**

**Rollback:** drop the new columns/tables/rows. No user data lost.

### Phase 2 — Reads Switch + Dual-Write + Settings UI (~5 days)

1. `updateDealStatus` + `handoverDeal` dual-write `status` AND `stage_id`. Insert `ops.deal_transitions` on every change.
2. Reads switch to `stage_id` in: Prism dropdown, Deal Lens, dashboard widget, Stream tabs, production grid.
3. Settings UI: single-pipeline detail, drag-reorder, per-stage drawer (label/color/tags/flags/rotting_days — NO triggers UI yet).
4. Webhook handlers (Stripe, DocuSeal) switch to `resolve_stage_by_tag` and write `stage_id`.
5. Aion evaluators switch to tag-based queries.
6. Follow-up cron filter switches to `kind = 'working'`.

**Rollback:** feature-flag the read switch per surface. Dual-write is always safe.

### Phase 3 — Triggers + Portal Merge + Cleanup (~4 days)

1. Trigger dispatcher ships. Catalog: `trigger_handoff`, `send_deposit_invoice`, `notify_role`, `create_task`, `update_deal_field`.
2. Confirm-before-fire modal + undo toast + deal activity log.
3. Triggers UI in settings.
4. Portal `/pipeline` switches to pipeline-driven stages with `hide_from_portal` filter.
5. Drop the CHECK constraint on `public.deals.status`.
6. Stop writing legacy working-stage slugs to `status`; now holds only `working` / `won` / `lost`.

**Rollback:** dispatcher feature-flagged off; portal can revert to hardcoded stages.

### Phase 4 — Multi-Pipeline (~separate project, own doc)

Not part of this build. Needs its own design doc, research pass, and review cycle. Covers: creating additional pipelines, moving deals between pipelines, per-pipeline dashboard widget, pipeline switcher in the CRM grid.

---

## 13. Open Questions

1. **Exact confirm-modal copy for outbound triggers.** User Advocate flagged this as the make-or-break trust surface. Design review needed.
2. **Bounce-dedup window.** Default 60s in §7.5 — is that right? Could be as tight as 5s (drag-by-accident) or as loose as 5min.
3. **Tag customization UI.** Should admins be able to *add* custom tags beyond the seeded vocabulary? v1 leaning no — custom tags have no consumers, so they'd do nothing. But documenting the canonical vocabulary somewhere users can read it is important.
4. **Deal-activity-log primitive.** Do we already have a UI pattern for "list of things that happened on this deal"? If not, Phase 3 includes building it.
5. **Undo toast implementation.** `cancelled` states on pending email sends + invoice voiding are real integration work. Scoped into the 4-day Phase 3 estimate; may need expansion.
6. **Copy: "Deal flow" vs "Deal board" vs something else.** User Advocate recommends "Deal boards." Industry norm is "Pipeline." Decide before Phase 2 settings UI builds.

---

## 14. Risks

- **Phase 0 stall-signal refactor hides bugs that only show up under real load.** Ship isolated. Monitor in production for a full week before Phase 1.
- **Phase 2 dual-write window** is where every migration project loses time. The audit surface is all 20+ readers listed in §3.3 and §9 — each must be verified. Tests are mandatory for each converted consumer.
- **Trigger system adds a new failure surface.** Architectural invariant: **trigger failure never blocks the stage change.** Enforced by the dispatcher being async — by the time it runs, the stage change has already committed.
- **Dropping the CHECK constraint is one-way.** Once workspaces use custom slugs, rollback requires data mutation. Mitigation: validate Phase 2 in staging with a full set of workspace fixtures before Phase 3 ships.
- **Outbound trigger trust collapse.** One wrongly-configured client invoice = uninstall. Mitigation: confirm-by-default + undo toast + visible activity log. Confirm-by-default must be enforced, not opt-in.
- **Renaming a `won` stage breaks analytics that hardcode the string.** Audit every reporting query + external integration before Phase 3. Enforce: all finance/analytics queries key on `kind`, never label.
- **Multi-pipeline deferred means re-plumbing for Phase 4.** Accepted — the schema is designed to support it (pipeline_id FK, pipelines table), but the settings UI + grid must be rebuilt as list-view when multi-pipeline ships. This is explicit, not accidental.
- **Stage-tag system is novel for the codebase.** Requires discipline to maintain — every new evaluator must ask "what tag does this need?" not "what label does this need?" Document the pattern in the relevant architectural guide.

---

## 15. Work Breakdown (Estimate)

| Phase | Work | Days |
|---|---|---|
| 0 | Stall-signal / follow-up cron decoupling | 2 |
| 1 | Schema, RLS, seed, backfill, permission registration | 2 |
| 2 | Dual-write, read switch across 20+ consumers, settings UI (no triggers) | 5 |
| 3 | Trigger dispatcher, confirm+undo+log UX, portal merge, drop constraint | 4 |
| **Total Phases 0–3** | | **13** |
| 4 | Multi-pipeline (own doc + own project) | — |

Estimate range: **12–16 days.** Research pass confirmed the 8–10 from Draft 1 was 30–40% low. The range widens on (a) how much existing drag-reorder / activity-log primitive work the codebase already has, (b) how long QA + audit of the 20+ converted consumers actually takes in practice.

**Recommended phasing:** Ship Phase 0 → wait a week for prod signal → Ship Phase 1+2 together → wait a week for prod signal → Ship Phase 3. Three releases. Reduces blast radius.

---

## 16. References

- `CLAUDE.md` — schema rules, RLS patterns, grandfathered tables, permission system
- `docs/reference/follow-up-engine-design.md` — infrastructure this doc coordinates with (§11)
- `docs/reference/aion-daily-brief-design.md` — Aion evaluators converted in §9.9
- `docs/reference/sales-brief-v2-design.md` — additional Aion evaluators affected
- `docs/reference/sales-dashboard-design.md` — aligned with this work
- `docs/reference/crm-page-state-and-flow.md` — Stream tabs and Prism flow
- `docs/reference/deal-to-event-handoff-wizard-upgrade.md` — handoff path replaced by `trigger_handoff`
- `docs/reference/employee-portal-vision.md` — portal merge alignment
- `docs/reference/design/copy-and-voice-guide.md` — copy choices in §9.1
- `docs/reference/design/color-system.md` — stage color token constraint
- `docs/reference/design/drag-reorder-system.md` — reorder primitive
- `docs/reference/design/overlay-and-modal-system.md` — settings drawer, confirm modal
- [src/widgets/dashboard/api/get-deal-pipeline.ts:24](src/widgets/dashboard/api/get-deal-pipeline.ts:24) — current hardcoded `STAGE_CONFIG`
- [src/app/(dashboard)/(features)/crm/components/prism.tsx:31](src/app/(dashboard)/(features)/crm/components/prism.tsx:31) — current status dropdown
- [src/app/(dashboard)/(features)/crm/components/deal-lens.tsx:41](src/app/(dashboard)/(features)/crm/components/deal-lens.tsx:41) — current pipeline tracker
- [src/app/(dashboard)/(features)/crm/actions/handover-deal.ts:50](src/app/(dashboard)/(features)/crm/actions/handover-deal.ts:50) — handoff path
- [src/app/(dashboard)/(features)/crm/components/stream.tsx:30](src/app/(dashboard)/(features)/crm/components/stream.tsx:30) — Stream filter tabs
- [src/app/(portal)/pipeline/pipeline-view.tsx:32](src/app/(portal)/pipeline/pipeline-view.tsx:32) — portal pipeline view to merge
- [src/shared/lib/stall-signal.ts:53](src/shared/lib/stall-signal.ts:53) — ordinal coupling refactored in Phase 0
- [src/shared/lib/follow-up-priority.ts:4](src/shared/lib/follow-up-priority.ts:4) — `STATUS_TO_STAGE` refactored in Phase 0
- [src/app/api/cron/follow-up-queue/route.ts:135](src/app/api/cron/follow-up-queue/route.ts:135) — filter rewrite
- [src/app/api/aion/lib/insight-evaluators.ts:166](src/app/api/aion/lib/insight-evaluators.ts:166) — tag-based rewrite
- [src/app/api/stripe-webhooks/client-billing/route.ts:244](src/app/api/stripe-webhooks/client-billing/route.ts:244) — semantic slot resolution
- [src/app/api/docuseal-webhook/route.ts:219](src/app/api/docuseal-webhook/route.ts:219) — semantic slot resolution
- [src/features/role-builder/model/permission-metadata.ts:29](src/features/role-builder/model/permission-metadata.ts:29) — capability registry
- [src/shared/lib/permission-registry.ts:14](src/shared/lib/permission-registry.ts:14) — TS capability union
- [src/app/actions/workspace.ts:83](src/app/actions/workspace.ts:83) — workspace creation seed hook
- `src/shared/lib/domain-events/` — existing event system (NOT used for deal transitions per §4.2)
- Migration `20260228063445` — `ops.workspace_permissions` normalized schema
- Migration `20260324000200_expand_deals_status_check.sql` — current status CHECK to drop in Phase 3
