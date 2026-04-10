# Brain / Aion AI Surface — Weekly Audit + Research
_2026-04-10 · scheduled agent run_

---

## Summary

- **Critical — unauthenticated API route:** `src/app/api/aion/route.ts` accepts POST requests with no auth check, no workspace scoping, and no input validation. Any unauthenticated caller can hit it and burn OpenAI quota.
- **Critical — wrong model on the primary Aion route:** `route.ts` uses `openai('gpt-4-turbo')`. The project's model standard is Claude Opus 4.6 / Sonnet 4.6 / Haiku 4.5 via Anthropic. OpenAI should not be the Aion model at all.
- **Critical — SECURITY DEFINER REVOKE missing across 19 migrations:** Every `SECURITY DEFINER` function in `supabase/migrations/` is missing `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon`. Postgres grants EXECUTE to PUBLIC by default; these RPCs are callable by any anon request.
- **Major — ArthurInput.tsx is an empty dead file (legacy brand):** `brain/components/ArthurInput.tsx` exists but has 0 bytes. This is a leftover from the Arthur → Aion rename. It should be deleted.
- **Major — SessionContext routes all messages through `NEXT_PUBLIC_AION_VOICE_WEBHOOK`:** Text messages are not going through `/api/aion` — they go through an external n8n/webhook URL. The internal API route at `/api/aion/route.ts` is effectively unused for production chat. These two code paths are completely disconnected.

---

## Area audit findings

### Critical

**C-1 — No authentication on `/api/aion` route**
`src/app/api/aion/route.ts:7–16` — The POST handler calls `req.json()` and immediately invokes `streamText` with no session check, no workspace scoping, and no rate limiting. Any unauthenticated caller with knowledge of the route can make LLM calls billed to the project's OpenAI key. Minimum fix: call `createClient()` (server), verify a valid session, and scope the call to the authenticated workspace.

**C-2 — Wrong model: `gpt-4-turbo` on the Aion route**
`src/app/api/aion/route.ts:11` — Uses `openai('gpt-4-turbo')`. CLAUDE.md mandates Anthropic Claude (Opus 4.6 / Sonnet 4.6 / Haiku 4.5). `gpt-4-turbo` is also a stale model (superseded by gpt-4o). The route should be migrated to `anthropic('claude-sonnet-4-6')` with prompt caching enabled. Note: this route appears to be dead code given that `SessionContext` routes to an external webhook instead — but if it is ever re-activated, the model ID is wrong.

**C-3 — No prompt caching on Aion route**
`src/app/api/aion/route.ts` — No `experimental_providerMetadata` with `anthropic: { cacheControl: { type: 'ephemeral' } }` present. CLAUDE.md (via `claude-api` skill guidance) mandates prompt caching on all Anthropic API routes. This is a cost issue at scale.

### Major

**M-1 — `ArthurInput.tsx` is an empty 0-byte legacy artifact**
`src/app/(dashboard)/(features)/brain/components/ArthurInput.tsx` — The file exists (confirmed via `wc -c`: 0 bytes). This is a ghost of the Arthur → Aion rename. It does nothing but pollute the component directory and signal an incomplete migration. Delete it.

**M-2 — `SessionContext.sendMessage` bypasses `/api/aion` entirely**
`src/shared/ui/providers/SessionContext.tsx:192–221` — All messages (text, file, voice) are routed to `process.env.NEXT_PUBLIC_AION_VOICE_WEBHOOK`. If that env var is unset, every chat message returns an error. The internal `/api/aion` route is never called by the UI. This means the Brain tab is non-functional in any environment that does not have the external webhook configured. There is no fallback to `/api/aion`.

