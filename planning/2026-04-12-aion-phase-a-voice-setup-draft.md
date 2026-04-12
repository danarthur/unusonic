# Aion Phase A: voice setup + first follow-up draft

_Researched: 2026-04-12 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Brain tab** (`src/app/(dashboard)/brain/page.tsx:12`): shows a static "Brain Mode is paused" placeholder. The 3D network is disabled pending a timeline engine. Nothing interactive.

**Chat infrastructure exists but is stranded**: `ChatInterface.tsx`, `AionInput.tsx`, and `AionVoice.tsx` all exist under `brain/components/`. A working `/chat` page at `src/app/(dashboard)/chat/page.tsx:1` already renders `ChatInterface`. These components read from `SessionContext`.

**Two disconnected Aion wiring paths:**
1. `SessionContext.sendMessage()` (`src/shared/ui/providers/SessionContext.tsx:210`) routes everything to `NEXT_PUBLIC_AION_VOICE_WEBHOOK` — an external webhook. Not connected to `/api/aion`.
2. `/api/aion/route.ts:7` is a 16-line unauthenticated POST stub using GPT-4-turbo. Nothing in the codebase calls it.

**No workspace voice profile**: `public.workspaces` has `aion_actions_used` and `aion_actions_reset_at` (from migration `20260402120100`) but no `aion_config` JSONB column. Confirmed via `src/types/supabase.ts:1107-1137`.

**Follow-up Phase 1 is live**: `ops.follow_up_queue` and `ops.follow_up_log` tables exist (`20260330120000`). `getFollowUpQueue()` server action exists at `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:46`. `getDeal()` returns full deal detail at `src/app/(dashboard)/(features)/crm/actions/get-deal.ts:45`.

**No `getDealContextForAion`**: no such function exists. No `/api/aion/draft-follow-up` endpoint exists.

**`ArthurInput.tsx`** (`src/app/(dashboard)/(features)/brain/components/ArthurInput.tsx`): empty 1-line file, legacy artifact.

**Tier gating is ready**: `aion-gate.ts` (`src/features/intelligence/lib/aion-gate.ts:32`) has `getAionCapabilityLevel()` and `canExecuteAionAction()` implemented, though `aion_config` is not yet part of any gating check.

## Intended state

Daniel opens `/brain`, sees a two-panel layout: (1) a voice setup form ("Describe how you talk to clients — write naturally, 2–3 paragraphs"), and (2) a list of top follow-up queue items sorted by priority score. He fills the form, saves it, picks a deal from the queue, types a short instruction ("check in after proposal"), and gets a streamed draft in the same view. The draft reads in his voice. He can copy it or ask Aion to revise it.

The underlying mechanism: `aion_config JSONB` on `workspaces` holds the voice profile text. A new `/api/aion/draft-follow-up` endpoint assembles a system prompt (voice style + deal context + follow-up reason) and streams a response via `streamText`. The existing deal context fetchers (`getDeal`, `getFollowUpForDeal`, `getDealStakeholders`) supply the deal facts.

## The gap

- `public.workspaces` has no `aion_config` column
- No `saveAionVoiceStyle` server action
- Brain tab shows a placeholder, not an interactive UI
- `/api/aion/route.ts` has no auth guard, no workspace context, no voice-style injection
- No `getDealContextForAion` assembler (can compose from existing actions)
- No `/api/aion/draft-follow-up` streaming endpoint
- `SessionContext.sendMessage` routes to an external webhook — the draft flow should bypass it entirely and hit the new endpoint directly

## Options

### Option A: Voice form + dedicated draft endpoint (recommended)

- **What it is:** Replace the Brain tab placeholder with a two-panel layout. Left: voice setup form (textarea, save button → `saveAionVoiceStyle` server action → `aion_config JSONB` column). Right: top 5 follow-up queue items. Selecting a queue item opens a draft panel. A short user instruction field + "Draft" button hits `/api/aion/draft-follow-up` (auth-guarded, workspace-scoped, streams response). The endpoint pulls `aion_config.voice_style`, calls `getDeal` + `getFollowUpForDeal` + `getDealStakeholders`, builds a system prompt, and calls `streamText`.
- **Effort:** Medium — 1 migration, 2 server actions, 1 API route, 1 page replacement
- **Main risk:** System prompt engineering — if `voice_style` is too short or vague, the draft won't be noticeably personalised. Mitigation: seed the textarea with a prompt ("Describe your typical tone with a client after sending a proposal…").
- **Unlocks:** The full Phase A goal. Daniel gets real personalised drafts from the queue. Foundation for Phase B (Aion suggests the draft unprompted from the cron job).

