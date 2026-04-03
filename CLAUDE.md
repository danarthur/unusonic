# CLAUDE.md — Unusonic

This file is read automatically by Claude Code at the start of every session. It is the source of truth for how Claude Code operates in this repo.

---

## What We're Building

**Unusonic** is a B2B SaaS platform for the event production industry — a full operating system for managing deals, logistics, talent, finance, and run-of-show for production companies and touring artists.

The data model is a **knowledge graph**, not a relational CRUD app. People, companies, venues, and workspaces are all Nodes in `directory.entities`. Relationships between them are Edges in `cortex.relationships`. The AI layer (Aion) reads from `cortex.memory` to reason about the workspace.

- **Stack:** Next.js 16.1 (App Router), React 19, Supabase (SSR), Tailwind v4, Framer Motion, Zustand, TanStack Query, Zod v4, Vercel AI SDK
- **Auth:** Passkeys (SimpleWebAuthn) + sovereign recovery (BIP39 + Shamir)
- **Architecture:** Feature-Sliced Design (FSD)
- **Multi-tenancy:** Every data operation is scoped to `workspace_id`
- **AI Agent:** Aion (not Arthur — update any legacy references)

---

## Agent Teams: When to Use vs Work Alone

Teams (Builder + Guardian + orchestrator) cost significantly more tokens than solo work. Default to working alone. Only suggest or use a team when it genuinely earns its cost.

### Use a team when ALL of the following are true
- The task spans **3+ distinct files or layers** that need to be built and connected (not just edited)
- There is a **meaningful security or data-integrity risk** that warrants a dedicated review pass (auth, RLS, cross-workspace data, financial calculations)
- The work is **sequential by phase** — one thing must be correct before the next starts

**Good fits:** multi-phase feature builds (like Phases 16–18), anything touching auth/RLS where a P0 missed in solo review ships immediately, Stripe integration, Aion/AI agent wiring.

### Work alone when any of the following is true
- Single file or component change
- Bug fix or styling adjustment
- Research, explanation, or audit tasks
- Schema migration (one focused migration + type regen)
- Anything completable in under ~15 minutes of focused work

**Default:** work alone and say so. Only propose a team if the task genuinely fits the criteria above.

### If you suggest a team, always specify
- How many agents and what roles (Builder, Guardian, Researcher, etc.)
- Rough task count and dependency chain
- Token cost warning if the scope is large ("this will be a long team session")

### If the user asks for a team but the task doesn't warrant it
Say so directly: "This is straightforward enough to handle solo — it would save tokens and move faster. Want me to just do it?" If they still want a team, respect that.

### Standard team composition for Unusonic
| Role | Agent type | Runs when |
|---|---|---|
| **Planner** | `Plan` | Before any build with 3+ files or an unclear implementation path |
| **Builder** | `general-purpose` | Every build session |
| **Guardian** | `general-purpose` | Every build — code quality, security, RLS, TypeScript |
| **Connector** | `general-purpose` | Any build touching shared data types or cross-page data |
| **Test Writer** | `general-purpose` | After Guardian clears — on auth, finance, RLS-critical, or email flows |
| **Scribe** | `general-purpose` | End of every session that ships something |
| **Researcher** | `Explore` | Only when significant codebase exploration is needed before building |

**Default team: Builder + Guardian.** Add others when the task warrants it. Maximum four active agents at once — beyond that, coordination overhead exceeds the benefit.

The full pipeline when all roles are active:
```
Planner → Builder → Guardian → Connector → Test Writer → Scribe
```

### The Connector role
Guardian checks *code correctness*. Connector checks *product data flow* — the two are complementary and don't overlap.

**Connector's job:** after Builder finishes a task, trace every place in the product that consumes the same data that was just written. Verify those surfaces still receive it, display it correctly, and don't silently drop it.

**Unusonic data connections to always check:**

| Data written here | Also consumed by |
|---|---|
| Crew assignment (`ops.deal_crew`) | Network detail sheet (upcoming assignments card), crew availability check in create-gig-modal, `getEventConflicts`, crew confirmation token flow, Plan tab `CrewFlightCheck` (via `getDealCrewForEvent`), Deal tab `ProductionTeamCard` |
| Gear item (CRM flight check) | Catalog page (stock counts, sub-rental badge), RoS cue inspector gear picker, `getEventLedger` (cost calculation) |
| Client attached to deal | Network page (entity card), Prism stakeholder grid, `getEventSummary` client_name join, public invoice |
| Event status change | Calendar page, dashboard active-production widget, pipeline tracker |
| Venue entity linked to event | Network page (entity detail), Plan Lens location card, Event Studio header venue pill, DispatchSummary |
| Proposal accepted | Ledger Lens projected revenue, invoice creation flow, deal status progression |
| Skill tags / job titles | Network cards (skill pills), employee detail sheet, crew search in create-gig-modal, call time rule matching |
| RoS cue crew/gear assignments | Cue cards (badges), CueInspector pickers, pre-show section dividers |
| Employee invite (`public.invitations`) | Network detail sheet InviteCard, employee edit page invite banner, `/claim` route (isEmployeeInvite fork), portal routing in middleware |
| Entity lifecycle/relationship metrics | Network detail sheet contact strip (showCount, totalPaid, lifetimeValue, relationshipStrength), UpcomingAssignments panel, DealHistoryPanel |

