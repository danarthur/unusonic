# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-09-03 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood this:** The question was written when the system was a stub. The codebase has moved ahead substantially. This doc corrects the premise, identifies the real remaining gap, and recommends the one-step path to close it.

---

## Current state

**The premise in the queue item is outdated.** As of today:

- `public.workspaces.aion_config` **exists and is in active use.** `getAionConfig()` and `getAionConfigForWorkspace()` both read it (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84, 106`). The typed `AionVoiceConfig` shape (`description`, `example_message`, `guardrails`) is fully defined (`aion-config-actions.ts:12-16`).

- `saveAionVoiceConfig()` is a complete server action that writes voice to `aion_config` (`aion-config-actions.ts:178`).

- `/api/aion/draft-follow-up/route.ts` is a **fully wired route** with auth guard, tier gate, kill-switch check, and voice injection (`draft-follow-up/route.ts:21-73`). Not a stub.

- `generateFollowUpDraft()` in `src/app/api/aion/lib/generate-draft.ts:52` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the LLM system prompt.

- The Aion chat already implements a **5-state conversational onboarding machine** (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) driven by `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`). At `no_voice`, the system prompt tells Aion to ask about communication style and call `save_voice_config`. At `needs_test_draft`, it tells Aion to call `draft_follow_up`.

- The `save_voice_config` chat tool (`src/app/api/aion/chat/tools/core.ts:118`) writes the voice fields and optionally marks onboarding complete.

- The "Brain tab is paused" note in the primer is stale. The `/aion` page renders a full `ChatInterface` with no paused state in code (`src/app/(dashboard)/aion/AionPageClient.tsx:66-76`).

**The actual blocker:** New workspaces get `voice_default_derived: true` injected automatically — `applyVoiceDefaultIfEmpty()` synthesizes a default voice from the workspace name (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts`). `getOnboardingState()` short-circuits to `configured` when this flag is set (`aion-chat-types.ts:248`), so the 4-step forcing block never fires. Daniel will open the chat and go straight to normal Aion, never being asked about his communication style.

Additionally, the `draft_follow_up` chat tool pulls real deal context from the follow-up queue. A workspace with no deals or no pending follow-ups cannot exercise the test-draft step at all.

**Summary of what's missing:**
- No standalone form for Daniel to write his 3 paragraphs outside of chat
- The conversational onboarding is bypassed for new workspaces by the synthesized default
- No synthetic or fallback deal context for the test-draft step when the pipeline is empty

---

## Intended state

Daniel opens Aion, writes three paragraphs in plain prose describing how he talks to clients, hits save, and is immediately shown a sample follow-up draft generated in that voice. This can repeat any time he wants to retune. The voice then feeds every subsequent draft Aion produces.

The rest of Phase A (auth guard, model upgrade, deal-context fetching) is already done. What's missing is the entry point — the form or modal where Daniel puts his voice in.

---

## The gap

- No UI entry point for voice setup outside of chat (no form, no modal, no settings section)
- Conversational onboarding bypassed by `voice_default_derived` for new workspaces
- Test-draft step in the chat flow fails silently if there are no deals in the pipeline
- Settings > Aion (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) covers only card-beta consent — no voice section at all

---

## Options

### Option A: Add a voice config form to Settings > Aion (recommended)

- **What it is:** A new section in `AionSettingsView.tsx` with three textareas (`description`, `example_message`, `guardrails`) and a Save button wired to `saveAionVoiceConfig()`. Add a secondary "Preview a draft" button that POSTs to `/api/aion/draft-follow-up` with a synthetic placeholder deal context (hardcoded title, status, reason) and renders the result inline.
- **Effort:** Small — one component section, two API calls already implemented.
- **Main risk:** The preview draft uses a synthetic deal, which means the output may feel generic the first time. But it demonstrates the voice-respect property immediately, which is the goal.
- **Unlocks:** Daniel can configure voice in 5 minutes without any deals in the pipeline. Every subsequent real draft from `/api/aion/draft-follow-up` respects the saved config immediately.