**M-3 — Wrong model IDs in `src/features/ai/tools/`**
`src/features/ai/tools/rider-parser.ts:99` — `openai('gpt-4o')`
`src/features/ai/tools/package-generator.ts:81,133` — `openai('gpt-4o')` (×2)
`src/features/intelligence/api/scout.ts:396,441,479` — `model: 'gpt-4o-mini'` (×3)
`src/features/intelligence/api/scout.ts:517` — `model: 'gpt-4o'`
These are all OpenAI calls. While OpenAI may be intentional for scout (web scraping / JSON extraction), the CLAUDE.md AI standard is Claude. These should at minimum be tracked as deliberate exceptions and noted in docs. The rider parser and package generator in particular operate on workspace data and should be evaluated for migration to Anthropic models.

**M-4 — `SessionContext` sends chat history to an external webhook without sanitisation**
`src/shared/ui/providers/SessionContext.tsx:216–220` — The `messages` array from state is sent verbatim to `NEXT_PUBLIC_AION_VOICE_WEBHOOK`. There is no stripping of any injected assistant messages a previous bad response could have written into localStorage. A malicious assistant response could seed the next turn's context with prompt-injection payloads.

**M-5 — No system prompt / workspace context injected into Aion**
`src/app/api/aion/route.ts:7–16` — The route passes raw `messages` from the client to the model with zero system prompt, no workspace context, no user identity, and no tool definitions. There is no grounding in what Unusonic is, who the user is, or what they can do. Even if the auth issue were fixed, the model would have no platform knowledge.

### Minor

**m-1 — `AIStatus.tsx` renders hardcoded static stub data**
`src/app/(dashboard)/(features)/brain/components/AIStatus.tsx:32–36` — Latency (`24ms`), System (`Operational`), and Memory (`Healthy`) are hardcoded strings. These are not connected to any real health check or metric. If this component is user-visible, it is misleading.

**m-2 — `AionVoice.tsx` uses `animate-ping` on the record button**
`src/app/(dashboard)/(features)/brain/components/AionVoice.tsx:103` — The recording state applies `animate-ping`, which is a Tailwind CSS keyframe utility, not a Framer Motion spring. CLAUDE.md and Stage Engineering mandate weight-based Framer Motion springs (`STAGE_HEAVY/MEDIUM/LIGHT`) for elements that appear/disappear. The ping animation is specifically called out as an anti-pattern in Stage Engineering (Aurora/float effects).

**m-3 — `ChatInterface.tsx` does not use `motion.div` spring on initial load of empty state**
`src/app/(dashboard)/(features)/brain/components/ChatInterface.tsx:31–38` — The empty-state div fades in with `initial={{ opacity: 0 }}` / `animate={{ opacity: 1 }}` using no `transition` override, so it falls back to Framer's default easing rather than `STAGE_LIGHT`. Minor but inconsistent with the design system.

**m-4 — `AionInput.tsx` uses direct inline OKLCH values rather than tokens**
`src/app/(dashboard)/(features)/brain/components/AionInput.tsx:104` — `border-[oklch(1_0_0_/_0.10)]`, `focus-within:ring-[var(--stage-accent)]`, `shadow-[0_4px_24px_-4px_oklch(0_0_0_/_0.35)]`. While these are OKLCH values (correct format), the border and shadow values are raw literals not defined in `globals.css` tokens. CLAUDE.md says use OKLCH tokens from `globals.css` — raw inline values bypass the design token system and break with theme changes.

**m-5 — `M3_DURATION_S` / `M3_EASING_ENTER` motion constants in `AIStatus.tsx`**
`src/app/(dashboard)/(features)/brain/components/AIStatus.tsx:4` — Imports `M3_DURATION_S` and `M3_EASING_ENTER`. These are Material 3 duration/easing values, not Stage Engineering physics. Stage Engineering mandates `STAGE_HEAVY`, `STAGE_MEDIUM`, `STAGE_LIGHT` springs. These M3 constants are a design system violation for new code.

**m-6 — `SessionContext.tsx` stores full message history in localStorage without size cap**
`src/shared/ui/providers/SessionContext.tsx:113–118` — Every message is persisted to `localStorage` with no pruning or size limit. On a long-running session this will silently fail once localStorage is full (`catch` block swallows the error).

---

