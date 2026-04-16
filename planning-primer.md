# Unusonic Planning Primer

Condensed context for the research agent. Read this first every run.

---

## What Unusonic is

B2B SaaS for event production — a full OS for deals, logistics, talent, finance, and run-of-show. Customers: production companies and touring artists. The data model is a knowledge graph.

## Stack

- Next.js 16.1 App Router, React 19, TypeScript, Tailwind v4
- Supabase (SSR) for data + auth + storage
- Framer Motion, Zustand, TanStack Query, Zod v4
- Vercel AI SDK (`streamText` from `ai`, not the deprecated `StreamingTextResponse`)
- Auth: Passkeys (SimpleWebAuthn) + sovereign recovery (BIP39 + Shamir shards)

## Architecture — Feature-Sliced Design (FSD)

Layers import only from layers **below**: `App → Widgets → Features → Entities → Shared`

| Layer | Location | Purpose |
|---|---|---|
| App | `src/app/` | Routing, layouts only |
| Widgets | `src/widgets/` | Smart compositions (data + UI) |
| Features | `src/features/` | User actions (e.g. `EditGigForm`) |
| Entities | `src/entities/` | Domain logic (e.g. `GigCard`) |
| Shared | `src/shared/` | Primitives (Button, SupabaseClient) |

**No ghost folders.** Don't reference paths that don't exist.

## Database — five schemas

**Do not create new tables in `public`** except the documented pre-auth-boundary exceptions (`invitations`, `passkeys`, `guardians`, `recovery_shards`, `tier_config`, `push_subscriptions`).

| Schema | Domain |
|---|---|
| `directory` | Identity — `directory.entities` (people, companies, venues) |
| `ops` | Operations — projects, events, assignments, follow-up queue/log |
| `finance` | Commercials — proposals, invoices, payments, expenses, QBO sync |
| `cortex` | Intelligence — `cortex.relationships` (graph edges), `cortex.memory` (AI RAG) |
| `public` | Legacy + pre-auth-boundary exceptions |

**Three Supabase clients:**
- `src/shared/api/supabase/client.ts` — browser, anon key
- `src/shared/api/supabase/server.ts` — server session (cookies)
- `src/shared/api/supabase/system.ts` — **server-only**, service role, bypasses RLS. Aion, webhooks, QBO only.

## Key architectural rules

- **Cortex write protection:** `cortex.relationships` is SELECT-only RLS. Writes go through `SECURITY DEFINER` RPCs only.
- **Ghost Protocol:** `directory.entities.claimed_by_user_id` NULL = ghost (no account). Never gate features on sign-up.
- **Relationships as edges, not FKs:** No `employer_id` / `vendor_id` columns. Use `cortex.relationships` with typed `context_data` JSONB.
- **Ops separation:** `ops` tables stay agnostic to human details. Rates/titles/permissions live on `cortex.relationships` edges.
- **Async in Next 16:** `await params`, `await searchParams`, `await cookies()`.

## Design system — Stage Engineering

Matte opaque surfaces, single light source, OKLCH tokens only, achromatic accent (brightness IS the accent — no chromatic accents). Weight-based springs (`STAGE_HEAVY/MEDIUM/LIGHT`). Three density tiers.

- New features: `stage-panel`
- Existing migration-in-progress: `liquid-card` (acceptable only in already-migrating files)
- Surface context system: `--ctx-well` / `--ctx-card` / `--ctx-dropdown` (not `--stage-input-bg`)
- Tailwind v4 landmine: never write a literal arbitrary-value utility that references an interpolated CSS custom property in any repo file (including docs and comments). Tailwind v4's content scanner grabs the raw string, tries to generate a CSS class from it, and the broken class breaks the CSS parser. Talk about these patterns in prose only.

## Voice

Precision instrument (Teenage Engineering / Leica / Linear). Sentence case. **No exclamation marks.** Production vocabulary: "show" not "event" where domain fits, "crew" not "resources".

## Brand enforcement

- Product: **Unusonic** (was Signal / Signal Live)
- AI: **Aion** (was ION, Arthur)
- Legacy storage keys: `signal_*` → `unusonic_*`
- Legacy routes: `/api/ion` → `/api/aion`
- Legacy components: `IonInput`/`IonVoice`/`IonLens` → `AionInput`/`AionVoice`/`AionLens`
- Exceptions: `ion` as English suffix (action, function, motion, dimension) is fine

## Reference docs (tracked in the gitignored `docs/` on Daniel's machine)

Even though you can't read them from the clone, questions may reference them. Daniel usually includes the relevant doc's key points in the queue entry's context. When a question cites one of these and you don't have context, say so in the doc.

- `docs/reference/code/directory-schema.md` — people/companies/venues
- `docs/reference/code/cortex-schema.md` — graph edges, AI memory
- `docs/reference/code/finance-schema.md` — proposals, invoices, QBO
- `docs/reference/code/catalog-and-aion-schema.md` — catalog + Aion AI
- `docs/reference/event-and-deal-pages-layout-and-functionality.md`
- `docs/reference/crm-page-state-and-flow.md`
- `docs/reference/deal-to-event-handoff-wizard-upgrade.md`
- `docs/reference/crew-equipment-and-smart-transport-design.md`
- `docs/reference/verified-kit-system-design.md`
- `docs/reference/follow-up-engine-design.md` — canonical follow-up + Aion agent architecture
- `docs/reference/code/session-management.md`
- `docs/reference/design/` — 23 documents on Stage Engineering
- `docs/onboarding-subscription-architecture.md`

## Security

- RLS non-negotiable. All data `workspace_id` scoped.
- Service role (`system.ts`) never exposed client-side.
- Passkey auth never bypassed.
- Stripe webhooks must verify `stripe-signature` via `stripe.webhooks.constructEvent()` before any DB access.

## Current notable state (as of 2026-04-10)

- Brain tab is paused (`"Brain Mode is paused — waiting for timeline engine"`). Components exist but unwired: `AionInput.tsx`, `AionVoice.tsx`, `ChatInterface.tsx`.
- `/api/aion/route.ts` is a 16-line unauthenticated GPT-4-turbo stub. Phase 2 prerequisites (auth guard, `getDealContextForAion`, `/api/aion/draft-follow-up`, model upgrade) are not-started.
- Phase 1 of the follow-up engine is shipped: `ops.follow_up_queue` + `ops.follow_up_log` tables exist, `/api/cron/follow-up-queue/route.ts` is live, Follow-Up Card is in the Deal Lens.
- Client portal Phases 0.5 / B / C / D shipped in commit `a311dad`.
- Legacy renames still pending: `ION_SYSTEM` / `ION_FULL_SYSTEM` constants in `package-generator.ts`, `SIGNAL_SPRING_DURATION_MS` in `motion-constants.ts`, `ArthurInput.tsx` (empty file, delete candidate).
