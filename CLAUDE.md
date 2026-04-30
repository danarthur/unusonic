# CLAUDE.md — Unusonic

This file is the source of truth for how Claude Code operates in this repo.

---

## What We're Building

**Unusonic** is a B2B SaaS platform for event production — a full OS for deals, logistics, talent, finance, and run-of-show for production companies and touring artists.

The data model is a **knowledge graph**. People, companies, venues, and workspaces are Nodes in `directory.entities`. Relationships are Edges in `cortex.relationships`. The AI layer (Aion) reads from `cortex.memory`.

- **Stack:** Next.js 16.1 (App Router), React 19, Supabase (SSR), Tailwind v4, Framer Motion, Zustand, TanStack Query, Zod v4, Vercel AI SDK
- **Auth:** Passkeys (SimpleWebAuthn) + sovereign recovery (BIP39 + Shamir)
- **Architecture:** Feature-Sliced Design (FSD)
- **Multi-tenancy:** Every data operation scoped to `workspace_id`
- **AI Agent:** Aion (not Arthur — update legacy references)

---

## Agent Teams

Default to **working alone**. Teams cost significantly more tokens. Only use a team when the task spans 3+ files/layers, has meaningful security/data-integrity risk, AND is sequential by phase.

**Good fits:** multi-phase features, auth/RLS work, Stripe integration, Aion wiring.
**Work alone:** single file changes, bug fixes, styling, research, schema migrations.

If the user asks for a team but the task doesn't warrant it, say so directly.

**Default team: Builder + Guardian.** Add others when warranted. Max four active agents.

Full role specs, checklists, and the Connector data-connections table: **`docs/reference/agent-team-roles.md`**

### Team composition summary

| Role | Agent | When |
|---|---|---|
| Planner | `Plan` | 3+ files or unclear path |
| Builder | `general-purpose` | Every build |
| Guardian | `general-purpose` | Every build (security, RLS, types) |
| Connector | `general-purpose` | Shared data types or cross-page data |
| Test Writer | `general-purpose` | After Guardian — auth, finance, tokens |
| Scribe | `general-purpose` | Session end when shipping |
| Researcher | `Explore` | Significant codebase exploration needed |

Pipeline: `Planner → Builder → Guardian → Connector → Test Writer → Scribe`

### Design Team

Invoke: **"call the design team on [page/component]"**. Pipeline: Scout → Builder → Reviewer. Full specs in `docs/reference/agent-team-roles.md`.

---

## Common Commands

```bash
npm run dev            # Dev server (webpack, port 3000)
npm run dev:turbo      # Dev server (turbopack, faster)
npm run build          # Production build
npm run db:types       # Regen types → src/types/supabase.ts. Convenience
                       # aliases (Proposal, ProposalItem, Package, CueType,
                       # PaymentMethod) are auto-appended by the gen script
                       # since PR 11a — no manual step needed.
npm run lint           # ESLint
npm run test           # Vitest
rm -rf .next           # Clear build cache (first step when build fails)
```

Migrations: `supabase/migrations/`. Debug SQL: `scripts/debug/` (run in SQL Editor, not app code).

---

## Architecture: Feature-Sliced Design (FSD)

Layers import only from layers **below**: `App → Widgets → Features → Entities → Shared`

| Layer | Location | Purpose |
|---|---|---|
| App | `src/app/` | Routing, layouts only |
| Widgets | `src/widgets/` | Smart compositions (data + UI) |
| Features | `src/features/` | User actions (e.g. `EditGigForm`) |
| Entities | `src/entities/` | Domain logic (e.g. `GigCard`) |
| Shared | `src/shared/` | Primitives (Button, SupabaseClient) |

**No ghost folders.** Don't reference or create paths that don't exist.

---

## Database Architecture

### Six Schemas

**Do not create new tables in `public`.**