### Option B: Fix the conversational onboarding bypass

- **What it is:** Remove or conditionally suppress the `voice_default_derived` short-circuit for owners who have never explicitly set a voice. When Daniel's workspace has no real voice set, let the 4-step flow fire in chat. Add a fallback synthetic deal for the `draft_follow_up` chat tool when the follow-up queue is empty.
- **Effort:** Medium — modifying the `voice_default_derived` logic requires careful scoping (it was added to skip the flow for existing workspaces; removing it naively breaks that). The synthetic deal fallback for the chat tool also needs care.
- **Main risk:** Conversational onboarding is slower than a form and harder to retune. The multi-step nature (3 separate chat messages to fill 3 fields) adds friction where a form is simpler.
- **Unlocks:** Voice setup as a chat experience, staying consistent with the rest of Aion's interaction model.

### Option C: Dedicated voice setup page at `/settings/aion/voice`

- **What it is:** A standalone page with a richer form — labeled sections explaining what each field is for, an example, and a live draft preview panel. Surfaced as a card in the Aion sidebar header (alongside "Tune Aion's voice" which currently only does a reset).
- **Effort:** Large — new route, page, component, and surface integration.
- **Main risk:** Over-engineering for the goal. The outcome is the same as Option A with more surface area.
- **Unlocks:** A shareable, bookmarkable voice configuration page, but this isn't a near-term need.

---

## Recommendation

**Option A.** The infrastructure is fully in place — `saveAionVoiceConfig()` is ready, `/api/aion/draft-follow-up` is wired, and `buildFollowUpPrompt()` already injects all three voice fields. What's missing is one form and a synthetic deal payload for the preview call.

The synthetic deal for the preview can be a hardcoded constant: `{ title: 'Preview draft', status: 'proposal_sent', event_date: null }` with no client or proposal data. `buildFollowUpPrompt()` already handles null client and null proposal gracefully (`generate-draft.ts:90-125`), so the call will succeed and produce a usable draft.

The conversational onboarding in chat (Option B) is an acceptable second entry point for users who prefer it, but it's not the path of least resistance for a founder doing a first setup. Fix the form first, retune the chat flow later if users ask.

---

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`. Add a new `<StagePanel>` section titled "Voice config" with three `<textarea>` fields mapped to `description`, `example_message`, and `guardrails`. Wire the Save button to `saveAionVoiceConfig()` (already imported from `aion-config-actions`).

2. Add a "Preview a draft" button that POSTs to `/api/aion/draft-follow-up` with body `{ workspaceId, context: { deal: { title: 'Preview draft', status: 'proposal_sent', event_date: null }, followUp: { reason: 'Checking in after proposal', suggested_channel: 'email', recent_log: [] }, client: null, proposal: null } }`. Render the returned `draft` text in a `<StagePanel>` below the form.

3. Read the current voice from `getAionConfig()` in the page's server component and pass it down as `initialVoice` so the form pre-populates on load. The page already fetches server state — add `aion_config` to the existing query.

4. Verify that `saveAionVoiceConfig()` succeeds and clears the `voice_default_derived` flag (it does — the action calls `{ voice_default_derived: _drop, ...rest }`, stripping the flag on save, `aion-config-actions.ts:190`).

5. Test: set voice in the form, click Preview — verify the draft contains voice-specific phrasing. Then open a real Follow-Up Card on a deal and click "Generate draft" — verify the same voice appears.

6. Optional: rename the existing "Tune Aion's voice" sidebar action to route to this settings page instead of just resetting and displaying a toast.

---

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page to extend
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16, 84, 178` — types + read/write actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `voice_default_derived` synthesis
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` state machine
- `src/app/api/aion/draft-follow-up/route.ts` — draft route (fully wired)
- `src/app/api/aion/lib/generate-draft.ts:52` — voice injection into prompt
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` chat tool
- `src/app/api/aion/chat/route/prompts.ts:275` — 4-step onboarding forcing block
