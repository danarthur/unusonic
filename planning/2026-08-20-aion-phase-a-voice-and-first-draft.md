# Aion Phase A — voice setup and first real draft

_Researched: 2026-08-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Goal: Daniel opens the Brain tab, writes 3 paragraphs about how he talks to clients, and immediately sees an Aion-generated follow-up draft that respects that voice.

_Interpretation note: the queue item's two premises are stale. `aion_config` exists and is heavily used; the Brain tab is unpaused and live. Below I re-scope Phase A against the actual current state._

## Current state

The infrastructure the question assumes is missing is already shipped. Concretely:

- `public.workspaces.aion_config` exists as a JSONB column (`src/types/supabase.ts:7782`, `:7825`, `:7868`) with a typed `AionConfig` shape covering `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, `voice_default_derived` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`).
- Voice reads and writes are wired: `getAionConfig` (`aion-config-actions.ts:84`), `saveAionVoiceConfig` (`:178`), `resetAionVoiceConfig` (`:214`), plus a workspace-scoped variant for server routes (`:106`, `:262`).
- A default voice is synthesized on read from the workspace name when none is stored (`aion-config-helpers.ts:20-45`), flagged with `voice_default_derived` so `getOnboardingState` treats new workspaces as "configured" and skips the 4-step forcing block (`aion-chat-types.ts:247-257`).
- The `/aion` route is live and mounts `ChatInterface` (`src/app/(dashboard)/aion/page.tsx:11-17`, `AionPageClient.tsx:66-76`). The 4-state onboarding machine — `no_voice → no_example → no_guardrails → needs_test_draft → configured` — is defined at `aion-chat-types.ts:225-257`.
- The chat route is 451 lines with auth, tier gating, rolling summarization, tool routing, model tiering, and streaming (`src/app/api/aion/chat/route.ts`). It is not the "16-line stub" the primer describes.
- A dedicated draft route exists: `POST /api/aion/draft-follow-up` (74 lines) calls `generateFollowUpDraft({ context, voice })` and returns `{ draft, channel }` (`src/app/api/aion/draft-follow-up/route.ts`).
- `getDealContextForAion(dealId, queueItem)` returns a full `AionDealContext` including client, proposal, and follow-up log (`src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-611`).
- The follow-up cron reads `aion_config.follow_up_playbook` per workspace and drives queue population (`src/app/api/cron/follow-up-queue/route.ts:201-206`).

The one thing that does not exist: **a dedicated three-paragraph voice-setup form**. Voice tuning today happens either through the chat-driven 4-step forcing block, or via the "Tune Aion's voice" affordance in `AionSidebar.tsx` (which calls `resetAionVoiceConfig` and re-enters the chat flow).

## Intended state

Per the queue item: Daniel opens the Brain tab, writes three paragraphs — description, example message, guardrails — as a single form, submits, and immediately sees a real follow-up draft written in that voice against a real deal. The voice fields already map 1:1 to `AionVoiceConfig` (`aion-config-actions.ts:12-16`), and the draft path already exists. The gap is composition, not new infrastructure.

## The gap

- No single-form voice editor. Onboarding is chat-turn-by-turn.
- No "generate a sample draft against my current top deal" affordance from the settings surface — `/api/aion/draft-follow-up` needs a live `AionDealContext` + `FollowUpQueueItem`, which requires the follow-up cron to have populated a queue row for a real deal.
- For a brand-new workspace with no deals, the draft loop can't demonstrate anything real. The `voice_default_derived` synth was added precisely to hide that fact.

## Options

### Option A: Ship a dedicated voice-setup form + "draft me one now" button

- **What it is:** New `AionVoiceSetupForm` component (a stage-panel modal or `/aion/settings` sub-route). Three textareas mapped to `description / example_message / guardrails`. On submit calls `saveAionVoiceConfig`. Below the form, a "See a sample draft" button picks the workspace's highest-priority open follow-up queue row and calls `/api/aion/draft-follow-up` with that context, streaming the result inline.
- **Effort:** small — reuses `saveAionVoiceConfig`, `getDealContextForAion`, and `/api/aion/draft-follow-up`.
- **Main risk:** if the workspace has no queue rows yet, the sample draft can't fire. Needs an empty-state fallback (Option C).
- **Unlocks:** an owner can go from cold-open to a real personalized draft in one screen; Phase A of §26 is effectively complete.

### Option B: Keep chat-driven onboarding, remove the synth-default shortcut

- **What it is:** Turn off `voice_default_derived` for new workspaces so the 4-step forcing block always runs, then rely on the existing chat UX to walk the owner through the same three fields conversationally.
- **Effort:** tiny — a config change in `applyVoiceDefaultIfEmpty`.
- **Main risk:** the chat flow requires 4 separate turns per new owner; it's slower, easier to abandon, and no less complex to test.
- **Unlocks:** nothing net-new; it's a UX regression from what shipped in Wk 11 §3.8.

### Option C: Seed a fixture "example deal" per workspace on first Aion visit

- **What it is:** On the first `/aion` load for a workspace with zero open deals, insert a stub `ops.projects`/`ops.events` row + a synthetic `ops.follow_up_queue` row via the service-role client so the draft button always has real context to draft against. Cleaned up when the owner creates a real deal.
- **Effort:** medium — touches `ops` writes, RLS, and a cleanup path.
- **Main risk:** synthetic rows leaking into pipeline/reporting; overlap with real deal creation.
- **Unlocks:** completes Option A for empty workspaces, but is meaningful only paired with A.

## Recommendation

Ship **Option A**, with a small empty-state carve-out. Daniel's stated goal is "three paragraphs → immediate draft" — a form is the shortest path there, and every server-side piece already exists (`saveAionVoiceConfig`, `getDealContextForAion`, `/api/aion/draft-follow-up`). Option B is a regression. Option C is worth doing only after A ships and only if the empty-workspace case actually turns up in usage; a static "here's what a draft would look like" preview using a hardcoded sample `AionDealContext` is a cheaper first pass and doesn't pollute `ops.*`.

Accept the tradeoff that the chat-driven 4-step flow becomes dead code for new owners; it stays reachable via the sidebar's "Tune Aion's voice" affordance for people who prefer conversational tuning. Two entry points, one config, one draft path.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/AionVoiceSetupForm.tsx` — three-field stage-panel form calling `saveAionVoiceConfig` (see `aion-config-actions.ts:178`).
2. Mount it at `/aion/settings` (new page) or as a sidebar overflow action alongside "Tune Aion's voice" in `AionSidebar.tsx`.
3. Add a "See a sample draft" button that fetches the top `ops.follow_up_queue` row for the active workspace, calls `getDealContextForAion`, and POSTs to `/api/aion/draft-follow-up`. Render the returned `{ draft, channel }` inline.
4. For workspaces with an empty queue: build a hardcoded sample `AionDealContext` (fictional client, proposal, follow-up reason) and pass it to `/api/aion/draft-follow-up` — same route accepts any well-formed context.
5. Update the primer's "Current notable state" bullet to reflect that Brain is live, `aion_config` exists, and the chat route is fully wired — the paused-Brain framing has been misleading planning for a while.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-316`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-45`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`
- `src/app/(dashboard)/aion/page.tsx`, `AionPageClient.tsx`
- `src/app/api/aion/chat/route.ts` (451 lines, live)
- `src/app/api/aion/draft-follow-up/route.ts`
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-611`
- `src/app/api/cron/follow-up-queue/route.ts:201-206`
- `src/types/supabase.ts:7778-7897` (workspaces row)
