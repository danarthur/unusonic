# Unblock Aion voice setup: fix synthesis bypass + wire test draft

_Researched: 2026-06-03 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **Premise correction:** Most assumptions in this question are stale. The codebase is significantly further along. See Current state below.

## Current state

**Everything listed as "not started" in the primer is done.** Specifically:

`public.workspaces.aion_config` exists as a typed JSONB column (`src/types/supabase.ts:7689`). Its shape is `AionConfig`, which holds `AionVoiceConfig = { description, example_message, guardrails }` (`aion-config-actions.ts:12-16`).

The chat route is not a 16-line stub — it's a 450-line Claude-backed tool orchestrator at `src/app/api/aion/chat/route.ts`. The draft route is live at `src/app/api/aion/draft-follow-up/route.ts` (73 lines) and `getDealContextForAion` exists at `follow-up-actions.ts:545`.

A full 5-state onboarding machine is defined at `aion-chat-types.ts:225-257`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route's system prompt has gating for all four pre-configured states at `prompts.ts:275-282`, and Aion has a `save_voice_config` tool at `chat/tools/core.ts:118-142` to persist voice fields during conversation. Draft generation at `generate-draft.ts:25-46` injects voice config into the prompt when present. "Tune Aion's voice" in the AionSidebar overflow calls `resetAionVoiceConfig` and is meant to re-enter the onboarding flow.

**The machinery is complete. The path is broken at one seam:**

`applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35-45`) synthesizes a default voice from the workspace name on every config read, returning `voice_default_derived: true` in the in-memory config object. `getOnboardingState` (`aion-chat-types.ts:248`) short-circuits to `'configured'` the moment it sees `voice_default_derived: true`. Because synthesis runs on every read — and the flag is never persisted — `resetAionVoiceConfig` strips the field from the DB but synthesis re-adds it on the very next `getAionConfig()` call. The reset is a no-op. The 4-step onboarding never fires.

## Intended state

Daniel opens the Aion chat, describes how he talks to clients (3 paragraphs), and immediately gets a follow-up draft shaped to that voice. The onboarding machine already maps to this exactly:
- `no_voice` → Aion asks about communication style, calls `save_voice_config`
- `no_example` → Aion asks for a real example message
- `no_guardrails` → Aion asks for rules/things to avoid
- `needs_test_draft` → Aion generates a draft using `draft_follow_up` tool, marks complete

The structured fields (`description`, `example_message`, `guardrails`) map cleanly onto "3 paragraphs about how I talk to clients." The flow is correct. It just needs to actually trigger.

## The gap

- `applyVoiceDefaultIfEmpty` injects `voice_default_derived: true` in memory on every read, so `getOnboardingState` always sees `'configured'` for workspaces with no stored voice
- `resetAionVoiceConfig` strips the flag from the DB but synthesis re-adds it immediately — the reset achieves nothing
- "Tune Aion's voice" in the sidebar overflow is the only entry point, and it is buried and currently broken
- `needs_test_draft` step requires a queued deal; confirmed `draft_follow_up` tool exists in `core.ts` but its empty-queue behavior is unverified

## Options

### Option A: Fix the synthesis bypass with an explicit opt-out flag
- **What it is:** Change `resetAionVoiceConfig` to persist `voice_default_derived: false` (not strip it). Change `applyVoiceDefaultIfEmpty` to skip synthesis when it reads `false` from the stored config. Two file edits — `aion-config-helpers.ts` and `aion-config-actions.ts`. No schema migration, no new components. The existing "Tune Aion's voice" button then works as designed.
- **Effort:** Small
- **Main risk:** Workspaces that have already had their voice reset are still stuck in the current broken state — they need to click the button once more after the fix ships.
- **Unlocks:** The full 4-step onboarding fires when Daniel clicks "Tune Aion's voice", producing a voice-aware draft on the same session.

### Option B: Surface a first-run voice setup CTA
- **What it is:** Add a visible card or prompt on the Aion page body when `voice_default_derived === true` (i.e., using generic synthesized voice). Card reads "Aion is using a default voice — tell it how you actually write" with a single button that resets the config and focuses the chat. Pairs with Option A; does not replace it.
- **Effort:** Small-medium
- **Main risk:** Adds UI complexity to a page that should stay minimal. If the sidebar overflow entry point is acceptable, this is premature.
- **Unlocks:** Voice setup becomes discoverable without knowing the settings overflow exists.

### Option C: Free-text bio intake replacing the structured fields
- **What it is:** Replace the 3-question sequential chat flow with a single textarea (in the Aion page or a modal) where Daniel pastes 3 paragraphs about his communication style. Aion then parses the prose into structured `{ description, example_message, guardrails }` and generates a draft in one turn.
- **Effort:** Medium
- **Main risk:** Adds a second path to saving voice config; the existing structured chat tool and the new form would need to stay in sync. Higher scope than the problem warrants right now.
- **Unlocks:** More natural "write in prose, get a draft" UX that matches the original vision.

## Recommendation

Ship Option A only. The onboarding flow is already built, tested, and correct — the only broken thing is the in-memory synthesis overwriting the opt-out signal. The fix is two small edits:

1. In `aion-config-helpers.ts:35`: add `if (config.voice_default_derived === false) return config;` before the synthesis block.
2. In `aion-config-actions.ts` around line 232 (inside `resetAionVoiceConfig`): change the DB write from `rest` to `{ ...rest, voice_default_derived: false }`.

That's it. "Tune Aion's voice" will then correctly enter `no_voice` state, the 4-step chat-driven flow will fire, and Daniel will get a draft at the end of the same session. Do not add the CTA card (Option B) until you've verified the sidebar entry point feels too buried in real use — it may be fine once the flow actually works. Defer Option C entirely; the structured 3-question approach is equivalent to "3 paragraphs" and requires no new surface.

One secondary check: confirm `draft_follow_up` in `chat/tools/core.ts` handles the case where no deal is currently active or queued. If it errors on empty queue, the `needs_test_draft` step will fail for fresh workspaces. A simple fallback (generate a draft using a hypothetical deal description instead of a live queue item) may be needed there.

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — add the `voice_default_derived === false` early return before the synthesis.
2. Open `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` in `resetAionVoiceConfig` (~line 240) — change `system.from('workspaces').update({ aion_config: rest })` to `aion_config: { ...rest, voice_default_derived: false }`.
3. Verify `saveAionVoiceConfig` still clears `voice_default_derived` after an explicit save — it already does via the `_drop` destructure at `aion-config-actions.ts:190`. No change needed there.
4. Read `src/app/api/aion/chat/tools/core.ts` around line 300+ where `draft_follow_up` is defined. Confirm it has a graceful fallback when no deal context is available.
5. Test end-to-end: open `/aion` → sidebar overflow → "Tune Aion's voice" → confirm chat asks about communication style → write 3 paragraphs across the 3 turns → confirm draft is generated.
6. After the fix ships, check whether any workspace has a `voice_default_derived: null/undefined` DB row that is now stuck — if so, they need one more reset click. Add a note in the commit.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — synthesis bypass (the fix site)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178-256` — saveAionVoiceConfig, resetAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:275-282` — system prompt onboarding gating
- `src/app/api/aion/chat/tools/core.ts:118-142` — save_voice_config tool
- `src/app/api/aion/lib/generate-draft.ts:25-46` — draft generation with voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — draft route (73 lines, fully wired)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" entry point