**Stakeholder grid — entity_type gating:** The CRM stakeholder contact picker only opens for `company` and `venue` entity types. `person` and `couple` entities skip the contact sheet entirely and go straight to role selection. `NetworkSearchOrg` results carry `entity_type` so the component can apply this check client-side. If you add a new entity type to `directory.entities`, update `handleSelectOrg` in `stakeholder-grid.tsx` to handle it correctly.

**Connector's checklist:**
1. Identify all data written or mutated by the build task
2. For each data type, look up the table above (and search the codebase for other consumers not listed)
3. Read each consumer and verify: (a) the query/prop still reaches the data, (b) new fields are included in the select, (c) null/optional new fields don't break the consumer's render
4. Flag any consumer that silently drops the data (no error, just missing UI) as P1
5. Flag any consumer that would crash on the new data shape as P0

**When to include Connector:**
- Feature writes crew, gear, venue, client, or event data
- Feature adds new fields to a shared type (e.g. `RunOfShowData`, `EventSummary`, `NetworkNode`)
- Feature creates a new entity or relationship in `directory`/`cortex`
- Any handoff wizard or status transition that fans out to multiple views

**When Connector is not needed:**
- Pure UI changes with no data shape impact
- Settings pages that manage their own isolated tables (call-time rules, industry tags, roster)
- Bug fixes that don't alter what data is returned

### The Planner role
Runs before Builder starts on any non-trivial task. Prevents Builder going down wrong paths mid-implementation, which wastes more tokens than the planning pass costs.

**Planner's job:** read the relevant reference docs and current code, then produce a concrete implementation plan for Builder — every file that needs changing, the order to change them, and any edge cases or constraints to watch for.

**Planner's output should include:**
1. Files to create (with proposed location in FSD layer structure)
2. Files to modify (with the specific change needed in each)
3. Schema/type changes required (JSONB vs new table, type updates)
4. Dependency order — what must be done before what
5. Edge cases flagged upfront (null states, legacy fallback paths, callers that need updating)
6. Any reference docs Builder must read before starting

**When to include Planner:**
- Task touches 3+ files or layers
- The implementation path is unclear or has multiple valid approaches
- Task involves a schema change or new server action pattern
- Task could have non-obvious knock-on effects

**When Planner is not needed:**
- The task is a single targeted change with an obvious implementation
- Builder already has full context from a prior research task

---

### The Test Writer role
Runs after Guardian clears a build. Unusonic currently has no tests — Test Writer builds coverage on the highest-risk paths first.

**Test Writer's job:** write tests for the server actions and critical logic introduced by the build task. Does not test UI components. Focuses on correctness and security at the server boundary.

**Priority order for what to test:**
1. Auth and workspace scoping — server actions that accept an ID from the client must be tested with a cross-workspace ID (should return 'Not authorised', not data)
2. Financial calculations — proposal totals, invoice amounts, P&L margins; verify formula correctness and null safety
3. Token and confirmation flows — crew confirmation, ghost claim; verify single-use enforcement and expiry
4. Data shape — server actions that return typed DTOs; verify the shape matches what callers expect when optional fields are null

**Test Writer's constraints:**
- Use the existing test framework in the project (check `package.json` for vitest or jest)
- Test server actions directly — import and call them, assert the return value
- Use a real test database or Supabase local — no mocks for DB calls (mocks hide RLS failures)
- Each test file lives alongside the file it tests: `get-event-ledger.test.ts` next to `get-event-ledger.ts`

**When to include Test Writer:**
- Any server action involving auth, workspace checks, or financial math
- Any token-based flow (crew confirmation, ghost claim, invite links)
- Any action that uses the system client (service role) — these bypass RLS and must be tested for auth guards

**When Test Writer is not needed:**
- Pure UI component changes
- Settings CRUD with no special auth logic
- Tasks where existing tests already cover the changed code

---

### The Scribe role
Runs at the end of every session that ships something. Keeps `docs/` current so future sessions don't start with stale context — the most common source of wasted tokens.

**Scribe's job:** review everything built in the session and update documentation to match the current state of the product.

**Scribe's checklist:**
1. **Audit doc** (`docs/audits/event-operations-audit.md`) — update feature completeness percentages, mark phase tasks ✅, update the Journey table if a step changed status, update the phase summary
2. **Reference docs** (`docs/reference/`) — if a new server action, RPC, or data shape was introduced, add it to the relevant reference doc. If an existing pattern changed, update it.
3. **CLAUDE.md** — if a new architectural pattern was established (a new RPC, a new client usage, a new FSD convention), add it to the relevant section
4. **`supabase/migrations/MIGRATION_AUDIT.md`** — if a migration was applied, ensure it is logged
5. Do NOT rewrite docs from scratch — make targeted additions and corrections only
6. Do NOT document things already derivable from the code (function signatures, component props) — only document intent, constraints, and non-obvious decisions

