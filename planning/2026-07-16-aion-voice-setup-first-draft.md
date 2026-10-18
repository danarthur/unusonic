# Aion Phase A: Voice Setup to First Real Follow-Up Draft

_Researched: 2026-07-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer is outdated — Phase A shipped.** As of the current codebase, the infrastructure described as missing is live:

- `aion_config` exists as a JSONB column on `public.workspaces`. It is fully typed: `AionConfig` holds `voice: { description, example_message, guardrails }`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `voice_default_derived`. (`aion-config-actions.ts:50–74`)
- `saveAionVoiceConfig()` and `getAionConfig()` are live server actions reading/writing this column. (`aion-config-actions.ts:84, 178`)
- The Brain tab is not paused. `AionPageClient` renders `ChatInterface` which calls `/api/aion/chat` — a full authenticated, tier-gated, multi-model route with tool-calling. (`AionPageClient.tsx:73`, `api/aion/chat/route.ts`)
- `/api/aion/draft-follow-up` is a live, authenticated route. It reads `aion_config.voice`, passes it to `generateFollowUpDraft()`, and returns a draft respecting the stored voice description, example, and guardrails. (`draft-follow-up/route.ts:53–63`, `generate-draft.ts:36–46`)
- A 5-state onboarding state machine is wired into the chat route: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state drives a different opening greeting and system prompt instruction. (`aion-chat-types.ts:225–257`, `prompts.ts:275–337`)
- The `save_voice_config` chat tool already accepts all three fields — `description`, `example_message`, `guardrails` — as optional params in a single call. (`core.ts:118–144`)

**The actual gap** is narrow: when a new workspace is created, `applyVoiceDefaultIfEmpty` synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. The chat route reads `voice_default_derived === true` as `configured` and skips onboarding entirely. (`aion-config-helpers.ts:35–45`, `aion-chat-types.ts:247–248`) Daniel opens Aion, gets the operational greeting — no voice setup, no invitation to write his style.

Even if he triggers the onboarding via "Tune Aion's voice" in the Sidebar (which calls `resetAionVoiceConfig()`), the current `no_voice` system prompt tells the model to ask one question at a time: style first, then example next turn, then guardrails next turn. Three separate turns before the test draft is offered.

## Intended state

Daniel opens the Brain tab, reads a clear prompt inviting him to describe his style in freeform — "describe how you write to clients, include an example, and list any rules." He pastes or types 2–3 paragraphs. Aion extracts all three fields in a single call to `save_voice_config`, then immediately generates a test draft from his most active deal. One round-trip, not three.

## The gap

- New workspaces hit `voice_default_derived` bypass → onboarding flow never fires unless manually triggered
- The `no_voice` greeting invites a single-question response, not a rich freeform dump
- The onboarding system prompt instructs step-by-step extraction (one field per turn)
- `save_voice_config` already supports all-fields-at-once — the model just isn't told to use it that way on rich input
- No explicit "draft something now" trigger after voice is saved (except the conversational `needs_test_draft` greeting on the next open)

## Options

### Option A: Document the existing flow, no code changes
- **What it is:** Write a brief onboarding guide for Daniel: use "Tune Aion's voice" in the Sidebar to reset the derived default, then walk through the 4-turn chat flow. Voice gets saved, test draft is offered.
- **Effort:** Small (30 minutes, no code)
- **Main risk:** Daniel has to take 3–4 conversational turns to get to a draft; friction may mean he doesn't bother. The `voice_default_derived` bypass means the flow is invisible unless he knows to look for the Sidebar affordance.
- **Unlocks:** Nothing new. Works today.

### Option B: Update the onboarding prompt for one-shot extraction
- **What it is:** Two changes to `src/app/api/aion/chat/route/prompts.ts`: (1) update the `no_voice` system prompt section to say "if the user's response covers all three aspects — style, example, guardrails — extract all three and call save_voice_config with all fields in one call, then immediately call draft_follow_up on their most active deal"; (2) update the `no_voice` greeting to explicitly invite a rich freeform response rather than asking one narrow question. The tool already accepts all three fields.
- **Effort:** Small (1–2 hours, 1 file, ~10 lines)
- **Main risk:** The model may still decompose the extraction into multiple turns despite the instruction. Needs a manual test to verify one-shot behaviour before shipping.
- **Unlocks:** The "3 paragraphs → draft" flow Daniel described. No new UI, no new routes, no schema changes.

