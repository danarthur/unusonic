# Aion Phase A: Voice Setup Form and First Real Draft

_Researched: 2026-04-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Brain tab page** (`src/app/(dashboard)/brain/page.tsx:12`): hardcoded paused message — "Brain Mode is paused." No feature flag, no form. The components in `brain/components/` (`AionInput.tsx`, `AionVoice.tsx`, `ChatInterface.tsx`) are fully built but not rendered anywhere.

**`/api/aion/route.ts:7`**: 16-line unauthenticated stub. Accepts `{ messages }`, calls `gpt-4-turbo` with no system prompt, no workspace context, no auth guard. No route exists at `/api/aion/draft-follow-up`.

**`SessionContext.tsx:192`**: The existing `sendMessage()` function routes to `NEXT_PUBLIC_AION_VOICE_WEBHOOK` — an external webhook — not to the internal `/api/aion` route. The two are decoupled.

**`aion_config` column**: Does not exist. `public.workspaces` (`src/types/supabase.ts:1107`) has `aion_actions_used` and `aion_actions_reset_at` for metering but no voice configuration field anywhere in the schema.

**`getDealContextForAion`**: Does not exist in the codebase.

**`agent_configs` table** (`src/types/supabase.ts:17`): Already exists — created during onboarding (`src/features/onboarding/actions/complete-setup.ts:205`). One row per workspace (isOneToOne: true). Columns: `agent_mode`, `persona`, `modules_enabled`, `xai_reasoning_enabled`. No `voice_style_text` or equivalent.

**Follow-up engine** (`src/app/api/cron/follow-up-queue/route.ts:1`): Fully operational. Scores deals daily, upserts into `ops.follow_up_queue`. Each queue item carries a `context_snapshot` with `deal_title`, `client_name`, `event_date`, `proposal_status`, `proposal_views` (`route.ts:259`). The follow-up card in the Deal Lens (`src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx:1`) reads queue items and logs actions.

**Legacy flags**: `ArthurInput.tsx` is an empty file (0 bytes). `ION_SYSTEM` and `ION_FULL_SYSTEM` exist in `src/features/ai/tools/package-generator.ts:22,102` — flagged for rename.

## Intended state

Daniel opens the Brain tab, writes 3 paragraphs about how he talks to clients, saves them, and immediately sees an Aion-generated follow-up draft for his top pending deal — one that sounds like him, not a generic template.

Architecturally, that requires:
- A persistent voice configuration column on a workspace-scoped table
- A voice setup form in the Brain tab
- An auth-gated `/api/aion/draft-follow-up` route that reads the voice config and the top queue item's `context_snapshot`, then returns a streaming draft

The adjacent pattern is the cron engine's `contextSnapshot` — it already assembles exactly the deal context needed for a draft (title, client, date, proposal state). A first draft does not need a full `getDealContextForAion` implementation; it can read directly from `ops.follow_up_queue.context_snapshot`.

## The gap

- No `voice_style_text` column anywhere in the schema
- Brain tab page renders only a paused placeholder — no form
- No `/api/aion/draft-follow-up` route
- `/api/aion/route.ts` has no auth guard (secondary concern for Phase A)
- No server action to read or write voice configuration
- `getDealContextForAion` not started — but the queue's `context_snapshot` is a viable substitute for Phase A

## Options

### Option A: `agent_configs` column + Brain tab form + draft route (recommended)

- **What it is:** Add `voice_style_text TEXT` to `public.agent_configs` (the existing 1-1 Aion config table). Replace the Brain tab paused message with a voice setup textarea + a "Draft follow-up" button. Build `/api/aion/draft-follow-up` — auth-gated, reads `agent_configs.voice_style_text`, fetches the top `ops.follow_up_queue` item for the workspace, builds a system prompt with the voice text, and streams back a draft email.
- **Effort:** Medium — 1 migration, types regen, 2 server actions, 1 new API route, Brain tab page replacement (6 files total)
- **Main risk:** Brain tab page becomes a real UI for the first time; if the voice form design is rushed, it will need a polish pass before demo
- **Unlocks:** Daniel can train Aion's voice in one sitting and see an immediate output; real voice data to tune against; Phase B (per-deal draft trigger from the deal lens) becomes trivial

