# Brain / Aion weekly audit — 2026-04-11

## Summary

Audited all Brain tab components, the `/api/aion` route, `src/features/intelligence/`, and the follow-up queue cron. The `/api/aion/route.ts` is the most critical finding: it has no auth guard, no Zod validation, no rate limiting, and uses `gpt-4-turbo` instead of a production-approved model. Schema presence for Phase 1 tables is confirmed. Phases 2+ (auth guard, `getDealContextForAion`, `aion_config`, few-shot examples) are not started. Overall health: **yellow** (functional but with an unauthenticated AI endpoint and several missing phase deliverables).

---

## Area audit findings

### FSD layer violations

Nothing flagged this run.

Brain components (`AionInput.tsx`, `AionVoice.tsx`, `ChatInterface.tsx`, `AIStatus.tsx`) import only from `@/shared/*` — correct for the app layer. The `ChatInterface` imports `AionInput` via an absolute intra-app path (`@/app/(dashboard)/(features)/brain/components/AionInput`), which is an intra-layer reference. Technically not a violation but worth moving to a local `./AionInput` relative import to avoid coupling.

`src/features/intelligence/lib/aion-gate.ts` imports from `@/shared/lib/tier-gate` and `@/shared/lib/tier-config` — correct direction (features → shared).

### AI SDK usage

`/home/user/unusonic/src/app/api/aion/route.ts:11` — model is `openai('gpt-4-turbo')`. Per CLAUDE.md this model is "not production-ready" and should be upgraded. The file uses `streamText` (current standard) and `result.toTextStreamResponse()` (current). No `StreamingTextResponse` usage found in app code.

`/home/user/unusonic/src/features/ai/tools/package-generator.ts:81,133` — uses `openai('gpt-4o')`. Acceptable but undocumented as the approved model for this use-case.

`/home/user/unusonic/src/features/intelligence/api/scout.ts:396,441,479` — uses `gpt-4o-mini` for sub-agents; line 517 uses `gpt-4o` for master. No issues.

### Supabase client boundary

`/home/user/unusonic/src/features/intelligence/lib/aion-gate.ts:17,79,118` — correctly imports `getSystemClient` from `system.ts` and is marked `import 'server-only'` at line 13. No client-side system client usage found.

`/home/user/unusonic/src/features/intelligence/api/scout.ts` — uses `createClient` from server.ts plus direct `OpenAI` SDK; marked `'use server'` and `import 'server-only'`. Correct.

Brain components (all in `src/app/(dashboard)/(features)/brain/components/`) are client components; none import `system.ts`. Clean.

### Cortex write protection

Nothing flagged this run. No direct `cortex.relationships` INSERT/UPDATE/DELETE found in Brain or intelligence feature files. All writes in `aion-gate.ts` go to `public.workspaces`, not cortex.

### Brand legacy

**Flag — `ION_SYSTEM` / `ION_FULL_SYSTEM` constants:** `/home/user/unusonic/src/features/ai/tools/package-generator.ts:22,102` — exported const names use `ION_` prefix. The string body reads "You are Aion..." (correct), but the constant identifiers are legacy. Should be renamed to `AION_SYSTEM` / `AION_FULL_SYSTEM`.

**Flag — `SIGNAL_SPRING_DURATION_MS`:** `/home/user/unusonic/src/shared/lib/motion-constants.ts:116` — exported constant uses the old `SIGNAL_` prefix despite a `@deprecated` comment. The comment reads "Legacy settling time for UNUSONIC_PHYSICS spring." Should be renamed to `UNUSONIC_SPRING_DURATION_MS` (or removed if unused outside this file — `THINKING_TRIGGER_DELAY_MS` at line 119 is its only consumer in the file; no external callers found).

**Flag — `signal-qbo-default-salt`:** `/home/user/unusonic/src/shared/api/quickbooks/server-env.ts:28` — `QBO_TOKEN_ENCRYPTION_SALT` fallback string is `'signal-qbo-default-salt'`. This is a runtime encryption salt fallback; changing it would invalidate all existing encrypted QBO tokens in production databases that rely on the default. Flag for awareness only — do not rename without a coordinated token re-encryption migration.