## Cross-cutting findings

### Design landmines

**Tailwind v4 wildcard bug:** No matches found for `bg-[var(--*)]` wildcard pattern. Nothing flagged this run.

**Hardcoded colors in components (Brain scope):** `AionInput.tsx` and `AionVoice.tsx` use raw OKLCH literals inline (e.g., `oklch(1_0_0_/_0.10)`, `oklch(0.35_0.08_20_/_0.25)`) rather than named `globals.css` tokens. These are not hex/rgb violations per the strict grep, but they fragment the design token system. Flagged as minor design debt — see m-4.

**Legacy `liquid-card` in recently-modified files:** `liquid-card` appears only in `src/shared/ui/liquid-panel.tsx` (the definition) and `src/app/globals.css` (the token definition). No appearance in files modified in the last 30 days outside the definition files. Nothing flagged this run.

**`--stage-input-bg` usage in new code:** Several widget files use `var(--ctx-well, var(--stage-input-bg))` as a graceful fallback pattern — this is correct migration practice per CLAUDE.md §11. The `--stage-input-bg` usages in `globals.css` are token definitions. Nothing flagged as a violation this run.

**Portal pattern violation:** No `fixed inset-0` elements found in the Brain component files. Nothing flagged this run.

### Auth/security landmines

**Brand legacy storage keys:** No `signal_trusted_device`, `signal_current_org_id`, `signal_current_entity`, `signal_org_ids`, or `signal_recovery_prompt` strings found in `src/`. Nothing flagged this run.

**SECURITY DEFINER REVOKE missing — CRITICAL, affects 19 migrations:**
Every `SECURITY DEFINER` function across the following migrations is missing `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon`:

- `supabase/migrations/20260227220000_workspace_roles_and_capabilities.sql` (line 149)
- `supabase/migrations/20260227230000_normalize_workspace_role_permissions.sql`
- `supabase/migrations/20260228063445_move_workspace_roles_to_ops.sql`
- `supabase/migrations/20260228070044_backfill_directory_cortex.sql`
- `supabase/migrations/20260304020940_cortex_remove_relationship_rpc.sql`
- `supabase/migrations/20260307005617_add_patch_relationship_context_rpc.sql` (line 33)
- `supabase/migrations/20260307013331_add_roster_member_rpc.sql` (line 22)
- `supabase/migrations/20260310053252_create_ops_workspace_industry_tags.sql`
- `supabase/migrations/20260313041710_fix_invoice_rpc_override_price_multiplier.sql`
- `supabase/migrations/20260314184845_add_audit_trail_to_cortex_relationships.sql`
- `supabase/migrations/20260314204800_add_merge_industry_tags_rpc.sql` (line 19)
- `supabase/migrations/20260314204809_add_patch_entity_attributes_rpc.sql` (line 14)
- `supabase/migrations/20260323210625_add_increment_proposal_view_rpc.sql` (line 13)
- `supabase/migrations/20260324100000_fix_patch_relationship_context_no_updated_at.sql`
- `supabase/migrations/20260325000100_create_get_deal_crew_enriched_rpc.sql` (line 21)
- `supabase/migrations/20260401000000_catalog_availability.sql` (line 38)
- `supabase/migrations/20260402120200_seat_and_show_count_rpcs.sql` (lines 11, 25, 38)
- `supabase/migrations/20260403000400_update_get_deal_crew_enriched_v2.sql` (line 8)
- `supabase/migrations/20260403260000_create_patch_event_ros_data.sql` (line 11)

Postgres grants `EXECUTE` to `PUBLIC` by default. Missing `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon` means any anonymous caller can invoke these RPCs directly — including `patch_entity_attributes`, `add_roster_member`, `patch_relationship_context`, and `remove_relationship`. These are data-mutation functions. This is a systemic critical security gap affecting the entire `cortex.relationships` write-protection model.

**Service role client boundary:** `src/features/intelligence/lib/aion-gate.ts` imports `getSystemClient` from `src/shared/api/supabase/system`. It has `import 'server-only'` at line 13. Boundary is respected. Nothing else flagged this run.