**When to include Scribe:**
- Any session that completes a phase or sub-phase
- Any session that adds a new server action, RPC, or data type that other features will consume
- Any session that changes an existing architectural pattern

**When Scribe is not needed:**
- Bug fix sessions with no new patterns
- Pure UI polish with no data layer changes
- Sessions where the only doc change would be a percentage number (team lead can update that inline)

---

### The Design Team

A dedicated team for UI/UX work. Invoke with: **"call the design team on [page/component]"** or **"run the design team"**.

**Pipeline:** Scout → Builder → Reviewer

| Role | Agent type | Job |
|---|---|---|
| **Design Scout** | `Explore` | Audits target files for design system violations, anti-patterns, and inconsistencies. Returns a structured findings list with file:line references. |
| **Design Builder** | `general-purpose` | Takes Scout's findings and implements fixes. Touches only UI — no data layer changes. |
| **Design Reviewer** | `general-purpose` | After Builder finishes, verifies tokens are correct, no regressions, and fixes are visually coherent across related components. |

**Scout's audit checklist** (runs against `docs/reference/design/design-philosophy-and-styling.md` + CLAUDE.md design rules):
1. **Background tokens** — `bg-white` / `bg-black` → must use `bg-obsidian`, `bg-unusonic-void`, or surface tokens
2. **Color tokens** — raw hex or rgb values → must use OKLCH tokens from `globals.css`
3. **Panel surfaces** — bare divs used as cards → must use `liquid-card` or `glass-panel`
4. **Motion** — elements that appear/disappear without animation → must use Framer Motion spring transitions
5. **Typography** — missing `tracking-tight`, wrong weight hierarchy, non-Geist fonts
6. **Layout** — flat table dumps, bare `ul` lists without Bento structure
7. **Anti-patterns** — colored floating orbs, Aurora gradients, modals without spring, hardcoded `bg-white`
8. **Copy/voice** — forbidden words (`Deploy`, `Execute`, `Command Center`), exclamation marks, title case
9. **Entity-type awareness** — components that render identically for company/person/couple when they should differ (avatar icon, fields shown, etc.)

**Builder's constraints:**
- Read `docs/reference/design/design-philosophy-and-styling.md` before making any change
- Use OKLCH tokens from `src/app/globals.css` — never raw hex
- **New features:** Use `StagePanel` / `stage-panel` classes, weight-based motion (`STAGE_HEAVY/MEDIUM/LIGHT`), `stage-readout` / `stage-label` typography
- **Existing features:** `liquid-card` / `glass-panel` OK during migration; prefer Stage Engineering for any substantial rework
- Ensure components work at all three density tiers (test with `data-density` attribute)
- Do NOT touch server actions, data fetching, or DB queries — purely UI layer
- Do NOT add new features — fix what exists

**Reviewer's checklist:**
1. All changed tokens resolve to a defined CSS variable (grep `globals.css`)
2. No `bg-white`, `bg-black`, raw hex in the diff
3. Motion uses weight-appropriate spring (`STAGE_HEAVY` for panels, `STAGE_LIGHT` for chips)
4. Component works for all entity types it might receive (company, person, couple, venue)
5. Component looks correct at all three density tiers
6. No TypeScript errors in changed files

**When to use the Design Team:**
- Auditing a full page for inconsistencies (network page, CRM, entity sheet, etc.)
- Polishing a feature after it ships (visual debt pass)
- When a component was built fast and needs a design pass before it's seen by clients

**When not to use the Design Team:**
- Single-component targeted fix (do it solo)
- Anything touching data shape, server actions, or schema — that's Builder + Guardian

---

## Workflow: Claude Code vs Cursor

Claude Code handles **structural, project-wide, and terminal-driven work**. Cursor handles **surgical, line-level UI editing and real-time autocomplete**.

| Claude Code | Cursor |
|---|---|
| Supabase migrations & schema changes | React component builds and edits |
| Large-scale refactors (multi-file) | Styling and fine-tuning UI |
| FSD scaffolding (new features/entities) | Small bug fixes |
| Type generation (`npm run db:types`) | Real-time autocomplete (Cursor Tab) |
| Debug scripts and SQL | In-editor pair programming |
| Reading project-wide architecture | File-level exploration |

**The shared brain is `docs/`.** Both tools reference the same files on disk.

---

## Common Commands

