# Aion Phase A: Voice Setup + First Draft — Current Status

_Researched: 2026-07-08 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**This question's premises are outdated.** Both blockers named in the queue item have been resolved since it was written.

**`public.workspaces.aion_config` exists.** It is a JSONB column storing a typed `AionConfig` shape with `voice` (`description`, `example_message`, `guardrails`), `learned` (vocabulary swaps, patterns), `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived`. Confirmed at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74`.

**The Brain tab is live.** `/aion` renders `ChatInterface` via `AionPageClient.tsx:66`. Not paused.

**The full `/api/aion/chat` route is shipped.** 450-line production route with auth, tier gating, model routing, streaming, tool-calling loop (`stepCountIs(10)`), session summarization, title generation. See `src/app/api/aion/chat/route.ts:57`.

**The 5-state onboarding machine is live.** `getOnboardingState()` returns `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Greetings and system-prompt forcing blocks are wired for all five states: `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` and `src/app/api/aion/chat/route/prompts.ts:275–283`.

**`save_voice_config` and `draft_follow_up` are live chat tools.** Both exist in `src/app/api/aion/chat/tools/core.ts:118` and `:318`. `save_voice_config` persists to `aion_config` and triggers `refreshConfig`. `draft_follow_up` calls `getDealContextForAion` + voice config → `buildDraftPrompt` → fast model → `draft_preview` message block.

**`/api/aion/draft-follow-up` route is also live.** Used by the deal-card button path. Auth, tier gate, voice injection, kill-switch check all in place: `src/app/api/aion/draft-follow-up/route.ts:21`.

**`learn-from-edit` is shipped.** Vocabulary swap extraction from draft edits, persists to `aion_config.learned` and `cortex.memory`: `src/app/api/aion/learn-from-edit/route.ts`.

**Tone anchoring is also live** — a separate, complementary system that reads outbound message history to build a tier-1/2/3 style preamble (`src/app/api/aion/lib/tone-anchoring.ts`). Distinct from the explicit voice config.

## Intended state

Per the queue item: Daniel opens /aion, writes 3 paragraphs about how he talks to clients, and immediately sees a draft that respects that voice.

The existing design collects voice config in 4 sequential turns (description → example → guardrails → test draft) before generating a draft. This is the intended gate — draft quality depends on all three fields. The `needs_test_draft` state is the first point where `draft_follow_up` is explicitly offered.

One exception: if the workspace has a synthesized default voice (`voice_default_derived: true`), the onboarding flow is bypassed entirely and the workspace jumps to `configured`. A fresh voice setup requires calling `resetAionVoiceConfig()` first (available via Sidebar overflow → "Tune Aion's voice").

## The gap

- Phase A as originally scoped is fully shipped. The two blockers named in the queue item no longer exist.
- **The "immediately" expectation may not match the 4-turn onboarding flow.** If Daniel writes 3 paragraphs describing his style in turn 1, Aion saves the description and asks for an example. The first draft only appears after example + guardrails are also collected (turn 3 or 4).
- **No single-turn shortcut.** A user can ask for a draft in turn 1 (the tool is not blocked), but with only `description` set, `example_message` and `guardrails` will be absent — draft quality will be reduced and the onboarding remains incomplete.
- **Happy path has not been tested end-to-end** in the current codebase state (the queue item predates the implementation).

## Options

### Option A: Test and close the loop
- **What it is:** Reset voice config on a test workspace, open /aion, walk the full 4-turn onboarding flow, confirm a test draft renders correctly with voice respected. Identify friction if found and file it as a follow-up.
- **Effort:** Small (30 minutes of testing)
- **Main risk:** None architecturally — this validates what is already shipped.
- **Unlocks:** Confidence that Phase A is production-ready; any friction is surfaced as a concrete bug rather than a design ambiguity.

### Option B: Collapse voice setup to a single turn
- **What it is:** Accept a long free-form voice description in one message, extract description + example + guardrails via a short `generateText` call, save all three fields, and immediately generate a draft — one chat turn total.
- **Effort:** Medium (new extraction prompt in `save_voice_config` or a new tool; modify onboarding state logic to skip directly to `configured` after the extraction)
- **Main risk:** Extraction accuracy — a 3-paragraph blob is harder for the model to parse into structured fields than the guided 3-question flow. Guardrails extracted implicitly may be weak.
- **Unlocks:** The literal "write 3 paragraphs → see a draft" UX described in the queue item.

### Option C: Surface voice setup outside the chat (settings form)
- **What it is:** Add a voice config form at `/settings/aion` — three text areas for description, example, guardrails, plus a preview draft button. Chat onboarding becomes optional; structured form becomes the primary voice entry path.
- **Effort:** Medium (new settings UI; `AionSettingsView.tsx` currently handles only card beta consent)
- **Main risk:** Splits the onboarding surface — users may not find the settings form, and the chat flow's guided Socratic approach is better for first-time setup.
- **Unlocks:** Power-user direct editing of voice config; faster iterations on guardrails without going through chat.

## Recommendation

**Start with Option A.** The full implementation is in place — test it before changing it. The 4-turn onboarding flow is a considered design choice (each turn builds on the last; Aion learns why the user has each rule, not just what it is). The queue item's "immediately" language reflects the goal-state, but 4 turns from a cold start that end in a real draft is not slow — it's a focused 3-minute setup.

If testing reveals the flow actually feels laborious (e.g. Daniel types his full voice in turn 1 and is frustrated being asked for an example he just gave), that's the moment to scope Option B. But fix the observed problem, not the hypothetical one.

The only thing that materially blocks the goal today is if Daniel's workspace has `voice_default_derived: true` (likely, since the workspace has a name). In that case, the sidebar overflow menu is the entry point to reset and re-tune — worth testing that this is discoverable.

## Next steps for Daniel

1. Open `/aion` and check the greeting. If it's a `configured`-state greeting (ambient, pull-mode), go to the Aion sidebar overflow (top-right three-dot menu) and choose "Tune Aion's voice."
2. Walk through all four onboarding turns and confirm the draft renders in the chat as a `draft_preview` block.
3. Edit the draft and confirm `learn-from-edit` fires (check Network tab for a POST to `/api/aion/learn-from-edit`).
4. Open a deal card and use the "Draft follow-up" button there — confirm it reads the voice you just configured.
5. If the 4-turn flow feels right, mark Phase A complete. If one specific turn feels redundant, file a focused issue for Option B scoped to that turn only.
6. If you want the settings form (Option C), scope it as a standalone task — the backend (`saveAionVoiceConfig` server action) already exists at `aion-config-actions.ts:178`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionConfig type, read/write actions
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — getOnboardingState()
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding forcing blocks in system prompt
- `src/app/api/aion/chat/route/prompts.ts:300` — buildGreeting per-state greetings
- `src/app/api/aion/chat/tools/core.ts:118` — save_voice_config tool
- `src/app/api/aion/chat/tools/core.ts:318` — draft_follow_up tool
- `src/app/api/aion/lib/generate-draft.ts` — generateFollowUpDraft() shared utility
- `src/app/api/aion/draft-follow-up/route.ts` — deal-card draft route
- `src/app/api/aion/learn-from-edit/route.ts` — edit feedback loop
- `src/app/api/aion/lib/tone-anchoring.ts` — outbound message tone system
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab (not paused)