**Cortex write protection:** No `FOR INSERT|UPDATE|DELETE` RLS policies found on `cortex.relationships` in migrations. The SELECT-only protection is intact. Nothing flagged this run.

**Stripe signature verification:** No `/api/*stripe*` routes touched by this area scope. Nothing flagged this run.

---

## Research — gaps

The reference docs `docs/reference/catalog-and-aion-schema.md`, `docs/reference/follow-up-engine-design.md`, and `docs/reference/cortex-schema.md` **do not exist** in the repository at the time of this run. The audit instruction to read them before starting could not be fulfilled. This means:

1. There is no written specification for the Aion AI schema beyond what can be inferred from the codebase.
2. There is no documented follow-up engine design — a note in `src/features/onboarding/actions/complete-setup.ts:247` reads: _"Blocked on: Aion RAG pipeline (cortex.memory ingestion endpoint)."_ confirming `cortex.memory` is unbuilt.
3. `src/features/intelligence/lib/aion-gate.ts` defines a three-tier Aion capability model (`passive / active / autonomous`) and references `increment_aion_actions` RPC and `aion_actions_used` / `aion_actions_reset_at` columns, but there is no migration that creates these columns. The code works around this with `as Function` casts and inline fallbacks (lines 85, 101).

**Documented but unbuilt:**
- `cortex.memory` — the RAG/vector brain. Zero migrations, zero server actions, zero API routes touch it. Aion has no long-term memory.
- Aion tool use / actions — `canExecuteAionAction` (`aion-gate.ts`) implements a gate for autonomous actions, but there are no defined tools or server actions that call it, other than the gate itself.
- Follow-up engine — `src/app/api/cron/follow-up-queue/route.ts` exists (confirmed in system client import list) suggesting a follow-up queue table was migrated (`supabase/migrations/20260330120000_create_follow_up_queue_and_log.sql`), but there is no Aion skill wired to act on it.
- Context loading — Aion has no system prompt and receives zero workspace context on each turn (no deals, no upcoming events, no crew, no memory). The `SessionContext` sends raw chat text to an external webhook; what that webhook does with it is outside this codebase.
- Workspace-aware model routing — `aion-gate.ts` defines passive/active/autonomous modes but the current `/api/aion` route does not check the gate.

---

## Research — improvement ideas

### 1. Wire `/api/aion` as the canonical endpoint with workspace context (Impact: High / Effort: Medium)

**Problem:** The Brain tab's `SessionContext` routes all messages to `NEXT_PUBLIC_AION_VOICE_WEBHOOK` — an external n8n or similar service. The internal `/api/aion/route.ts` is dead code. This means: (a) the Brain tab is non-functional without a separately maintained webhook, (b) Aion has zero access to workspace data, (c) auth and billing are bypassed entirely.

**Proposal:** Replace the webhook-first architecture with a first-class `/api/aion` route that:
1. Verifies session via `createClient()` (server)
2. Resolves the workspace and loads a lightweight context bundle (next 3 upcoming events, active deal count, recent crew assignments) from existing server actions
3. Injects a Unusonic system prompt via Anthropic `claude-sonnet-4-6` with prompt caching on the system turn
4. Streams the response back to `ChatInterface` via Vercel AI SDK `useChat` (replacing the hand-rolled `SessionContext` fetch)
5. Checks `canExecuteAionAction` gate before any active/autonomous action

This is the single highest-leverage change. It makes the Brain tab functional, gives Aion platform awareness, and sets up the architecture for tools.

**Surface area:** `src/app/api/aion/route.ts` (full rewrite), `src/shared/ui/providers/SessionContext.tsx` (replace `sendMessage` with `useChat`), possibly a new `src/features/aion/api/get-aion-context.ts` server action.

**Why now:** The Brain tab is the flagship AI surface. Until it has auth and workspace context, it cannot be shown to clients.