```bash
npm run dev            # Start dev server (webpack, port 3000)
npm run dev:turbo      # Start dev server (turbopack, faster)
npm run build          # Production build
npm run db:types       # Regenerate Supabase types → src/types/supabase.ts
                       # ⚠ Always re-append convenience aliases after regen (see end of supabase.ts):
                       #   Proposal, ProposalItem, Package, CueType, PaymentMethod
                       #   The generator strips them every time.
npm run lint           # ESLint
npm run test           # Vitest unit tests (vitest.config.ts)
rm -rf .next           # Clear build cache (first step when build fails)
```

**Supabase:**
```bash
# Migrations live in supabase/migrations/
# Debug SQL lives in scripts/debug/ — run in Supabase SQL Editor, not app code
```

---

## Architecture: Feature-Sliced Design (FSD)

Strict dependency rule — layers may only import from layers **below** them:

```
App → Widgets → Features → Entities → Shared
```

| Layer | Location | Purpose |
|---|---|---|
| App | `src/app/` | Routing, layouts only. No business logic. |
| Widgets | `src/widgets/` | Smart compositions (data + UI connected). |
| Features | `src/features/` | Specific user actions (e.g. `EditGigForm`). |
| Entities | `src/entities/` | Domain logic (e.g. `GigCard`, `GigType`). |
| Shared | `src/shared/` | Reusable primitives (Button, SupabaseClient). |

**No ghost folders.** Do not reference or create files/paths that don't exist in the tree.

---

## Database Architecture

### The Five Schemas

The database is divided into five Postgres schemas with strict domain ownership. **Do not create new tables in `public`.**

| Schema | Domain | What lives here |
|---|---|---|
| `directory` | Identity | People, companies, venues — anything that can sign a contract, send a message, or get paid. Single table: `directory.entities`. |
| `ops` | Operations | Projects, events, assignments, logistics. Schema is agnostic to human details. |
| `finance` | Commercials | Proposals, invoices, payments, expenses, QBO sync. Separate from `ops` — ops handles logistics; finance handles money. |
| `cortex` | Intelligence | Knowledge graph edges (`cortex.relationships`), AI memory/RAG (`cortex.memory`). |
| `public` | Legacy | Existing tables under active migration to the above schemas. Do not add new tables here. |

---

### The Three Supabase Clients

| File | When to use |
|---|---|
| `src/shared/api/supabase/client.ts` | Browser / client components only. Anon key, respects RLS. |
| `src/shared/api/supabase/server.ts` | Server components, Server Actions, API routes. Cookie session, respects RLS. |
| `src/shared/api/supabase/system.ts` | **Server-only.** Service role key — bypasses ALL RLS. Use only for AI background tasks (Aion), webhooks, and QBO sync. Never import into client components. |

---

### Email Sending Patterns

All transactional email goes through Resend via `src/shared/api/email/send.ts`.

**Workspace-aware sending:** Proposal emails use `getWorkspaceFrom(workspaceId, senderName?)` to resolve the correct `from` address. If the workspace has a verified custom sending domain (`public.workspaces.sending_domain_status = 'verified'`), emails appear from that domain. Otherwise falls back to the global `EMAIL_FROM` env var.

**Rule: auth emails must never be workspace-aware.** `sendSummonEmail`, `sendGuardianInviteEmail`, `sendRecoveryVetoEmail`, and `sendEmployeeInviteEmail` always use the global `EMAIL_FROM`. These arrive before the user has a workspace context, and routing them through a custom domain could break sovereign recovery flows.

**V1 scope of workspace-aware sending:** Proposal emails only — `sendForSignature`, `ProposalAcceptedEmail`, `ProposalSignedEmail`. Crew notification emails (`src/features/crew-notifications/`) are excluded — they have their own Resend instance and per-member DB calls would be too expensive.

**DocuSeal + email ownership:** `sendForSignature` sets `send_email: false` in the DocuSeal submission options. Unusonic sends the delivery email — DocuSeal does not. Never set `send_email: true` or the client will receive a duplicate from DocuSeal's domain.

**Multipart MIME (all emails):** Every email sent via `send.ts` must include both HTML and plain text. The pattern is:
```ts
import { render, toPlainText } from '@react-email/render';
const html = await render(<MyEmailTemplate {...props} />);
const text = toPlainText(html); // takes the rendered HTML string, NOT a React element
await resend.emails.send({ ..., html, text });
```
**`toPlainText` gotcha:** Pass the rendered HTML string, not the React element. `toPlainText(<Component />)` does not work.

**From name format:** Proposal emails use `"${senderName} at ${workspaceName}"` — B2B hybrid standard so clients see who sent it.

**`sendForSignature` rich email pattern:** After creating the DocuSeal submission, call `getPublicProposal(publicToken)` to get the full `PublicProposalDTO`. Pass `eventTitle`, `startsAt`, `total`, `depositPercent`, `paymentDueDays` into `sendProposalLinkEmail` via `senderOptions`. This gives the client event context in the outbound email without a second DB round-trip.

**Resend domain webhook:** `/api/webhooks/resend` handles `domain.updated` events and updates `public.workspaces.sending_domain_status`. Verified with `timingSafeEqual` against `RESEND_WEBHOOK_SECRET`. Register this endpoint in the Resend dashboard.

