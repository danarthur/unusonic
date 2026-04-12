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

### Five Schemas

**Do not create new tables in `public`.**

| Schema | Domain | Contents |
|---|---|---|
| `directory` | Identity | `directory.entities` — people, companies, venues |
| `ops` | Operations | Projects, events, assignments, logistics (agnostic to human details) |
| `finance` | Commercials | Invoices (`finance.invoices`, `invoice_line_items`), payments (`finance.payments`), QBO sync (`qbo_connections`, `qbo_entity_map`, `sync_jobs`, `qbo_sync_log`), tax rates, bills (AP, schema-only), Stripe webhook dedup. See `docs/audits/billing-redesign-final-plan-2026-04-11.md`. |
| `cortex` | Intelligence | Graph edges (`cortex.relationships`), AI memory/RAG (`cortex.memory`) |
| `public` | Legacy | Active migration to above schemas. No new tables. |

**Exception:** `public.invitations`, `passkeys`, `guardians`, `recovery_shards` live in `public` because they operate before workspace context (pre-auth boundary).

### Three Supabase Clients

| File | When |
|---|---|
| `src/shared/api/supabase/client.ts` | Browser/client components. Anon key, respects RLS. |
| `src/shared/api/supabase/server.ts` | Server components, Server Actions, API routes. Cookie session, respects RLS. |
| `src/shared/api/supabase/system.ts` | **Server-only.** Service role — bypasses ALL RLS. Aion, webhooks, QBO sync only. Never import in client code. |

### Email Sending

All email via Resend through `src/shared/api/email/send.ts`. Auth emails always use global `EMAIL_FROM`. Proposal emails are workspace-aware. All emails must include HTML + plain text (`toPlainText(html)` — pass the rendered string, not a React element).

Full patterns: **`docs/reference/email-patterns.md`**

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

**Schema source of truth:** `src/types/supabase.ts` only has type coverage for the `public` schema today because the Supabase Dashboard "Exposed schemas" setting does not include `ops / directory / cortex / finance` (verified 2026-04-11). This is why most server actions that query non-public schemas use `(supabase as any).schema('ops')`. Fix tracked as PR 6.5 in `docs/audits/event-walkthrough-2026-04-11-fix-plan.md` §6.0 — do not invent ad-hoc workarounds.

---

## Core Architectural Patterns

### 1. Domain-Schema Isolation
New tables go in their correct schema — never `public`. People/companies/venues → `directory`. Events/projects/assignments → `ops`. Graph edges/AI/embeddings → `cortex`.

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
| `docs/reference/directory-schema.md` | People, companies, venues, entity identity |
| `docs/reference/cortex-schema.md` | Relationships, graph edges, roles, permissions |
| `docs/reference/finance-schema.md` | Invoices, proposals, payments, QBO |
| `docs/reference/catalog-and-aion-schema.md` | Catalog page, Aion AI |
| `docs/reference/event-and-deal-pages-layout-and-functionality.md` | Event/deal pages |
| `docs/reference/crm-page-state-and-flow.md` | CRM, Prism lenses, Plan stage flow |
| `docs/reference/deal-to-event-handoff-wizard-upgrade.md` | Deal-to-Event Handoff |
| `docs/reference/contact-fields.md` | Legacy contact/CRM field mapping |
| `docs/reference/gigs-vs-events.md` | Legacy gigs/events context |
| `docs/reference/storage-path-protocol.md` | File upload, storage paths |
| `docs/reference/design/` | **All UI work** (23 documents) |
| `docs/reference/auth/session-management.md` | Sessions, inactivity logout, AuthGuard |
| `docs/reference/crm-page-state-and-flow.md` §14–15 | Network detail sheet layout |
| `docs/reference/agent-team-roles.md` | Agent team role specs, Connector data table |
| `docs/reference/email-patterns.md` | Email sending, workspace-aware from, subject lines |
| `docs/reference/crew-equipment-and-smart-transport-design.md` | Crew gear, transport modes, source tracking, pull sheets |
| `docs/reference/verified-kit-system-design.md` | Catalog-linked equipment, verification, gap analysis, kit templates |
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
