# Aion Phase A: voice intake form + first draft

_Researched: 2026-07-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **How I read this:** The primer's "current notable state" is outdated. See Current State below — the premises in the question have mostly resolved. Scoping the question as: what's the minimum UI path so an owner can paste freeform prose about their communication style and immediately see a voice-respecting draft?

## Current state

The Aion system is substantially further along than the planning primer implies.

**`aion_config` exists and is in production use.** `getAionConfig()` and `saveAionVoiceConfig()` are live server actions reading/writing `public.workspaces.aion_config` JSONB (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`). The `AionConfig` type is fully typed: `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, `voice_default_derived`.

**`/api/aion/draft-follow-up` is live.** The route (`src/app/api/aion/draft-follow-up/route.ts:1`) is authenticated, tier-gated, and calls `generateFollowUpDraft()` which injects `aion_config.voice` directly into the generation prompt (`src/app/api/aion/lib/generate-draft.ts:62`).

**`/api/aion/chat` is a full production route.** It handles auth, tier gating, kill switch, and onboarding state. The chat route injects voice config into `buildSystemPrompt()` on every turn (`src/app/api/aion/chat/route.ts:174`).

**Onboarding state machine exists but is bypassed for new users.** `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) defines a 5-state sequence: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. However, `synthesizeDefaultVoice()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:21`) auto-derives a generic voice from the workspace name and `applyVoiceDefaultIfEmpty()` sets `voice_default_derived: true`, which causes `getOnboardingState` to return `configured` immediately — skipping the 4-step flow entirely for new workspaces.

**Brain tab (ChatInterface) is not paused.** No "Brain Mode is paused" string exists in `ChatInterface.tsx`. The chat interface is active.

**Voice retune path exists but is buried.** Owners can reset to the explicit 4-step Q&A flow via the Sidebar overflow → "Tune Aion's voice" (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998`), which calls `resetAionVoiceConfig()` and instructs the user to start a new chat. The conversational onboarding then asks one question at a time.

## Intended state

Daniel opens the Brain tab, pastes 3 paragraphs describing how he communicates with clients — no Q&A loop, no multi-turn conversation. Aion:
1. Parses the prose into `AionVoiceConfig` fields (description, example_message, guardrails) using a single LLM extraction call
2. Saves the result via `saveAionVoiceConfig()`
3. Immediately generates a demo follow-up draft using a recent deal's context, rendered inline so Daniel can see the voice effect before leaving the form

## The gap

- No freeform prose → structured `AionVoiceConfig` extraction path exists. The current onboarding is conversational Q&A or the synthesized default; there is no "paste 3 paragraphs" single-input route.
- No "show me a draft with this voice" trigger in the setup flow. The draft-follow-up route exists but is only exposed on deal cards, not during voice configuration.
- The `voice_default_derived` bypass means most owners will never see any onboarding at all — they're considered `configured` from day one with a generic default voice they may not know exists.

## Options

### Option A: Voice intake panel in the Aion page

- **What it is:** When `voice_default_derived === true` (i.e., no custom voice), render an overlay or side panel on `/aion` with a single large textarea. On submit, a new server action calls the LLM to extract prose → `AionVoiceConfig`, saves via `saveAionVoiceConfig()`, fetches the most recent deal, calls `generateFollowUpDraft()`, and displays the result inline. Owner can accept or re-edit.
- **Effort:** Medium — 1 new server action (`extractVoiceFromProse`), 1 new component (`VoiceIntakePanel`), minor change to `AionPageClient` to gate the panel on `voice_default_derived`.
- **Main risk:** Draft preview needs a deal. If the workspace has no deals yet, the demo falls back to a synthetic canned context. That synthetic draft may feel hollow and undercut confidence in the feature.
- **Unlocks:** Once voice is set, every future draft-follow-up call uses it. Closes the gap for new owners immediately.

### Option B: Voice intake in Settings/Aion

- **What it is:** Add a "Voice" section to the existing `AionSettingsView` (`/settings/aion`) with the same textarea + extraction + demo draft flow as Option A. No change to the Brain tab.
- **Effort:** Small — same server action + component, but mounted in a place that already has a form shell. Slightly less discoverable.
- **Main risk:** Lower discovery than Option A — most owners won't think to look in Settings before their first chat. The Brain tab is where they expect to see Aion "working", not Settings.
- **Unlocks:** Same as Option A but from a settings surface. Works well as a companion to the cadence toggle already there.

### Option C: Chat-first intake with structured extraction

- **What it is:** Instead of a form, detect when the user pastes a long block of text (>200 chars) in their first chat message when `voice_default_derived === true`. The chat route runs an extraction LLM call before the main response, saves the voice config silently, then Aion's first reply confirms the extracted voice and immediately generates a demo draft inline as a `follow_up_draft` message block.
- **Effort:** Medium-large — requires a new code path in the chat route, a detection heuristic, and a new message block type to render the draft inline. More moving parts, harder to test.
- **Main risk:** The detection heuristic ("is this a voice description?") can misfire — if the owner pastes a deal brief or a question, the extraction runs unnecessarily. Also ties voice setup to the chat route, complicating future changes to either.
- **Unlocks:** Frictionless for users who go straight to chat — but only those who happen to type a lot on their first message.

## Recommendation

**Ship Option A.** It's the most direct match for what the queue describes, uses infrastructure that already exists, and is medium effort with clear scope. The extraction prompt is simple — take the prose, return JSON with `description`, `example_message`, `guardrails` fields — and `generateFollowUpDraft()` already handles the draft side. The only missing piece is the `extractVoiceFromProse` server action and the `VoiceIntakePanel` component.

The synthetic-draft fallback (for workspaces with no deals) is acceptable risk: show a canned placeholder deal with a note that it's for illustration. That's better than blocking on "you need a deal first."

Option B is a useful companion but not a substitute — Settings is the right home for retuning, not first-run setup. Option C over-engineers the detection problem and couples unrelated systems.

One call to make: whether the panel appears as an interstitial blocking the chat or as a dismissible banner. The interstitial is higher-signal for first-run and matches the goal more precisely.

## Next steps for Daniel

1. Create `src/app/api/aion/extract-voice/route.ts` — POST endpoint that accepts `{ prose: string, workspaceId: string }`, calls `generateText` with a short extraction prompt, returns `AionVoiceConfig`. Auth + tier gate required.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceIntakePanel.tsx` — a `stage-panel` overlay with a large textarea and submit button. On submit: calls extract-voice, calls `saveAionVoiceConfig()`, calls draft-follow-up with the most recent deal (or a canned context if none), renders the draft.
3. In `AionPageClient.tsx` (`src/app/(dashboard)/aion/AionPageClient.tsx`), fetch `aion_config` server-side and pass `showVoiceIntake={config.voice_default_derived === true}` to the client. Render `<VoiceIntakePanel>` when the flag is set.
4. After the owner saves voice in the panel, set `onboarding_state: 'complete'` (via `updateAionConfigForWorkspace`) so the panel never re-appears.
5. Add the panel to `AionSettingsView` as a secondary entry point for retuning (replaces the current "reset voice → start new chat" flow).
6. Write a Vitest unit test for the extraction prompt given 2-3 fixture prose inputs — verifies that description/example_message/guardrails all populate.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config read/write
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation entry point
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab client shell
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` — existing "Tune Aion's voice" retune path