**Proposal subject line personalization:** `buildProposalSubjectLine()` in `src/shared/api/email/send.ts` is the single source of truth for proposal email subject lines — both `sendProposalLinkEmail` and `sendProposalReminderEmail` call it. It applies three-signal priority: (1) if `entityType === 'couple'`, omit the name prefix — the paired name structurally appears in the deal title; (2) if `eventArchetype` is non-null, use the archetype label — archetype vocabulary never contains person names so collision is impossible; (3) word-boundary fallback — split the deal title on `/\W+/` and check if the first name appears as a whole word; if found, drop the prefix. Never use `String.includes()` for name detection in subject lines — it produces false positives on partial matches.

---

### Legacy Tables (Do Not Use for New Features)

The following `public` schema tables are in active migration to the new schemas. Do not write new queries against them; do not create similar tables:

- `contacts`, `clients`, `people` → migrating to `directory.entities`
- `organizations` → migrating to `directory.entities`
- `org_members`, `org_relationships` → migrating to `cortex.relationships`
- `public.events` → legacy monolithic table; new standard is `ops.events`
- `spine_items`, `spine_item_provenance`, `catalog_embeddings` → migrating to `cortex.memory` (target destination for all embeddings and RAG document chunks; migration in progress — do not extend these legacy tables)

**`cortex.memory` (planned):** The unified vector/RAG brain for Aion. All unstructured, vector-embedded data will migrate here from `public`. Do not build new embedding or RAG tables in `public`; design for `cortex.memory` as the target.

---

### Core Architectural Patterns

#### 1. Domain-Schema Isolation
Every new table must go in its correct schema — never `public`:
- People, companies, venues → `directory`
- Events, projects, assignments → `ops`
- Graph edges, AI memory, embeddings → `cortex`

#### 2. The Context Mesh (Relationships as Edges)
Do not create specific FK columns like `employer_id`, `vendor_id`, or `agent_id`. Use `cortex.relationships` to describe how two nodes connect. Roles, permissions, and metadata live in the `context_data` JSONB column on the edge — not in operational tables.

```sql
-- Right: generic edge with typed context
INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
VALUES (:person_id, :org_id, 'OWNER', '{"equity": 100}');

-- Wrong: rigid FK column
ALTER TABLE ops.assignments ADD COLUMN employer_id uuid;
```

#### 3. Cortex Write Protection (Intentional — Security)
`cortex.relationships` controls permissions and access levels via `context_data` roles. Only a SELECT RLS policy exists — INSERT/UPDATE/DELETE from the client would open privilege escalation vectors.

**The rule:** Client apps have SELECT only on the graph. All writes to `cortex.relationships` (creating an employee edge, adding a vendor, updating a role) **must be routed through specific `SECURITY DEFINER` RPCs** (e.g. `add_contact_to_ghost_org`). The RPC validates the caller's authority before executing the write — the client never writes directly.

Never add a permissive INSERT/UPDATE/DELETE RLS policy to `cortex.relationships`.

#### 4. The Ghost Protocol
Do not require users to sign up before they can be added to the network. `directory.entities` has a `claimed_by_user_id` column:
- `NULL` → Ghost Profile (created by another entity; no account yet)
- Set → The entity has signed up; their full history transfers instantly on claim

Never force a sign-up gate for adding a person to a deal, assignment, or contact list.

**Freelancer ghost pattern:** When a user adds a freelancer (preferred individual, not an org member) via the Network page, `summonPersonGhost` creates a `type: 'person'` ghost entity in `directory.entities` and a PARTNER edge from the org entity to the person with `context_data: { tier: 'preferred' }`. This is distinct from `ROSTER_MEMBER` (staff/contractors on payroll). The PARTNER + tier=preferred combination causes the person to appear in the crew picker "Freelancers" section via the inner-circle query filtered to `type = 'person'`. Do not add freelancers as ROSTER_MEMBER — that edge type is for employed staff and contractors only.

#### 4b. Employee Portal and Role-Based Routing

The `employee` system role in `ops.workspace_roles` is a restricted access tier with capabilities scoped to `portal:own_schedule`, `portal:own_profile`, `portal:own_pay`, `planning:view`, and `ros:view`. The `portal:own_*` capability prefix indicates self-service features — the employee can only access their own data.

**Routing:** Middleware calls `get_member_role_slug(workspaceId)` to determine the user's role. Employees are redirected to `/(portal)/` routes and blocked from `/(dashboard)/` routes. Non-employees are blocked from portal routes. The portal has its own layout shell with a simplified top nav (Schedule, Profile, Pay).

**Invite pipeline:** The `public.invitations` table tracks pending invites (`workspace_id`, `entity_id`, `email`, `role`, `token`, `expires_at`, `accepted_at`). `deployInvites()` sends `EmployeeInviteEmail` via Resend. `acceptEmployeeInvite()` validates the token, creates a workspace member with the `employee` role, and links the entity. The `/claim` route handles `isEmployeeInvite` with different copy and redirects to `/portal` instead of the dashboard.