### Option C: Dedicated voice setup panel
- **What it is:** A new panel or modal (e.g. in Settings → Aion or as a first-visit overlay in the Brain tab) with three explicit text areas — style, example, guardrails — plus a "Generate a test draft" button that calls `/api/aion/draft-follow-up` inline and shows the result. Structured form, not a chat.
- **Effort:** Medium (1–2 days, new component + route logic)
- **Main risk:** Adds a parallel entry point that diverges from the conversational model. The chat can still be taught voice via conversation — now there are two places to update it, and they need to stay in sync. More surface to maintain.
- **Unlocks:** A cleaner, more intentional first-time experience. Also good for non-technical teammates who would never think to write to Aion in paragraphs.

## Recommendation

**Option B.** The infrastructure is complete. The only thing missing is a prompt instruction that trusts the user to write richly and the model to extract in one pass. `save_voice_config` in `core.ts:118` already accepts all three optional fields — the tool is ready. The system prompt in `prompts.ts:275–276` just tells the model to ask about style, not to accept a dump and extract. Two sentences of instruction change and a more inviting greeting are the full scope of work.

Do this before Option C. A dedicated form is a good future upgrade but it's premature when the conversational path can be made to work with an afternoon's change. The risk — that the model splits the extraction across turns despite the instruction — is easy to test manually in 10 minutes. If it fails, an explicit extraction step (a second `generateText` call to classify and structure freeform input before saving) is a natural follow-on, still well under a day of work.

Also note: the `voice_default_derived` bypass should be preserved — it is the right behaviour for workspaces that don't want to go through setup. The onboarding flow should trigger only when the user explicitly resets via the Sidebar, not on every new workspace.

## Next steps for Daniel

1. **Verify the bypass is working:** Open `/aion` in a fresh session. If you see the operational greeting (deal count, pipeline value), the `voice_default_derived` bypass is active — your workspace already has a synthesized voice from your workspace name.
2. **Trigger the onboarding flow to test it now:** In the Aion chat, open the Sidebar (`[` key) → overflow menu → "Tune Aion's voice". This calls `resetAionVoiceConfig()` and on next open you'll see the `no_voice` greeting.
3. **Edit `src/app/api/aion/chat/route/prompts.ts:275–276`:** Update the `no_voice` onboarding instruction to accept one-shot rich input and call `save_voice_config` with all fields. Example addition: `"If the user's response describes their style, provides an example, and states rules in one message, extract all three fields and call save_voice_config with description, example_message, and guardrails in a single call. Then call draft_follow_up on their most active deal."`
4. **Edit the `no_voice` greeting in `prompts.ts:301–311`:** Change the opening from "How would you describe your style?" to an explicit invitation: "Tell me how you write to clients — your tone, an example message you're proud of, and any rules I should follow. Two or three paragraphs is plenty."
5. **Test manually:** Reset voice via Sidebar, reload, paste 3 paragraphs, verify Aion saves all three fields in one turn and immediately generates a draft.
6. **Follow-on if one-shot extraction is unreliable:** Add a structured extraction pre-pass — a short `generateText` call that classifies freeform input into `{ description, example_message, guardrails }` before the main turn. Lives in the chat route handler, triggered when `onboardingState === 'no_voice'` and the user message exceeds ~80 words.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionConfig type, getAionConfig, saveAionVoiceConfig, updateAionConfigForWorkspace
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — applyVoiceDefaultIfEmpty, synthesizeDefaultVoice, voice_default_derived bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — OnboardingState machine and getOnboardingState
- `src/app/api/aion/chat/route/prompts.ts:275–337` — onboarding system prompt branches and buildGreeting per state
- `src/app/api/aion/chat/tools/core.ts:118–144` — save_voice_config tool (already supports all 3 fields)
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint, voice-aware
- `src/app/api/aion/lib/generate-draft.ts` — generateFollowUpDraft, buildFollowUpPrompt with voice injection