**`ArthurInput.tsx`:** `/home/user/unusonic/src/app/(dashboard)/(features)/brain/components/ArthurInput.tsx` — file exists at 0 bytes (empty). It is not imported anywhere. The file should be deleted to remove the `Arthur` naming from the component tree.

**`package-generator-schema.ts` type names:** The schema file at `/home/user/unusonic/src/features/ai/tools/package-generator.ts:16-19` imports `CatalogItemForION` and `GetCatalogForIONResult` types. These type names contain the legacy `ION` identifier. Should be renamed to `CatalogItemForAion` / `GetCatalogForAionResult`.

### Design system compliance

Brain components use `stage-panel` class (current standard) in `ChatInterface.tsx` (lines 52, 63, 72) and the Brain page (`/home/user/unusonic/src/app/(dashboard)/brain/page.tsx:8`). Correct.

`AionInput.tsx` uses `bg-[var(--stage-surface-raised)]`, `bg-[oklch(...)]`, `bg-[var(--stage-accent)]` etc. These are OKLCH token or stage-token references — not raw hex and not `bg-[var(--token-*)]` wildcards. No violations in the scoped files.

`AionVoice.tsx` uses inline `oklch(...)` color strings directly in className (`bg-[oklch(0.35_0.08_20_/_0.25)]` etc.). These are not violating the "no raw hex" rule (they are OKLCH), but they are hardcoded literal values rather than named tokens from `globals.css`. Minor issue; not a hard violation but should migrate to named tokens.

`AIStatus.tsx` uses `bg-[var(--stage-surface)]` — stage token, correct.

### Voice

`/home/user/unusonic/src/app/(dashboard)/brain/page.tsx:12` — heading reads `"Brain Mode is paused"` with capital B and M (title case). Should be `"Brain mode is paused"` (sentence case per design system voice rules).

`AIStatus.tsx` status labels (`'Core Status'`, `'Average Response'`, `'Stability'`) at lines 33-35 use title case. Should be sentence case: `'Core status'`, `'Average response'`, `'Stability'` (last one already acceptable).

### Dead code

`/home/user/unusonic/src/app/(dashboard)/brain/page.tsx` — renders a "Brain Mode is paused" stub. The Brain tab has no live chat interface rendered; `ChatInterface.tsx`, `AionInput.tsx`, and `AionVoice.tsx` exist under `(features)/brain/` but are not wired into any route page. These components appear unused by any reachable page.

`/home/user/unusonic/src/app/(dashboard)/(features)/brain/components/ArthurInput.tsx` — empty file (0 bytes), unreferenced. Dead file.

`/home/user/unusonic/src/app/api/aion/route.ts` — present but without auth guard, workspace context, or follow-up integration. Effectively a development stub exposed as a live endpoint.

### Security

**CRITICAL — No auth guard on `/api/aion`:** `/home/user/unusonic/src/app/api/aion/route.ts:7` — `POST` handler calls `streamText` directly without verifying a Supabase session. Any unauthenticated caller can invoke GPT-4-turbo at the workspace's OpenAI API key cost. Needs `createClient()` + `supabase.auth.getUser()` check before processing.

**No Zod validation on `messages`:** `/home/user/unusonic/src/app/api/aion/route.ts:8` — `const { messages } = await req.json()` with no schema validation. User-supplied `messages` array is passed directly to `streamText`. Risk: malformed input crashes the route; potential for prompt injection if system prompt is later added without sanitization.

**No rate limiting:** `/api/aion` has no rate-limiting middleware. Combined with no auth guard, this is an unbounded API spend vector.

---

## Cross-cutting findings

### New tables in public

`public.tier_config` — `/home/user/unusonic/supabase/migrations/20260402120100_tier_config_and_workspace_columns.sql:8`. Created in `public` schema. Note: this is a read-only configuration table seeded with tier data, accessed by authenticated users only. No workspace-scoping needed (it is workspace-agnostic config). The migration has RLS enabled with an `authenticated` SELECT-only policy. Acceptable use of `public` for a configuration table, similar to `public.invitations`. Consider documenting this exception in CLAUDE.md alongside `invitations`.