**`public.invitations` is an exception to the "no new tables in public" rule** — invitations are consumed before the user has a workspace context (pre-auth boundary), similar to `passkeys`, `guardians`, and `recovery_shards`. They live in `public` because the invite token flow operates outside workspace-scoped RLS.

**Ghost → Employee flow:** An employee starts as a ghost entity in `directory.entities` (created by the workspace admin via MemberForge). The invite email contains a claim token. When the employee signs up and claims, `claimed_by_user_id` is set on the entity (standard Ghost Protocol), and they are added to `workspace_members` with the `employee` role.

#### 5. Ops Separation
`ops` tables must remain agnostic to human details. `ops.assignments` points only to `entity_id` from `directory`. Rates, job titles, and permissions live on the `cortex.relationships` edge — not in `ops` columns.

#### 6. Events: ops.events vs public.events
- `ops.events` — **New standard.** One `ops.projects` (the contract) can have multiple `ops.events` (e.g. Load-In, Rehearsal, Main Show). Use this for all new event work.
- `public.events` — Legacy, monolithic. Do not extend.

---

### Supabase Rules (Non-Negotiable)

1. **Read first.** Before any schema work, read `src/types/supabase.ts` and `supabase/migrations/` to understand current state.
2. **No new tables in `public`.** All new tables go in `directory`, `ops`, `finance`, or `cortex`.
3. **No duplicate tables.** Do not suggest creating a table that already exists.
4. **RLS on everything.** Every new table must have RLS enabled with a workspace isolation policy using the correct pattern for its schema (see below).
5. **Migration workflow:** Propose SQL → explain RLS → get user approval → generate types.
6. **No destructive actions** without explicit double-confirmed user permission (no `DROP TABLE`, no column removal).
7. **No specific FK columns for relationships.** Use `cortex.relationships`.
8. **Ghost Protocol.** Always use `claimed_by_user_id` on entity tables, never gate on sign-up.
9. **Cortex writes via RPC only.** Never add INSERT/UPDATE/DELETE RLS policies to `cortex.relationships`. All writes go through `SECURITY DEFINER` RPCs.

**RLS patterns — use the correct one per schema:**

`public` schema (legacy tables) — uses direct `workspace_members` subquery:
```sql
ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;

CREATE POLICY example_workspace_select ON public.example
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );
-- Repeat for INSERT, UPDATE, DELETE
```

`directory`, `ops`, `finance` schemas — use the `get_my_workspace_ids()` SECURITY DEFINER function:
```sql
ALTER TABLE ops.example ENABLE ROW LEVEL SECURITY;

CREATE POLICY example_workspace_select ON ops.example
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
  );
-- Repeat for INSERT, UPDATE, DELETE
```

`cortex.relationships` — workspace scoped indirectly via source entity; SELECT only (writes via RPC):
```sql
CREATE POLICY view_graph ON cortex.relationships
  FOR SELECT USING (
    source_entity_id IN (
      SELECT id FROM directory.entities
      WHERE owner_workspace_id IN (SELECT get_my_workspace_ids())
    )
  );
```

**Database functions** (call via `supabase.rpc(...)`, never raw SQL from app code):
- `match_catalog` — Aion semantic search over catalog embeddings
- `match_documents` — general document search
- `search_spine` — spine item search
- `create_draft_invoice_from_proposal` — finance automation
- `get_member_permissions`, `member_has_permission`, `user_has_workspace_role`
- `get_member_role_slug(p_workspace_id)` — returns the role slug (e.g. `'employee'`, `'admin'`) for the current user in a workspace. Used by middleware to route employees to `/portal` and block non-employees from portal routes.
- `patch_entity_attributes` — safe JSONB merge for `directory.entities.attributes`; strips sentinel keys; always validate the patch through a Zod schema before calling

#### 7. The `catalog` schema is not PostgREST-exposed

The `catalog` schema is not listed in PostgREST's `db-schema` configuration. Direct `.schema('catalog')` calls from server actions will silently fail or error. All access to `catalog.*` tables (currently `catalog.item_assignees`) must go through SECURITY DEFINER RPCs in the `public` schema. When adding new tables to the `catalog` schema, always add corresponding RPCs — never assume direct PostgREST access.

#### 8. Batch insert safety: `ignoreDuplicates: true`

When performing batch inserts after sync operations where exact deduplication state may be uncertain, pass `{ ignoreDuplicates: true }` to the Supabase insert call as a safety net against any remaining conflict edge cases. This prevents a single duplicate row from killing the entire batch. It is a last-resort guard — correct deduplication logic should still prevent conflicts upstream. Do not use `ignoreDuplicates: true` as a substitute for proper conflict handling in financial or security-critical tables.

#### 9. Typed entity attribute access