### Option B: Skip voice setup, ship draft endpoint with a generic system prompt

- **What it is:** Auth-guard `/api/aion`, add `getDealContextForAion`, add `/api/aion/draft-follow-up` with a hard-coded "professional, warm, direct" system prompt. Voice setup is deferred.
- **Effort:** Small — no migration, no form, just the endpoint + deal context assembler
- **Main risk:** Doesn't fulfil the stated goal. Drafts won't reflect Daniel's voice, which is the whole point of the exercise.
- **Unlocks:** Proves the draft pipeline works end-to-end; voice can be layered in next session.

### Option C: Re-activate full Brain tab chat, add voice setup as a settings drawer

- **What it is:** Remove the paused placeholder entirely, wire `ChatInterface` into the Brain tab, route `SessionContext.sendMessage` text-only calls to `/api/aion` (replacing the external webhook for text, keeping webhook for voice). Add voice setup as a collapsible settings drawer. The general chat handles drafts alongside everything else.
- **Effort:** Large — requires rethinking `SessionContext` routing, session persistence, and the chat UX for deal-specific drafts
- **Main risk:** Scope creep. The general chat interface doesn't naturally surface deal context — Daniel has to paste it in himself.
- **Unlocks:** A more general Aion interface, but at significantly higher build cost with no incremental delivery.

## Recommendation

Ship Option A. It is the minimum complete implementation of the stated goal — voice setup → deal pick → personalised draft — and it avoids touching `SessionContext` (which is coupled to an external webhook Daniel probably still needs for voice flows).

The migration is 3 lines. The `saveAionVoiceStyle` action is 15 lines. The Brain tab replacement is a standalone page component — no shared state changes. The `/api/aion/draft-follow-up` endpoint is the only non-trivial piece: it needs a good system prompt template and must correctly assemble deal context from the three existing actions.

One tradeoff: the draft panel in the Brain tab will be a simple text output (stream into a `<pre>` or `<p>`), not a full chat thread. That is correct for Phase A — the chat thread complexity belongs to Phase B. Don't wire it through `ChatInterface` yet.

Option B is tempting for speed but produces a feature Daniel won't actually use, because the voice fidelity is the whole point. Option C is too large for one session.

## Next steps for Daniel

1. **Apply migration**: add `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS aion_config JSONB DEFAULT '{}'::jsonb;` — run in Supabase SQL Editor, then `npm run db:types`.
2. **Add `saveAionVoiceStyle` server action**: in `src/app/(dashboard)/settings/aion/` or alongside `src/app/(dashboard)/(features)/crm/actions/`. Validates the incoming text (Zod `string().min(1).max(4000)`), updates `workspaces.aion_config` via server client.
3. **Replace Brain tab**: rewrite `src/app/(dashboard)/brain/page.tsx` with a two-panel layout — voice setup form (read/write from `aion_config.voice_style`) and a follow-up queue list (call `getFollowUpQueue()` server-side).
4. **Auth-guard `/api/aion/route.ts`**: add `await createClient()` at the top, read `workspaceId` from session, reject if missing.
5. **Add `getDealContextForAion`**: new file `src/app/(dashboard)/(features)/crm/actions/get-deal-context-for-aion.ts`. Compose: `getDeal(dealId)` + `getFollowUpForDeal(dealId)` + `getDealStakeholders(dealId)`. Return a plain-text summary string.
6. **Add `/api/aion/draft-follow-up/route.ts`**: accept `{ dealId, userInstruction, workspaceId }`. Read `workspaces.aion_config.voice_style`. Call `getDealContextForAion`. Build system prompt. Call `streamText` → return `result.toTextStreamResponse()`.

## References

- `src/app/(dashboard)/brain/page.tsx` — current paused placeholder
- `src/shared/ui/providers/SessionContext.tsx:173` — `sendMessage` routes to external webhook
- `src/app/api/aion/route.ts` — unauthenticated stub
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:46` — `getFollowUpQueue`
- `src/app/(dashboard)/(features)/crm/actions/get-deal.ts:45` — `getDeal`
- `src/types/supabase.ts:1106` — `workspaces` Row (no `aion_config` today)
- `src/features/intelligence/lib/aion-gate.ts:32` — tier gating (already built)
- Migration `20260402120100_tier_config_and_workspace_columns.sql` — added `aion_actions_used`
- Migration `20260330120000_create_follow_up_queue_and_log.sql` — follow-up Phase 1 tables