---

### 2. Bootstrap `cortex.memory` with the follow-up queue as the first "memory write" (Impact: High / Effort: Medium)

**Problem:** `cortex.memory` — the intended home for all Aion memory and RAG — does not exist yet. There is an acknowledged blocker comment in `complete-setup.ts:247`. Meanwhile, `20260330120000_create_follow_up_queue_and_log.sql` suggests a follow-up queue exists in the DB. Aion can't remember anything across sessions, and can't surface pending follow-ups to the user.

**Proposal:** Create the `cortex.memory` table migration (type: `text`, `embedding vector(1536)`, `workspace_id`, `entity_id`, `created_at`, `expires_at`), then wire the follow-up queue as the first "Aion reads from memory" use case: when a user opens Brain, inject a summary of open follow-up items from the queue into the system context. This gives Aion something real to say ("You have 3 pending follow-ups this week") before any tools are built.

**Surface area:** 1 new migration (`cortex.memory`), 1 server action to read follow-up queue, injection into the system prompt context bundle.

**Why now:** The follow-up queue infrastructure is already in the DB. This is the lowest-effort path to Aion having real workspace memory without building a full RAG pipeline first.

---

### 3. Add `REVOKE EXECUTE` remediation migration for all SECURITY DEFINER RPCs (Impact: Critical / Effort: Low)

**Problem:** 19 migrations define `SECURITY DEFINER` functions without revoking public execute access. This means any anonymous Supabase client can call `patch_entity_attributes`, `add_roster_member`, `patch_relationship_context`, `remove_relationship`, and others directly — bypassing the RPC's internal auth guards if the guard logic has any flaw.

**Proposal:** Write a single remediation migration that issues `REVOKE EXECUTE ON FUNCTION <fn>(...) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION <fn>(...) TO authenticated;` for every affected function. This is a pure security hardening change with no product-visible impact.

**Surface area:** 1 new migration file. No application code changes needed.

**Why now:** This is the highest-severity finding in this audit. The cortex write-protection model (RPCs as the only write path) depends on these RPCs being protected. Without REVOKE, an anon caller can invoke them.

---

## Recommended next actions

1. **[Security, do immediately]** Write a remediation migration to `REVOKE EXECUTE FROM PUBLIC, anon` on all SECURITY DEFINER RPCs. Start with the highest-risk functions: `patch_entity_attributes`, `add_roster_member`, `patch_relationship_context`, `remove_relationship`. Then cover the rest.

2. **[Security, do before any Brain tab demo]** Add auth + workspace scoping to `src/app/api/aion/route.ts`. At minimum: verify session, validate `workspace_id` from body against the user's memberships, return 401 if not a member.

3. **[Architecture]** Decide: is the Brain tab driven by `/api/aion` or by the external webhook? Pick one. If webhook is kept, document it in CLAUDE.md. If `/api/aion` is the canonical path, delete the webhook fallback from `SessionContext` and wire `useChat` from the Vercel AI SDK.

4. **[Dead code]** Delete `src/app/(dashboard)/(features)/brain/components/ArthurInput.tsx` (0-byte legacy file).

5. **[Model]** Update `src/app/api/aion/route.ts` to use `anthropic('claude-sonnet-4-6')` with prompt caching. Remove the `@ai-sdk/openai` import from this file.

6. **[Docs]** Create `docs/reference/catalog-and-aion-schema.md` and `docs/reference/cortex-schema.md`. These are referenced in audit instructions and CLAUDE.md but do not exist. Future sessions waste tokens discovering this.

7. **[Memory]** Create the `cortex.memory` table migration. Even a minimal schema (id, workspace_id, content text, created_at) unblocks the `complete-setup.ts:247` blocker comment and gives Aion a write target.

8. **[Model freshness]** Audit `src/features/intelligence/api/scout.ts` and `src/features/ai/tools/` — decide whether to keep OpenAI models or migrate to Anthropic. Document the decision in CLAUDE.md under "AI model policy".