Never read `entity.attributes` fields with raw dot or bracket notation in server actions or API files. Use `readEntityAttrs(raw, type)` from `src/shared/lib/entity-attrs.ts`. This is enforced by an ESLint `no-restricted-syntax` rule scoped to `src/app/**/actions/*.ts`, `src/features/*/api/*.ts`, and `src/entities/*/api/*.ts`.

**Write path:** Validate any incoming patch through `IndividualAttrsSchema.partial()`, `CoupleAttrsSchema.partial()`, or `CompanyAttrsSchema.partial()` before passing to `patch_entity_attributes` RPC. Never forward a raw client-supplied object.

Files that have not yet migrated carry `/* eslint-disable no-restricted-syntax -- TODO: migrate entity attrs reads to readEntityAttrs() */` as acknowledged tech debt — do not remove these without migrating the reads first.

#### 10. Portal pattern for stacking context escaping

`LiquidPanel` applies `backdrop-filter` for its frosted glass effect. This creates a CSS stacking context, which means any `fixed`-positioned child rendered inside it is scoped to that context — the child cannot cover the full viewport, even with `z-[9999]`.

**The pattern:** When rendering a dismissible overlay (outside-click backdrop, popover backdrop) inside a component that has `backdrop-filter`, use `createPortal(element, document.body)` to escape the stacking context:

```tsx
import { createPortal } from 'react-dom';

// Inside a component rendered inside LiquidPanel:
{isOpen && createPortal(
  <div className="fixed inset-0 z-40" onClick={handleClose} />,
  document.body
)}
```

**Apply this pattern for:** any `fixed inset-0` dismiss backdrop, any dropdown that must float above a `LiquidPanel`. Do NOT use this for the interactive picker content itself — only for the backdrop. The picker content can render inline (pushing sibling content down) instead of using `absolute` positioning.

**Also needed:** give the container element `relative z-10` so it sits above the blur layer within the panel's stacking context.

This is the established pattern in `production-team-card.tsx` (three pickers) and `prism.tsx` (status dropdown backdrop).

#### 11. Surface Context System (automatic token resolution)

`src/shared/ui/surface-context.tsx` provides a React context that tracks the current surface nesting level. Five levels: `nested` (0), `void` (1), `surface` (2), `elevated` (3), `raised` (4).

**How it works:** `StagePanel` auto-sets a `data-surface` HTML attribute and wraps children in `SurfaceProvider`. CSS `[data-surface]` selectors in `globals.css` set cascading tokens: `--ctx-well` (inputs, parent minus 1), `--ctx-well-hover` (list item hover, NOT input hover), `--ctx-card` (cards, parent plus 1), `--ctx-dropdown` (always raised).

**The rule:** Use `var(--ctx-well)` for input backgrounds instead of `--stage-input-bg`. Use `var(--ctx-card)` for cards inside a panel. Use `var(--ctx-dropdown)` for floating dropdowns. The tokens auto-resolve based on the parent surface — components never need to know what surface they sit on.

**Reference implementation:** CRM `create-gig-modal.tsx`.

**Migration:** `--stage-input-bg` (semi-transparent overlay) still works. `--ctx-well` (context-resolved absolute value) is preferred for new work.

#### 12. Portaled dropdowns in modals

Custom dropdowns inside modals must be portaled to `document.body` with auto-direction detection (flip up if near viewport bottom). This prevents dropdowns from being clipped by modal overflow or stacking context. All dropdowns in `create-gig-modal` (archetype, venue, referrer, calendar month/year) follow this pattern.

---

## Next.js / React Patterns

- **Async params:** Always `await params` / `await searchParams` / `await cookies()` — they are async in Next.js 16.
- **Forms:** Use `useActionState` (React 19), not `useEffect` for submissions.
- **Optimistic UI:** Use `useOptimistic` for instant list feedback.
- **State separation:**
  - Server state (data) → TanStack Query or Server Components
  - Client UI state → Zustand
  - URL state (filters, pagination) → Nuqs
- **AI streaming:** Use `streamText` from the `ai` package. `StreamingTextResponse` is deprecated.

---

## Design System: Stage Engineering

**All design guidance lives in `docs/reference/design/` (23 documents).** Read the relevant doc before touching UI. The master doc is `design-philosophy-and-styling.md`.

**The short version:** Matte opaque surfaces, single light source, OKLCH tokens only, achromatic accent (brightness IS the accent), weight-based springs (`STAGE_HEAVY/MEDIUM/LIGHT`), three density tiers (spacious/balanced/dense), density is presentation not permission. New features use `stage-panel` class. Existing features on `liquid-card` during migration.

**Surface Context system (preferred for new work):** `SurfaceProvider` + `data-surface` attribute auto-resolves `--ctx-well`, `--ctx-card`, `--ctx-dropdown` tokens based on parent surface level. Inputs use `var(--ctx-well)` — always recessed 2 levels from parent. See pattern #11 in Core Architectural Patterns. Legacy `--stage-input-bg` (semi-transparent overlay) still works but is not preferred for new components. Reference implementation: `create-gig-modal.tsx`.

