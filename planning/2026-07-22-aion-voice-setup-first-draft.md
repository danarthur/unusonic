# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-07-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** The queue item was written against the planning primer dated 2026-04-10. The primer is significantly out of date. Both claims in the premise are wrong — see Current State below. The question is still worth answering, but the answer is different than expected.

---

## Current state

**`aion_config` does exist.** `public.workspaces.aion_config` is a live JSONB column actively read and written. `getAionConfig()` (`aion-config-actions.ts:84`) and `getAionConfigForWorkspace()` (`aion-config-actions.ts:106`) both query it. The `AionConfig` type (`aion-config-actions.ts:50`) carries `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

**The Brain tab is not paused.** `/aion` renders `AionPageClient.tsx:66` which mounts `ChatInterface` directly. No "paused" state exists anywhere in the codebase.

**The voice setup pipeline is fully built:**
- `AionVoiceConfig` shape: `{ description, example_message, guardrails }` (`aion-config-actions.ts:12`).
- `saveAionVoiceConfig()` server action persists voice (`aion-config-actions.ts:178`).
- Chat-driven 4-step onboarding state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`aion-chat-types.ts:225`, `prompts.ts:275`).
- `save_voice_config` chat tool auto-saves voice mid-conversation (`chat/tools/core.ts:118`).
- "Tune Aion's voice" in the sidebar overflow resets the config and re-enters the 4-step flow (`AionSidebar.tsx:1043`, `aion-config-actions.ts:214`).

**The draft generation is fully built:**
- `draft_follow_up` chat tool generates a voice-respecting draft (`chat/tools/core.ts:318`).
- `generateFollowUpDraft()` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`generate-draft.ts:52`).
- `/api/aion/draft-follow-up` is an authenticated POST endpoint with tier gating (`draft-follow-up/route.ts`).
- `tone-anchoring.ts:60` provides a separate 3-tier observational style system (actual sent messages) layered on top of explicit voice config.
- `learn-from-edit/route.ts:25` extracts preferences from draft edits and persists them back to `aion_config.learned`.

**One real gap:** Fresh workspaces never see the 4-step onboarding. `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35`) synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` (`aion-chat-types.ts:247`) returns `'configured'` when that flag is set, bypassing all four steps. The explicit flow is only reached after clicking "Tune Aion's voice" — an overflow menu item most owners won't discover.

**Second gap:** The `needs_test_draft` step (step 4 of onboarding) calls `draft_follow_up`, which requires a deal in the follow-up queue (`chat/tools/core.ts:334`). If the queue is empty, it returns `{ error: 'No deals in the follow-up queue.' }`. No synthetic fallback.

---

## Intended state

Daniel opens the Aion chat, describes his communication style in a few paragraphs, and within that same session sees a real follow-up draft written in his voice. The key requirement is: the draft must use the voice he just described, not a synthesized default. The session should feel like a product handshake, not a generic AI chat.

Per the onboarding state machine, this is exactly what `needs_test_draft` is designed to do — Aion collects voice, example, and guardrails, then demonstrates them with a live draft.

---

## The gap

- Default path bypasses onboarding entirely. New workspaces get a synthesized voice and skip straight to `configured`. No proactive guidance.
- Test-draft step silently fails when the follow-up queue is empty (no error shown to user, Aion would likely apologize and stall).
- "Tune Aion's voice" is the only re-entry point, buried in a sidebar overflow.
- The primer is badly stale — misleads future research runs.

---

## Options

### Option A: Synthetic demo deal for the test-draft step

- **What it is:** When `draft_follow_up` is called during onboarding and the queue is empty, fall back to a hardcoded dummy deal context (e.g. "Corporate offsite, client Sarah Chen, 3 weeks out, proposal sent, not yet viewed"). Generate the draft against that. Mark it clearly as a demo.
- **Effort:** Small — 20 lines in `chat/tools/core.ts:332` to detect empty queue + inject a canned `AionDealContext`.
- **Main risk:** A fake context can generate plausible-sounding but misleading content. If Daniel sends it, that's bad. The "demo" label must be unmissable.
- **Unlocks:** The full onboarding arc completes even for brand-new workspaces. The delight moment (seeing your voice in a real draft) arrives in session 1.