`public.push_subscriptions` — `/home/user/unusonic/supabase/migrations/20260403240000_create_push_subscriptions.sql:5`. Created in `public` with user-scoped RLS and a documented justification in the migration file (pre-auth-boundary, user-scoped like passkeys). Acceptable. Consider adding to CLAUDE.md exceptions list.

No other new `public` tables found in live migrations (archive migrations contain only passkeys/guardians/recovery_shards).

### RLS on new tables

`ops.follow_up_queue` — RLS enabled, four policies (SELECT/INSERT/UPDATE/DELETE), all using `get_my_workspace_ids()`. Clean.

`ops.follow_up_log` — RLS enabled, four policies. Clean.

`public.tier_config` — RLS enabled, SELECT-only for `authenticated`. Clean.

`public.push_subscriptions` — RLS enabled, SELECT/INSERT/DELETE scoped to `user_id = auth.uid()`. Clean.

All new tables in the audited migration range have RLS enabled. Nothing flagged.

### SECURITY DEFINER grants

The remediation migrations cited in the audit spec (`20260410160000`, `20260410170000`, `20260410180000`, `20260410220000`) do NOT exist in this repository. No `REVOKE EXECUTE ... FROM anon` statements appear anywhere in the live migrations.

**Functions not in the known-remediated list that have SECURITY DEFINER and no explicit anon REVOKE:**

- `public.cortex_relationships_audit_trail()` — `/home/user/unusonic/supabase/migrations/20260314184845_add_audit_trail_to_cortex_relationships.sql:23`. Trigger function, invoked by the DB trigger only (not callable via RPC). No `GRANT EXECUTE` issued; Postgres trigger functions are not callable by roles directly. Risk is low — cannot be called via `supabase.rpc()`.

- `public.member_has_capability(uuid, text)` — defined in `/home/user/unusonic/supabase/migrations/20260228063445_move_workspace_roles_to_ops.sql:190`. No `GRANT EXECUTE` and no `REVOKE EXECUTE FROM anon` in any migration. Postgres default: `PUBLIC` can execute. If the anon role can call this, they could probe workspace capability assignments. Recommend adding `REVOKE EXECUTE ON FUNCTION public.member_has_capability(uuid, text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.member_has_capability(uuid, text) TO authenticated;` in a new migration.

- `ops.patch_event_ros_data(uuid, jsonb)` — `/home/user/unusonic/supabase/migrations/20260403260000_create_patch_event_ros_data.sql:6`. Has `GRANT EXECUTE ... TO authenticated` (line 22) but no `REVOKE FROM PUBLIC`. Under Postgres defaults, `PUBLIC` implies both anon and authenticated can execute. The authenticated grant is redundant without the revoke. Recommend adding `REVOKE EXECUTE ON FUNCTION ops.patch_event_ros_data(uuid, jsonb) FROM PUBLIC;` first.

The four functions listed in the spec's known-remediated list (`patch_entity_attributes`, `upsert_relationship`, `patch_relationship_context`, `add_roster_member`, etc.) also have no `REVOKE FROM PUBLIC` or `REVOKE FROM anon` in any live migration. The spec says these are covered by the 20260410* migrations, but those migrations do not exist in the repo. This may mean the remediation work is planned but not yet applied.

### Catalog schema access

Nothing flagged this run. No `.schema('catalog').from(...)` call found in app code. The two references in `/home/user/unusonic/src/features/sales/api/catalog-delete.ts:89` and `/home/user/unusonic/src/app/(dashboard)/(features)/crm/actions/deal-crew.ts:132` are comments noting the correct RPC-only pattern.

### Typed entity attribute access

Nothing flagged this run. No raw `entity.attributes.xxx` access found in the scoped files (`src/features/intelligence/`, `src/app/api/aion/`).

### Deprecated AI SDK usage

Nothing flagged this run. No `StreamingTextResponse` import found in app code. (The term appears only in documentation files, `.claude/` agent specs, and `.cursor/rules/`.)

### Tailwind v4 wildcards

No `bg-[var(--token-*)]` or `text-[var(--token-*)]` wildcard patterns found. The widespread `bg-[var(--stage-*)]` and `bg-[var(--color-*)]` patterns use named tokens, not wildcard partial matches, and are within the Tailwind v4 supported JIT syntax.