**Crew source of truth:** `ops.deal_crew` is the single crew table for both Deal and Plan tabs. Plan tab reads via `getDealCrewForEvent(eventId)`. JSONB `run_of_show_data.crew_items` is legacy — new handoffs strip crew from JSONB. Legacy fallback preserved in `CrewFlightCheck` for pre-migration events.

**Shared header pattern:** `DealHeaderStrip` renders in both Deal and Plan tabs. Plan tab passes `readOnly` to disable editing. This ensures both tabs always show identical deal identity (title, date, archetype, stakeholders, budget) without maintaining two components.

**Voice:** Precision instrument (Teenage Engineering, Leica, Linear). Sentence case, no exclamation marks, production vocabulary ("show" not "event", "crew" not "resources"). Full guide: `docs/reference/design/copy-and-voice-guide.md`.

---

## Reference Docs

Read these before working in their respective areas:

| Doc | When to read |
|---|---|
| `docs/reference/directory-schema.md` | Anything touching people, companies, venues, or entity identity |
| `docs/reference/cortex-schema.md` | Anything touching relationships, graph edges, roles, or permissions |
| `docs/reference/finance-schema.md` | Anything touching invoices, proposals, payments, or QBO |
| `docs/reference/catalog-and-ion-schema.md` | Catalog page or Aion (AI intake / semantic search) |
| `docs/reference/event-and-deal-pages-layout-and-functionality.md` | Event detail or deal pages |
| `docs/reference/crm-page-state-and-flow.md` | CRM Production Queue, Prism lenses, Plan stage flow |
| `docs/reference/deal-to-event-handoff-wizard-upgrade.md` | Deal-to-Event Handoff (Progressive PlanLens, completion indicators, one-click handoff strip) |
| `docs/reference/contact-fields.md` | Legacy contact/CRM field mapping during migration |
| `docs/reference/gigs-vs-events.md` | Legacy context on gigs/events migration (ops.events is now the standard) |
| `docs/reference/storage-path-protocol.md` | File upload or storage path work |
| `docs/reference/design/` | **All UI work.** 23 documents covering the full Stage Engineering design system: philosophy, surfaces, color, spacing, motion, inputs, empty states, tables, overlays, responsive, iconography, accessibility, notifications, navigation, copy/voice, public-facing pages, data visualization, component catalog, drag/reorder, selection/bulk actions, print/PDF/email adaptation, and the migration roadmap. Read the relevant doc before touching UI. |
| `docs/reference/auth/session-management.md` | Session expiry, inactivity logout, AuthGuard, trusted devices, zombie session prevention |
| `docs/reference/crm-page-state-and-flow.md` §14–15 | Network detail sheet layout (contact strip, tabs, computed metrics, quick-book) |
| `docs/onboarding-subscription-architecture.md` | Auth, onboarding, or billing flows |
| `.cursor/rules/` | Full rule set (Cursor and Claude Code both honor these) |

---

## Brand Name Enforcement

The product is **Unusonic**. The AI agent is **Aion**. The old names were **Signal** / **Signal Live** and **ION**.

**When reading or writing any file, watch for these legacy strings and flag them before proceeding:**

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
| `signal_current_entity_*`, `signal_org_ids_*` (Supabase RPCs) | `unusonic_current_entity_*`, `unusonic_org_ids_*` |
| `/api/ion` | `/api/aion` |
| `IonInput`, `IonVoice`, `IonLens`, `IonOnboardingShell` | `AionInput`, `AionVoice`, `AionLens`, `AionOnboardingShell` |
| `Ask Signal...` | `Ask Aion...` |

**What to do when you spot a legacy name:**
1. Stop and flag it: "I found `[old name]` in `[file:line]` — this should be `[new name]`. Want me to update it?"
2. Do not silently rename it without asking — the user may want to review the context first.
3. Do not proceed with a task that writes new code containing a legacy name without flagging it first.

**Exceptions — do NOT rename these (internal code identifiers, not brand names):**
- `ion` as a word suffix in English (`action`, `function`, `motion`, `session`, etc.)
- SQL migration file names (historical record, do not touch)
- `.claude/worktrees/` — abandoned worktree artifacts, not live code

---

## Security Constraints

- RLS is non-negotiable. All data must be `workspace_id` scoped.
- Never expose `service_role` to the client. `system.ts` is server-only.
- `system.ts` is for Aion background tasks, webhooks, and QBO sync only — not convenience.
- Passkey auth via SimpleWebAuthn — do not bypass or short-circuit auth flows.
- Sovereign recovery (BIP39 + Shamir) — treat recovery keys as highly sensitive.
- No command injection, XSS, or SQL injection. Validate at system boundaries only.
- Stripe webhook routes must verify `stripe-signature` header via `stripe.webhooks.constructEvent()` before any DB access.