### Option B: `aion_config` JSONB on `public.workspaces`

- **What it is:** Add `aion_config JSONB DEFAULT '{}'` to `public.workspaces`. Store `{ voice_style_text: string }` inside it. Same Brain tab and draft route as Option A.
- **Effort:** Medium — same number of files, different migration target
- **Main risk:** `workspaces` already has 26 columns for billing, domain, and portal config; adding Aion config here makes the table harder to reason about. Arbitrary JSONB also loses column-level type safety and RLS granularity. Harder to extend with structured fields later.
- **Unlocks:** Same as A, with worse long-term ergonomics

### Option C: Voice form only, draft deferred

- **What it is:** Add the `voice_style_text` column to `agent_configs` and build the setup form, but replace the "Draft follow-up" section with a static placeholder. Defers the draft route to a follow-up session.
- **Effort:** Small — 1 migration, types regen, 1 server action, Brain tab form only (4 files)
- **Main risk:** Delivers no observable outcome. The whole point of the exercise is to see the draft immediately — without it, the voice data just sits unread and motivation drops.
- **Unlocks:** Voice data collection only; the draft is still blocked

## Recommendation

Option A. The brain of this feature is the immediate feedback loop — write your voice, see a draft that sounds like you. Option C removes that loop and leaves the feature feeling incomplete. Option B has the same effort as A with a worse schema location.

`agent_configs` is semantically correct (`persona`, `agent_mode`, `modules_enabled` are already there), is 1-1 with workspace, and is writable via the standard server client with existing RLS. The `context_snapshot` field on `ops.follow_up_queue` already has everything the draft route needs — title, client name, event date, proposal state — so `getDealContextForAion` can be deferred. Build the draft route against the top queue item's snapshot. That is a hard-scoped, shippable Phase A.

One design note: the voice setup form should feel like a settings page, not a chat — a labelled textarea, a save button, a confirmation. The `AionInput` component is for chat; use a plain form here. The existing `ChatInterface` and `AionInput` components can come back in Phase B when the chat surface opens up.

## Next steps for Daniel

1. Write and run migration: `ALTER TABLE public.agent_configs ADD COLUMN voice_style_text TEXT;` — no RLS change needed (existing workspace_id policy covers it). Then `npm run db:types`.
2. Create `src/features/intelligence/api/get-voice-config.ts` — server action: read `agent_configs.voice_style_text` for current workspace. Create `src/features/intelligence/api/save-voice-config.ts` — server action: update `voice_style_text` on the workspace's `agent_configs` row.
3. Replace `src/app/(dashboard)/brain/page.tsx` with a voice setup form: a `<textarea>` bound to `voice_style_text`, a save button wired to `save-voice-config`, and a "Draft follow-up" section below.
4. Create `src/app/api/aion/draft-follow-up/route.ts` — POST, auth-gated (use server client + `getUser()`). Read `voice_style_text` from `agent_configs`. Fetch the top pending `ops.follow_up_queue` item for the workspace. Build system prompt from voice text. Call `streamText` with `claude-sonnet-4-6` and the `contextSnapshot`. Return `result.toTextStreamResponse()`.
5. Wire the Brain tab "Draft follow-up" button to call `/api/aion/draft-follow-up`, stream the response into a read-only text area.
6. Delete `src/app/(dashboard)/(features)/brain/components/ArthurInput.tsx` (empty file).

## References

- `src/app/(dashboard)/brain/page.tsx` — current paused state
- `src/app/api/aion/route.ts` — existing stub (no auth, no context)
- `src/shared/ui/providers/SessionContext.tsx:192` — sendMessage → external webhook, not internal route
- `src/types/supabase.ts:17` — `agent_configs` schema
- `src/features/onboarding/actions/complete-setup.ts:205` — agent_configs creation during onboarding
- `src/app/api/cron/follow-up-queue/route.ts:259` — `contextSnapshot` fields (the deal context we'll borrow)
- `src/features/intelligence/lib/aion-gate.ts` — existing tier gating (reuse in draft route)
- `src/features/ai/tools/package-generator.ts:22,102` — `ION_SYSTEM`/`ION_FULL_SYSTEM` legacy names (flag for rename separately)