### Async params / searchParams / cookies

Nothing flagged this run. The Brain page (`/brain/page.tsx`) and the Aion API route use no params or searchParams. No unawaited access found in the audited paths.

### Email plaintext

Nothing flagged this run. No email sending in the audited paths (Brain/Aion routes).

### Stripe webhook verification

Nothing flagged this run. `/home/user/unusonic/src/app/api/stripe-webhook/route.ts` correctly calls `stripe.webhooks.constructEvent(body, sig, webhookSecret)` before any DB access.

---

## Research — gaps

### Phase tracking

| Phase | Status | Evidence |
|---|---|---|
| Phase 1: `ops.follow_up_queue` + `ops.follow_up_log` tables | **shipped** | `supabase/migrations/20260330120000_create_follow_up_queue_and_log.sql` |
| Phase 1: `/api/cron/follow-up-queue/route.ts` | **shipped** | `src/app/api/cron/follow-up-queue/route.ts` — full scoring engine |
| Phase 1: Follow-Up Card in Deal Lens | **shipped** | `src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx` exists and wires to queue actions |
| Phase 1.1: Auto-trigger logic (days since last contact, upcoming shows) | **shipped** | Cron route lines 165–240 implement stall signal, event proximity, engagement, no-owner, no-activity scoring |
| Phase 2: Auth guard on `/api/aion` | **not-started** | `src/app/api/aion/route.ts` has no session check |
| Phase 2: `getDealContextForAion(dealId)` action | **not-started** | No file found matching this name |
| Phase 2: `/api/aion/draft-follow-up` route | **not-started** | Only `/api/aion/route.ts` exists; no `draft-follow-up` sub-route |
| Phase 2: Model upgrade from GPT-4-turbo | **not-started** | `route.ts:11` still uses `gpt-4-turbo` |
| Phase 2.1: Follow-up log stores AI edits (`draft_original`, `edit_classification`, `edit_distance`) | **not-started** | Columns not in any migration |
| Phase 3: Batch queue processing (digest mode) | **not-started** | Cron route processes all deals in a single run; no digest batching |
| Phase 3.5: Manual queue controls in Deal Lens | **in-progress** | `follow-up-card.tsx` has act/snooze/dismiss UI; no explicit "batch" manual controls |
| Phase 4: Follow-up preferences / opt-out | **not-started** | No migration or UI found |
| Phase 4.5: Scheduled delivery | **not-started** | No scheduled delivery logic found |
| Phase 5: Cross-deal intelligence | **not-started** | |
| Phase 6: Full Aion conversational surface | **not-started** | Brain page shows paused stub |
| Phase 7: Proactive intelligence | **not-started** | |
| Phase A: `public.workspaces.aion_config` JSONB column | **not-started** | Column not in any migration; `aion_actions_used`/`aion_actions_reset_at` added but not `aion_config` |
| Phase A: Voice setup form at `/brain` | **not-started** | Brain page is paused stub only |
| Phase A: Voice injection into draft prompt | **not-started** | No `aion_config` column exists |
| Phase B: Few-shot examples from `follow_up_log` edit pairs | **not-started** | `draft_original`/`edit_classification`/`edit_distance` columns missing from `ops.follow_up_log` |
| Phase C: Aion memory system (`cortex.memory` integration) | **not-started** | |
| Phase D: Cross-deal / cross-client intelligence | **not-started** | |
| Phase E: Proactive surfacing | **not-started** | |
| Phase F: Full conversational agent | **not-started** | |

### Schema presence

| Schema object | Status |
|---|---|
| `ops.follow_up_queue` table | **present** — `20260330120000_create_follow_up_queue_and_log.sql` |
| `ops.follow_up_log` table | **present** — same migration |
| `ops.follow_up_log.draft_original` column | **missing** |
| `ops.follow_up_log.edit_classification` column | **missing** |
| `ops.follow_up_log.edit_distance` column | **missing** |
| `public.workspaces.aion_config` column | **missing** |
| `ops.follow_up_queue.pre_generated_draft` column | **missing** |
| `public.workspaces.aion_actions_used` column | **present** — `20260402120100_tier_config_and_workspace_columns.sql` |
| `public.workspaces.aion_actions_reset_at` column | **present** — same migration |

