# Aion Phase A: Voice setup → first real draft

_Researched: 2026-06-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the two premises in the question — Brain tab paused, aion_config doesn't exist — are stale. Both blockers shipped. The research below reflects current code and reframes around the actual remaining gap._

## Current state

The Aion chat stack is fully operational. The main `/aion` page mounts `ChatInterface.tsx` (`src/app/(dashboard)/aion/AionPageClient.tsx:1`) and hits a 450-line orchestrator at `src/app/api/aion/chat/route.ts`. Auth is guarded (route.ts:58–65), model tiers are live (Haiku/Sonnet/Opus via `selectModelTier`), and `/api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts`) is fully wired — it accepts `AionDealContext`, pulls voice config, calls `generateFollowUpDraft({ context, voice })`, and records usage.

`public.workspaces.aion_config` exists as JSONB with DEFAULT `'{}'`. The `AionConfig` type (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`) carries `voice?: AionVoiceConfig` with three fields: `description`, `example_message`, `guardrails`. `saveAionVoiceConfig()` (line 178) persists explicit user voice. `resetAionVoiceConfig()` (line 214) wipes it back to unset.

A 5-state onboarding machine drives the chat flow (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225`): `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route reads this state every turn (route.ts:122) and passes it to `buildSystemPrompt` and `buildGreeting`.

**The bypass:** `getOnboardingState()` returns `'configured'` immediately if `config.voice_default_derived === true` (aion-chat-types.ts:248). `synthesizeDefaultVoice()` in `aion-config-helpers.ts` generates a boilerplate voice from the workspace name ("Writing for {company}. Sentence case, no exclamation marks...") and `applyVoiceDefaultIfEmpty()` applies it on every `getAionConfig()` read, setting `voice_default_derived: true`. This was added in Wk 11 §3.8 to stop blocking newcomers behind a 4-step form. It works — but it means Daniel's first chat shows a pipeline snapshot, not a voice setup prompt. He never writes those 3 paragraphs.

The AionSettingsView (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) is unrelated to voice setup — it manages beta consent flags and cadence learning toggles only.

## Intended state

Daniel opens `/aion`, is invited to describe how he writes to clients (3 short paragraphs is enough — the onboarding flow maps to `description`, `example_message`, `guardrails`), and then immediately sees a draft for his top-priority deal that uses his actual voice. The voice is stored to `aion_config` so every future draft respects it. No extra navigation, no sidebar overflow, no reset call required.

## The gap

- Auto-synthesis (`synthesizeDefaultVoice` + `voice_default_derived: true`) short-circuits the onboarding machine before Daniel ever types anything, so no voice prompt fires.
- The `needs_test_draft` onboarding state presumably offers a draft in the greeting, but it is never reached for any workspace with auto-synthesis active. Whether it calls the real `draft-follow-up` endpoint or produces placeholder text is unverified (`buildGreeting` internals not read).
- No UI path asks for voice on first use. The only reset affordance is buried in the sidebar overflow ("Tune Aion's voice").
- `saveAionVoiceConfig()` (line 195) uses the server client (cookie session), while `resetAionVoiceConfig()` and `setLearnOwnerCadence()` explicitly note that `public.workspaces` has no UPDATE RLS for authenticated callers and route through `getSystemClient()`. If that note is accurate, `saveAionVoiceConfig()` silently drops writes. Needs a test.

## Options

### Option A: Remove the bypass; wire needs_test_draft to a real deal draft
- **What it is:** Delete the `voice_default_derived` early-return from `getOnboardingState()` (one line). Aion then asks voice questions conversationally on first open. Verify (and if needed fix) the `needs_test_draft` greeting in `buildGreeting()` to call `draft-follow-up` on the top-priority queue item. Fix the `saveAionVoiceConfig()` RLS path if the silent-drop bug is confirmed.
- **Effort:** Small — 1–3 file changes, no schema work
- **Main risk:** Newcomers who just want to poke around hit a 4-step questionnaire before seeing anything useful. This was the original reason §3.8 added the bypass.
- **Unlocks:** The full intended flow immediately. Voice is explicit, draft is real, nothing left to wire.

### Option B: First-turn detection — show setup prompt only for derived voice
- **What it is:** Keep auto-synthesis (low friction for genuinely new users). Add a first-turn branch in the chat route: when `voice_default_derived === true` AND the conversation is empty, Aion's greeting includes a voice setup prompt plus a draft preview computed from the boilerplate voice, with copy like "I've generated a default — here's how it sounds. Tell me how you actually write and I'll rewrite it." Daniel's reply updates `voice.description` via a `configUpdates` response field (already typed on `AionChatResponse`), then Aion produces a revised draft in the next turn.
- **Effort:** Medium — adds a branch to `buildGreeting()` and a config-extraction step in the chat route's response builder
- **Main risk:** Two-turn round-trip before Daniel sees a voice-respecting draft. The first draft uses the boilerplate voice, which may read generically enough to feel like a bug.
- **Unlocks:** Zero-friction default for casual users; explicit voice for owners who engage. Cleaner UX story.

### Option C: Standalone voice setup form in /settings/aion/
- **What it is:** Add three labeled textareas to `AionSettingsView.tsx` calling `saveAionVoiceConfig()`. Link from `/aion` first-open state or the sidebar overflow. After save, direct Daniel to the top follow-up deal where `NudgeComposer` generates the draft.
- **Effort:** Small — form UI + routing only; server action exists
- **Main risk:** Disconnected from the draft. Daniel saves voice in settings, navigates to a deal separately — the "immediately see a draft" moment is broken. Also puts voice config in settings where it lives alongside consent flags, which is the wrong mental model (voice is operational, not administrative).

## Recommendation

**Option A.** The bypass exists for a good reason (don't block casual newcomers), but Daniel is not a casual newcomer — he's the founder who wants to tune his AI's voice before his crew uses it. The 4-step conversational flow is already built and thoughtful. The right call is to remove the bypass, verify `buildGreeting()` for `needs_test_draft` produces a real draft (not placeholder text), and fix the RLS inconsistency in `saveAionVoiceConfig()` if confirmed.

This is the smallest surface area: one early return removed, one function verified, one potential client-vs-system swap fixed. Option B is attractive but adds moving parts for a flow that may never be used (derived voice → conversational revision). Option C breaks the core UX promise — "immediately see a draft" requires staying in one place.

One tradeoff to accept: removing the bypass means any new workspace member hits the 4-step setup. That's a product call worth flagging, but for the current use case (Daniel onboarding himself) it's clearly correct.

## Next steps for Daniel

1. Read `src/app/api/aion/chat/route/prompts.ts` `buildGreeting()` for the `needs_test_draft` case — confirm it calls `draft-follow-up` on a real deal or identify the gap.
2. In `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`, delete the `voice_default_derived` early return (or wrap it behind a flag so it can be toggled per workspace).
3. Test `saveAionVoiceConfig()` — call it in a browser session and confirm the `aion_config` row updates. If it silently drops, swap `createClient()` for `getSystemClient()` on line 194 (same pattern as `resetAionVoiceConfig()` line 239).
4. Call `resetAionVoiceConfig()` once for Daniel's workspace (either via a temporary admin route or direct RPC call) so his workspace starts from `no_voice` and hits the real flow.
5. Open `/aion` — go through the 4 voice questions — verify the `needs_test_draft` greeting generates a draft via the real `/api/aion/draft-follow-up` endpoint for the top queue item.
6. If the `needs_test_draft` greeting only offers placeholder text, wire it to call `getDealContextForAion` on the top `ops.follow_up_queue` item and return a `draft_preview` content block.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — onboarding state machine, `getOnboardingState()`, bypass at line 248
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig()`, `resetAionVoiceConfig()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice()`, `applyVoiceDefaultIfEmpty()`
- `src/app/api/aion/chat/route.ts` — orchestrator, onboarding state read at line 122
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting()`, `buildSystemPrompt()`
- `src/app/api/aion/draft-follow-up/route.ts` — fully implemented draft endpoint
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — consent/flags only, no voice form
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts` — `getDealContextForAion()`