### Option B: Skip the test-draft step when queue is empty

- **What it is:** In `onboarding_state` logic (`chat/tools/core.ts:135` + `prompts.ts:282`), detect queue length at the start of the chat request. If the `needs_test_draft` state is reached and queue is empty, tell Aion via the system prompt to confirm voice and mark onboarding complete without a draft, with a forward promise ("next deal that needs follow-up, I will draft it in your voice automatically").
- **Effort:** Small — one additional workspace-state check in `chat/route/workspace-data.ts`, one branch in the system prompt builder.
- **Main risk:** The delight moment is deferred. Owners who set up voice with no live deals may not return to see it work. The onboarding feels incomplete.
- **Unlocks:** Clean completion of the onboarding arc with no error state. Safe for blank-slate workspaces.

### Option C: Dedicated voice setup form in settings

- **What it is:** Add a voice configuration section to `/settings/aion` with three labeled textareas (Communication style, Example message, Rules/guardrails) that call `saveAionVoiceConfig()` on save. Bypasses chat entirely — more structured, less conversational.
- **Effort:** Medium — new UI section in `AionSettingsView.tsx`, no backend changes needed.
- **Main risk:** Splits the voice-teaching surface between chat (where it should live naturally) and settings (where owners go to configure things). Dilutes the "teach Aion by talking to it" positioning. The user story ("write 3 paragraphs in the Brain tab") specifically points to the chat.
- **Unlocks:** A permanent, discoverable voice-config surface that survives the chat-onboarding UX question entirely. Good as a long-term addition regardless.

---

## Recommendation

**Ship Option A.** The test-draft step is the entire point of Phase A — it proves the voice works. Skipping it (Option B) saves 10 minutes of implementation and removes the delight. Option C is a fine long-term addition but doesn't address the blank-slate problem.

The implementation is small: in `draft_follow_up`'s execute block (`chat/tools/core.ts:332`), detect when the queue returns empty AND `onboardingState === 'needs_test_draft'`. Inject a canned `AionDealContext` that looks like a plausible early-stage deal. Add a `is_demo: true` flag to the return value. In `buildFollowUpPrompt` (`generate-draft.ts:52`), add a one-line prefix when `is_demo` is set so the draft renders with a "(demo — based on a sample deal)" label in the UI.

The second thing to do before any of this: **update the planning primer.** The current state in the primer is 3+ months stale and will misdirect every future research run. This is more urgent than the code change.

---

## Next steps for Daniel

1. **Update `planning-primer.md`** — replace the "Brain tab is paused" and "`aion_config` doesn't exist" entries with the current state. Takes 5 minutes; saves hours of misdirected future research.
2. **Verify the onboarding flow works today** — open `/aion`, click the sidebar overflow (three-dot or settings icon in the sidebar header), tap "Tune Aion's voice", reload the page. You should see the `no_voice` greeting. If you don't, check `resetAionVoiceConfig` server action logs.
3. **Add the synthetic deal fallback** — in `src/app/api/aion/chat/tools/core.ts:332`, after `if (queue.length === 0)`, insert a canned `AionDealContext` with `is_demo: true`. Add a note to `draft_follow_up`'s return type.
4. **Label demo drafts in the UI** — find where `draft_follow_up` tool output is rendered (likely `AionMessageRenderer.tsx` or `DraftPreviewCard.tsx`) and add a subtle "demo" badge when `is_demo` is set.
5. **Mark onboarding complete on approval** — verify that the `save_voice_config` call with `onboarding_complete: true` fires correctly after the demo draft is approved. Check `chat/tools/core.ts:135`.
6. **Delete `ArthurInput.tsx`** if it still exists — the primer flags it as an empty delete candidate (`src/app/(dashboard)/(features)/aion/components/ArthurInput.tsx`).

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config CRUD
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — default voice synthesis
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` + `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding system-prompt injection
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` + `buildFollowUpPrompt`
- `src/app/api/aion/lib/tone-anchoring.ts` — observational tone system
- `src/app/api/aion/draft-follow-up/route.ts` — direct draft endpoint
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" entry point