### `/api/aion` route evolution

- Auth guard (session check): **no**
- `getDealContextForAion` action: **does not exist**
- Separate `/api/aion/draft-follow-up` route: **does not exist**
- Model in use: `gpt-4-turbo` (deprecated per CLAUDE.md)
- `aion_config.voice` injected into prompts: **no** (`aion_config` column does not exist)
- Few-shot examples from `follow_up_log` edit pairs: **no**

### Brain tab state

- Paused state visible: **yes** — `/home/user/unusonic/src/app/(dashboard)/brain/page.tsx` shows "Brain Mode is paused" stub
- Voice setup form: **no**
- `AionInput.tsx`: **present** at `src/app/(dashboard)/(features)/brain/components/AionInput.tsx`
- `AionVoice.tsx`: **present** at `src/app/(dashboard)/(features)/brain/components/AionVoice.tsx`
- `ChatInterface.tsx`: **present** at `src/app/(dashboard)/(features)/brain/components/ChatInterface.tsx`
- `ArthurInput.tsx`: **present but empty** (0 bytes) — dead file with legacy naming
- Components are built but not wired into any live route page

---

## Research — improvement ideas

1. **Add auth guard to `/api/aion`** — `src/app/api/aion/route.ts` is unauthenticated. Add `createClient()` + `getUser()` check at the top of `POST`. The CLAUDE.md Phase 2 spec calls for this; it is the highest-risk gap. Effort: **small** (3–5 lines, well-understood pattern from other routes).

2. **Add `aion_config` JSONB column to `workspaces` (Phase A)** — a single migration adds the column, and the voice setup form at `/brain` can be unblocked. Unlocks Phase B (few-shot personalization). Effort: **small** (migration + type regen) — the form UI already partially exists in the Brain component tree.

3. **Upgrade model from `gpt-4-turbo` to `gpt-4o`** — `src/app/api/aion/route.ts:11` — one-line change. `gpt-4o` is already the approved model in `package-generator.ts` and the scout master agent. Effort: **small**.

4. **Rename `ION_SYSTEM` / `ION_FULL_SYSTEM` constants** — `src/features/ai/tools/package-generator.ts:22,102`. Update constant names and their exported schema types (`CatalogItemForION`, `GetCatalogForIONResult`). The string content already reads "Aion"; only the identifiers are stale. Effort: **small** (rename + grep for callers in package-generator-schema.ts imports).

5. **Add `REVOKE EXECUTE FROM PUBLIC` on SECURITY DEFINER RPCs** — none of the live SECURITY DEFINER functions have explicit anon revokes. A single consolidation migration should revoke execute from `PUBLIC` and re-grant only to `authenticated` for all non-trigger SECURITY DEFINER functions. Priority: `member_has_capability` and `ops.patch_event_ros_data` first (these are callable via RPC, unlike the audit trigger function). The remediation migrations listed in the spec's known-covered list do not exist; this work needs to be done. Effort: **medium** (requires careful enumeration of all SECURITY DEFINER functions and their signatures).

---

## Recommended next actions

1. Add session check to `POST /api/aion` (`src/app/api/aion/route.ts`) — unauthenticated AI endpoint is an unbounded API spend risk.
2. Add Zod validation for the `messages` array in `POST /api/aion` before passing to `streamText`.
3. Write a migration adding `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC` for all non-trigger SECURITY DEFINER RPCs — especially `member_has_capability` and `ops.patch_event_ros_data`.
4. Upgrade `gpt-4-turbo` to `gpt-4o` in `src/app/api/aion/route.ts`.
5. Delete the empty `ArthurInput.tsx` file and rename `ION_SYSTEM`/`ION_FULL_SYSTEM`/`CatalogItemForION`/`GetCatalogForIONResult` identifiers in `package-generator.ts` and `package-generator-schema.ts`.
6. Add `public.tier_config` and `public.push_subscriptions` to the CLAUDE.md list of documented `public`-schema exceptions alongside `invitations`.
7. Write the `aion_config` column migration (Phase A) and wire the Brain page to a live chat interface — the UI components exist but no route page connects them.