| Schema | Domain | Contents |
|---|---|---|
| `directory` | Identity | `directory.entities` — people, companies, venues |
| `ops` | Operations | Projects, events, assignments, logistics, telemetry (`ops.aion_events` — append-only Aion event log, monthly partitioned) |
| `finance` | Commercials | Invoices (`finance.invoices`, `invoice_line_items`), payments (`finance.payments`), QBO sync (`qbo_connections`, `qbo_entity_map`, `sync_jobs`, `qbo_sync_log`), tax rates, bills (AP, schema-only), Stripe webhook dedup, **referrals** (`finance.referrals` + `log_referral`/`delete_referral` RPCs — moved from cortex in Wk 16). See `docs/audits/billing-redesign-final-plan-2026-04-11.md`. |
| `cortex` | Intelligence | Graph edges (`cortex.relationships`), AI memory/RAG (`cortex.memory`), Aion data substrate per workspace (`cortex.aion_sessions`, `aion_messages`, `aion_proactive_lines`, `aion_user_signal_mutes`, `aion_workspace_signal_disables`, `aion_insights`). User-facing RPCs: `cortex.dismiss_aion_proactive_line`, `mark_pill_seen`, `list_aion_proactive_history`, `migrate_session_scope`, `is_user_signal_muted`, etc. **Scope discipline:** cortex is for graph edges + AI memory + Aion data substrate. Domain-specific tables (entity metadata → `directory.*`, financial ledgers → `finance.*`, pre-auth recovery → `public.*`) belong in their proper schema, not cortex. Captures, lobby pins, ui_notices, consent_log, and feature_access_requests stay in cortex because the AI layer reads/writes them as intelligence-adjacent UX state. |
| `aion` | Admin / observability | Cross-workspace admin telemetry RPCs (`aion.metric_brief_open_kill_check`, `metric_dismiss_rate`, `metric_hit_rate`, `metric_tool_depth`, `metric_pill_click_through`, `metric_cost_per_seat`, plus `roll_aion_events_partitions` system maintenance). Service-role only by default; admin route handlers gate via `isAionAdmin()`. **Distinct from `cortex.*`** — cortex is per-workspace data substrate; `aion.*` is cross-workspace observability. |
| `public` | Legacy | Active migration to above schemas. No new tables. |

**Exception:** `public.invitations`, `passkeys`, `guardians`, `recovery_shards` live in `public` because they operate before workspace context (pre-auth boundary). The same boundary applies to recovery RPCs — `public.reset_member_passkey` (owner-mediated crew recovery, moved from cortex in Wk 16) lives in `public.*` for the same reason.

### Where new schema objects go

- **New people / companies / venues / contacts** → `directory.entities` + `cortex.relationships` edges. Never specific FK columns.
- **New project / event / assignment / logistics tables** → `ops.*` (agnostic to human details — rates, titles, perms live on edges, not columns).
- **New invoice / payment / tax / bills tables** → `finance.*`.
- **New Aion user-facing RPC** (called from chat/UI on a workspace's data) → `cortex.*`. Workspace-scoped.
- **New Aion admin/observability/telemetry RPC** (cross-workspace aggregate, admin-only via `isAionAdmin()`) → `aion.*`. Default REVOKE PUBLIC/anon/authenticated; GRANT only to `service_role`.
- **New telemetry event log row** → `ops.aion_events` (append-only, partitioned). Use `recordAionEvent()` helper at `src/app/api/aion/lib/event-logger.ts`.
- **New auth/recovery/invite primitive that runs before workspace context** → `public.*` (pre-auth exception only).
- **New entity metadata** (per-entity working notes, profile annotations) → `directory.*` alongside `directory.entities`, never cortex.
- **New financial ledger** (referrals, commission tracking, etc.) → `finance.*`, never cortex.

### Three Supabase Clients

| File | When |
|---|---|
| `src/shared/api/supabase/client.ts` | Browser/client components. Anon key, respects RLS. |
| `src/shared/api/supabase/server.ts` | Server components, Server Actions, API routes. Cookie session, respects RLS. |
| `src/shared/api/supabase/system.ts` | **Server-only.** Service role — bypasses ALL RLS. Aion, webhooks, QBO sync only. Never import in client code. |

### Email Sending

All email via Resend through `src/shared/api/email/send.ts`. Auth emails always use global `EMAIL_FROM`. Proposal emails are workspace-aware. All emails must include HTML + plain text (`toPlainText(html)` — pass the rendered string, not a React element).

Full patterns: **`docs/reference/code/email-sending.md`**

### Legacy & Grandfathered Tables

Two distinct categories. Treat them differently.

**Removed — do not reference in new code:**

- `contacts`, `clients`, `people`, `organizations` → `directory.entities`
- `org_members`, `org_relationships` → `cortex.relationships`
- `public.events` → `ops.events`
- `spine_items`, `spine_item_provenance`, `catalog_embeddings` → `cortex.memory` (planned)

**Grandfathered — still in active use, but not targets for new work:**

These tables live in `public` because they pre-date the five-schema split. They are actively read and written by live features and will not be migrated in the current sprint. New callers should use them the same way existing callers do, but do not add new columns or new sibling tables in `public` — any new domain tables go to the proper schema.

- `public.deals` — CRM deals. Owned by the sales flow; lives in public because the handoff pipeline writes `deals.event_id` → `ops.events.deal_id` and the dual-write cost is real.
- `public.proposals`, `public.proposal_items`, `public.packages` — proposal builder and pricing. Owned by `src/features/sales/`. The eventual target schema is `finance` but the QBO sync layer depends on current shape.
- `public.contracts` — contract records created on handoff. Written by `handoverDeal` in `src/app/(dashboard)/(features)/crm/actions/handover-deal.ts` after a proposal is accepted. Undocumented historically (see rescan finding D4, 2026-04-11).
- ~~`public.invoices`, `public.invoice_items`~~ — **REMOVED** (2026-04-12 billing rebuild). These never existed in the live DB despite code referencing them. Replaced by `finance.invoices`, `finance.invoice_line_items`, `finance.payments` and 9 other tables in the `finance` schema. See `docs/audits/billing-redesign-final-plan-2026-04-11.md`.
- `public.run_of_show_cues` — run-of-show cue rows for the Plan tab.

**For the Five-Schema goal:** the grandfathered tables will migrate to `finance` / `ops` in a dedicated project. That migration is **not** part of any feature sprint. When doing feature work, assume they stay where they are.

**Schema source of truth:** `src/types/supabase.ts` covers all six schemas (`public`, `ops`, `finance`, `directory`, `cortex`, `aion`) — PR 6.5 landed 2026-04-29 once the Supabase Dashboard "Exposed schemas" setting was extended to the non-public schemas. Use direct typed calls: `supabase.schema('ops').from('...')`. The historical `(supabase as any).schema(...)` casts have been removed. If you regenerate types after a migration, re-run `npm run db:types`.

---

## Core Architectural Patterns

### 1. Domain-Schema Isolation
New tables go in their correct schema — never `public`. People/companies/venues → `directory`. Events/projects/assignments/event-log telemetry → `ops`. Graph edges + AI memory/RAG + per-workspace Aion data substrate → `cortex`. Cross-workspace Aion admin/observability RPCs → `aion`.

### 2. Context Mesh (Relationships as Edges)
No specific FK columns (`employer_id`, `vendor_id`). Use `cortex.relationships` with typed `context_data` JSONB.

### 3. Cortex Write Protection
`cortex.relationships` has SELECT-only RLS. All writes go through `SECURITY DEFINER` RPCs (e.g. `add_contact_to_ghost_org`). Never add INSERT/UPDATE/DELETE RLS policies — this prevents privilege escalation.

### 4. Ghost Protocol
`directory.entities.claimed_by_user_id`: `NULL` = ghost (no account), set = claimed. Never gate on sign-up for adding people to deals, assignments, or contacts.

**Freelancer pattern:** `summonPersonGhost` creates a person entity + PARTNER edge with `context_data: { tier: 'preferred' }`. Do NOT use ROSTER_MEMBER for freelancers — that's for employed staff only.

### 4b. Employee Portal
The `employee` role has capabilities scoped to `portal:own_*`, `planning:view`, `ros:view`. Middleware routes employees to `/(portal)/` via `get_member_role_slug()`. Invite pipeline: `public.invitations` → `deployInvites()` → `acceptEmployeeInvite()` → workspace member with employee role. Ghost → Employee follows standard Ghost Protocol + role assignment.

### 5. Ops Separation
`ops` tables remain agnostic to human details. Rates, job titles, permissions live on `cortex.relationships` edges, not in `ops` columns.

### 6. Events
- `ops.events` — **new standard.** One `ops.projects` → multiple `ops.events`.
- `public.events` — legacy. Do not extend.

---

## Supabase Rules (Non-Negotiable)

1. **Read first.** Check `src/types/supabase.ts` and `supabase/migrations/` before schema work.
2. **No new tables in `public`** (exceptions: pre-auth boundary tables).
3. **No duplicate tables.**
4. **RLS on everything** with workspace isolation (correct pattern per schema — see below).
5. **Migration workflow:** Propose SQL → explain RLS → get approval → generate types.
6. **No destructive actions** without double-confirmed permission.
7. **No specific FK columns** — use `cortex.relationships`.
8. **Ghost Protocol** — `claimed_by_user_id`, never gate on sign-up.
9. **Cortex writes via RPC only.**

### RLS Patterns

**`public` schema** — direct subquery:
```sql
CREATE POLICY example_select ON public.example FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
);
```

**`directory`/`ops`/`finance`** — use `get_my_workspace_ids()`:
```sql
CREATE POLICY example_select ON ops.example FOR SELECT USING (
  workspace_id IN (SELECT get_my_workspace_ids())
);
```

**`cortex.relationships`** — SELECT only, via source entity:
```sql
CREATE POLICY view_graph ON cortex.relationships FOR SELECT USING (
  source_entity_id IN (
    SELECT id FROM directory.entities WHERE owner_workspace_id IN (SELECT get_my_workspace_ids())
  )
);
```

### Database Functions

Call via `supabase.rpc(...)`, never raw SQL from app code:
- `match_catalog`, `match_documents`, `search_spine` — search/RAG
- `finance.spawn_invoices_from_proposal(proposal_id)` — idempotent invoice generation from accepted proposal (deposit + final split)
- `finance.record_payment(...)` — canonical payment write path (both Stripe webhook and manual UI)
- `finance.get_public_invoice(token)` — public invoice read (anon-accessible, RPC-only)
- `finance.next_invoice_number(workspace_id)` — per-workspace monotonic invoice number
- `finance.get_fresh_qbo_token(workspace_id)` — advisory-lock-protected QBO token reader (service role only)
- `finance.metric_revenue_collected(workspace_id, period_start, period_end, tz?, compare?)` — scalar net revenue in period with prior-period comparison
- `finance.metric_ar_aged_60plus(workspace_id)` — scalar AR balance across invoices ≥60 days overdue
- `finance.metric_qbo_variance(workspace_id)` — scalar count of invoices with QBO sync issues
- `finance.metric_qbo_sync_health(workspace_id)` — scalar QBO connection state with stalled vs failed distinction
- `finance.metric_unreconciled_payments(workspace_id)` — table of payments succeeded locally but not yet in QBO (cap 500)
- `finance.metric_invoice_variance(workspace_id)` — table of invoices with QBO sync issues (qbo_total/delta NULL until Phase 5 live-fetch)
- `finance.metric_sales_tax_worksheet(workspace_id, period_start, period_end, tz?)` — table of per-jurisdiction sales tax over period
- `finance.metric_1099_worksheet(workspace_id, year)` — table of per-vendor totals from finance.bills, flags ≥$600 IRS threshold
- `finance._metric_resolve_tz`, `finance._metric_assert_membership` — internal helpers for the metric RPCs; call via `src/shared/lib/metrics/call.ts`, never directly
- `aion.metric_brief_open_kill_check(window_days, repeat_window_days, min_repeats)` — Phase 3 §3.10 admin telemetry. Repeat-user stats for the §3.9 brief-me kill metric. Service-role only; gated at the admin route by `isAionAdmin()`. New admin metric RPCs go in `aion.*`, not `cortex.*`.
- `aion.metric_dismiss_rate`, `aion.metric_hit_rate`, `aion.metric_tool_depth`, `aion.metric_pill_click_through`, `aion.metric_cost_per_seat(p_window_days)` — Wk 15a/16 admin metrics powering the `/aion/admin/telemetry` dashboard. Service-role only; same gating as above. cost_per_seat aggregates Anthropic chat-turn cost (from `aion.turn_complete` payload's `input_tokens`/`output_tokens`/`model_id`) plus Voyage embedding cost (from `aion.embed_cost` payload's `usd`).
- `aion.roll_aion_events_partitions()` — Wk 15c partition-lifecycle helper. Creates next 12 months of `ops.aion_events` partitions, drops 180-day-old ones. Idempotent; called daily from `/api/cron/aion-events-partition-lifecycle`.
- `finance.log_referral(...)`, `finance.delete_referral(referral_id)` — referral ledger writes (moved from cortex.* in Wk 16). Workspace-scoped; authenticated callers gated to workspace members.
- `directory.upsert_entity_working_notes(...)` — per-entity working notes (communication_style, dnr_flagged, preferred_channel) annotating `directory.entities` (moved from cortex.* in Wk 16).
- `public.reset_member_passkey(workspace_id, target_user_id)` — owner-mediated crew recovery (moved from cortex.* in Wk 16). Pre-auth boundary alongside `public.passkeys`. Authenticated owners/admins only; anti-lockout enforced; writes audit edge to `cortex.relationships`.
- `cortex.dismiss_aion_proactive_line(line_id, reason)`, `cortex.mark_pill_seen(line_id)`, `cortex.list_aion_proactive_history(deal_id, days?)`, `cortex.is_user_signal_muted(signal_type, deal_id)`, `cortex.resurface_muted_reason(workspace_id, signal_type)`, `cortex.submit_pill_feedback(line_id, feedback)`, `cortex.check_signal_disabled(workspace_id, signal_type)` (service-role only), `cortex.get_proactive_line_dismiss_rates(workspace_id, window?, min_sample?)`, `cortex.migrate_session_scope(session_id, scope_type, scope_entity_id)` — Aion user-facing data-substrate RPCs. New per-workspace Aion RPCs go in `cortex.*`, not `aion.*`.
- `get_member_permissions`, `member_has_permission`, `user_has_workspace_role` — auth
- `get_member_role_slug(p_workspace_id)` — role routing (employee portal)
- `patch_entity_attributes` — safe JSONB merge; always validate via Zod schema first
- ~~`create_draft_invoice_from_proposal`~~ — **REMOVED** (2026-04-12). Replaced by `finance.spawn_invoices_from_proposal`.

### Additional Rules

**7. `catalog` schema not PostgREST-exposed.** Direct `.schema('catalog')` calls silently fail. Access via SECURITY DEFINER RPCs only.

**8. Batch insert safety.** Use `{ ignoreDuplicates: true }` after sync ops as a last-resort guard. Not a substitute for proper dedup in financial/security tables.

**9. Typed entity attribute access.** Never use raw dot/bracket on `entity.attributes` in server actions. Use `readEntityAttrs(raw, type)` from `src/shared/lib/entity-attrs.ts` (enforced by ESLint). Write path: validate patches through typed Zod schemas before `patch_entity_attributes`.

**10. Portal pattern for stacking context escaping.** `backdrop-filter` creates a CSS stacking context. Use `createPortal(element, document.body)` for `fixed inset-0` dismiss backdrops inside `LiquidPanel`. Give container `relative z-10`. Established in `production-team-card.tsx` and `prism.tsx`.

**11. Surface Context System.** `SurfaceProvider` + `data-surface` attr auto-resolves `--ctx-well` (inputs, parent-2), `--ctx-card` (parent+1), `--ctx-dropdown` (always raised). Use these instead of `--stage-input-bg` for new work. Reference: `create-gig-modal.tsx`.

**12. Portaled dropdowns in modals.** Portal to `document.body` with auto-direction detection (flip if near viewport bottom). Prevents clipping by modal overflow.

---

## Next.js / React Patterns

- **Async params:** Always `await params` / `await searchParams` / `await cookies()` (async in Next.js 16).
- **Forms:** `useActionState` (React 19), not `useEffect`.
- **Optimistic UI:** `useOptimistic` for instant list feedback.
- **State:** Server → TanStack Query / Server Components. Client UI → Zustand. URL → Nuqs.
- **AI streaming:** `streamText` from `ai` package. `StreamingTextResponse` is deprecated.

---

## Design System: Stage Engineering

**Full docs: `docs/reference/design/` (23 documents).** Read the relevant doc before touching UI. Master doc: `design-philosophy-and-styling.md`.

Matte opaque surfaces, single light source, OKLCH tokens only, achromatic accent (brightness IS the accent), weight-based springs (`STAGE_HEAVY/MEDIUM/LIGHT`), three density tiers. New features: `stage-panel`. Existing: `liquid-card` during migration.

**Crew source of truth:** `ops.deal_crew` for both Deal and Plan tabs. Plan reads via `getDealCrewForEvent(eventId)`. JSONB `run_of_show_data.crew_items` is legacy.

**Shared header:** `DealHeaderStrip` renders in both Deal and Plan tabs. Plan passes `readOnly`.

**Voice:** Precision instrument (TE, Leica, Linear). Sentence case, no exclamation marks, production vocabulary ("show" not "event", "crew" not "resources"). Full guide: `docs/reference/design/copy-and-voice-guide.md`.

---

## Reference Docs

| Doc | When to read |
|---|---|
| `docs/reference/code/directory-schema.md` | People, companies, venues, entity identity |
| `docs/reference/code/cortex-schema.md` | Relationships, graph edges, roles, permissions |
| `docs/reference/code/finance-schema.md` | Invoices, proposals, payments, QBO |
| `docs/reference/code/catalog-and-aion-schema.md` | Catalog page, Aion AI |
| `docs/reference/event-and-deal-pages-layout-and-functionality.md` | Event/deal pages |
| `docs/reference/crm-page-state-and-flow.md` | CRM, Prism lenses, Plan stage flow |
| `docs/reference/deal-to-event-handoff-wizard-upgrade.md` | Deal-to-Event Handoff |
| `docs/reference/contact-fields.md` | Legacy contact/CRM field mapping |
| `docs/reference/gigs-vs-events.md` | Legacy gigs/events context |
| `docs/reference/code/storage-and-uploads.md` | File upload, storage paths |
| `docs/reference/design/` | **All UI work** (23 documents) |
| `docs/reference/code/session-management.md` | Sessions, inactivity logout, AuthGuard |
| `docs/reference/crm-page-state-and-flow.md` §14–15 | Network detail sheet layout |
| `docs/reference/agent-team-roles.md` | Agent team role specs, Connector data table |
| `docs/reference/code/email-sending.md` | Email sending, workspace-aware from, subject lines |
| `docs/reference/crew-equipment-and-smart-transport-design.md` | Crew gear, transport modes, source tracking, pull sheets |
| `docs/reference/verified-kit-system-design.md` | Catalog-linked equipment, verification, gap analysis, kit templates |
| `docs/reference/aion-daily-brief-design.md` | Aion Daily Brief — dispatch API, insight evaluators, widget architecture |
| `docs/reference/code/perf-patterns.md` | **Performance patterns** — measurement (`PerfOverlay`, `markStart`/`markEnd`), stale-while-revalidate, synchronized reveal, optimistic UI hooks, bundled fetches, lazy loading, RLS optimization, cache stable data. Read before optimizing. |
| `docs/onboarding-subscription-architecture.md` | Auth, onboarding, billing |

---

## Brand Name Enforcement

Product: **Unusonic**. AI: **Aion**. Old names: Signal / Signal Live, ION.

| Legacy (never use) | Current |
|---|---|
| `Signal`, `Signal Live` | `Unusonic` |
| `ION` (as AI name) | `Aion` |
| `bg-signal-void` | `bg-unusonic-void` |
| `runsignal.live` | `unusonic.com` |
| `signal_trusted_device` | `unusonic_trusted_device` |
| `signal_current_org_id` | `unusonic_current_org_id` |
| `signal_recovery_prompt_dismissed_until` | `unusonic_recovery_prompt_dismissed_until` |
| `SIGNAL_PHYSICS` | `UNUSONIC_PHYSICS` |
| `signal_current_entity_*`, `signal_org_ids_*` | `unusonic_current_entity_*`, `unusonic_org_ids_*` |
| `/api/ion` | `/api/aion` |
| `IonInput`, `IonVoice`, `IonLens`, `IonOnboardingShell` | `AionInput`, `AionVoice`, `AionLens`, `AionOnboardingShell` |
| `Ask Signal...` | `Ask Aion...` |

**When spotted:** Flag it before proceeding. Don't silently rename — user may want to review context.

**Exceptions (don't rename):** `ion` as English suffix (`action`, `function`, etc.), SQL migration filenames, `.claude/worktrees/`.

---

## Security Constraints

- RLS non-negotiable. All data `workspace_id` scoped.
- Never expose `service_role` to client. `system.ts` is server-only (Aion, webhooks, QBO only).
- Passkey auth via SimpleWebAuthn — never bypass.
- Sovereign recovery (BIP39 + Shamir) — treat keys as highly sensitive.
- No command injection, XSS, SQL injection. Validate at system boundaries.
- Stripe webhooks must verify `stripe-signature` via `stripe.webhooks.constructEvent()` before any DB access.
