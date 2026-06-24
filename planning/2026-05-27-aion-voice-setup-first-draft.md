# Aion Phase A: Voice Setup → First Draft

_Researched: 2026-05-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How this was understood:** The planning-primer's state description is outdated. The research corrects that below. The real question is: what's blocking the "write once, get draft" experience?

## Current state

The primer's framing is stale in two important ways:

**`aion_config` exists.** `public.workspaces.aion_config` is a live `Json` column, read and written across the entire codebase. `getAionConfig()` and `getAionConfigForWorkspace()` are in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–120`. `saveAionVoiceConfig()` (same file, line 178) writes `{description, example_message, guardrails}` into it. No migration needed.

**The Aion chat is fully wired.** `/aion` renders `ChatInterface` via `AionPageClient.tsx`. The chat route at `src/app/api/aion/chat/route.ts` is authenticated, tier-gated, kill-switch aware, and uses the real model stack (`getModel()` from `src/app/api/aion/lib/models.ts`). The 16-line GPT-4-turbo stub the primer described is gone.

**The onboarding state machine exists.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives a 5-state sequence: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The cold-open greeting in `src/app/api/aion/chat/route/prompts.ts:300–338` returns a different opening message for each state.

**The tools exist.** `save_voice_config` (core.ts:118) accepts `description`, `example_message`, and `guardrails` all at once — it's a single tool call, not three. `draft_follow_up` (core.ts:318) fetches the top queued deal, builds `AionDealContext`, and calls `generateFollowUpDraft()` which injects the workspace voice config into the prompt (generate-draft.ts:63–75).

**What Aion is actually told to do** when `onboardingState === 'no_voice'` (prompts.ts:275–276): `"Ask about communication style. Save via save_voice_config."` That's the entire instruction. No mention of extracting multiple fields in one go. No instruction to call `draft_follow_up` immediately after saving.

## Intended state

Daniel opens `/aion`, types 3 paragraphs covering his style, a sample message, and any rules. Aion extracts all three fields from that single message, calls `save_voice_config` once with all three, and in the same turn calls `draft_follow_up` to show him a draft. The full cycle completes in a single sitting without the user needing to return.

The adjacent pattern is how the follow-up training flow works (prompts.ts:206–221): Aion is instructed to listen for multiple signals at once ("timing, channels, rules, exceptions"), extract structured fields, call the tool, and immediately confirm. Voice onboarding should follow the same model.

## The gap

- The `no_voice` system prompt instructs Aion to "ask about style" — not to extract all three fields at once from a rich message.
- No instruction tells Aion to call `draft_follow_up` in the same turn after voice is saved.
- `draft_follow_up` silently fails with `{ error: 'No deals in the follow-up queue.' }` if the workspace has no queued items — a likely state for new or low-activity workspaces.
- The `needs_test_draft` greeting is only shown on the _next_ cold-open after voice is saved, not in the same session.

## Options

### Option A: Strengthen the onboarding system prompt
- **What it is:** Edit the four `ONBOARDING` blocks in `prompts.ts:275–283` to instruct Aion to (a) extract all three voice fields from a single rich message when the user provides them together, (b) call `save_voice_config` with all fields at once, and (c) immediately call `draft_follow_up` after saving. Also patch `draft_follow_up` to fall back to any open deal (not just queued ones) so the test draft always works.
- **Effort:** Small — two files: `src/app/api/aion/chat/route/prompts.ts` and `src/app/api/aion/chat/tools/core.ts:318–345`.
- **Main risk:** LLM compliance is probabilistic. The model may still ask separate questions if the user's message is ambiguous. No guarantee of "write once, draft immediately" every time.
- **Unlocks:** The intended experience for users who write a rich opening message. Fastest path to testable behavior.

### Option B: Inline voice setup form in ChatInterface
- **What it is:** When `onboardingState === 'no_voice'`, `ChatInterface` renders a form card (three textareas: style, example, rules) as the initial message instead of the LLM greeting. Submit calls `saveAionVoiceConfig` directly, then posts a synthetic user message that triggers `draft_follow_up`. Bypasses LLM for the capture step entirely.
- **Effort:** Medium — new `VoiceSetupCard` component, a new `voice_form` content type in `AionMessageContent`, and wiring in `ChatInterface` to render it on state check.
- **Main risk:** Introduces a form inside the chat UX, which cuts against the conversational model. Also requires a new structured message type in the content schema.
- **Unlocks:** Deterministic "write once, get draft" with no LLM failure modes. Safer for onboarding funnels.

### Option C: Voice capture at /settings/aion, redirect to chat
- **What it is:** Add a "Set up Aion voice" card to `AionSettingsView` (the settings page already exists at `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`). After save, the page redirects to `/aion` which opens at `needs_test_draft` state and immediately offers the draft.
- **Effort:** Medium — new settings card, wiring `saveAionVoiceConfig`, redirect on success.
- **Main risk:** Splits the experience across two routes. The user has to navigate to settings first, which is unlikely to be the natural path.
- **Unlocks:** Clean config/conversation separation; could be useful as a "reconfigure" path even if not the primary onboarding one.

## Recommendation

Ship Option A first. The full pipeline is already wired — `save_voice_config` accepts all three fields, `draft_follow_up` calls `generateFollowUpDraft` with the saved voice, and the system prompt already drives Aion's behavior. The only missing piece is the instruction text in two places. This is a 30-minute code change with an immediately testable result.

The risk that Aion won't extract all three fields from a single message is real but manageable: test it with a realistic 3-paragraph input, see if the model calls the tool correctly, and tune the prompt instruction if needed. Claude Sonnet handles structured extraction from free text well; the instruction just needs to make the extraction explicit.

Add the queue fallback to `draft_follow_up` in the same PR — it takes 5 lines and prevents the test draft from silently failing on workspaces with no queued deals.

Option B becomes worthwhile if real usage shows the conversational path is confusing. It's not an alternative — it's a follow-up.

## Next steps for Daniel

1. In `src/app/api/aion/chat/route/prompts.ts:275–283`, replace the four sparse `ONBOARDING` blocks with explicit instructions: for `no_voice`, instruct Aion to extract description, example, and guardrails from the user's message in one `save_voice_config` call and then call `draft_follow_up`. Reference the follow-up training block (line 206) as the model for how to write this.

2. In `src/app/api/aion/chat/tools/core.ts:332–335`, patch the "no queue items" fallback: instead of returning an error, fetch the most recently updated open deal from `public.deals` and draft for it.

3. Test the flow end-to-end: open `/aion` on a workspace where `aion_config.voice` is null (or call `resetAionVoiceConfig()`), paste a 3-paragraph voice description, confirm Aion calls `save_voice_config` and then `draft_follow_up` in the same turn.

4. Verify `getOnboardingState` marks the config as `configured` after `save_voice_config` is called with `onboarding_complete: true`. If Aion omits that flag, state stays at `needs_test_draft` forever — add a guard in the prompt instruction.

5. Update the planning-primer's "Current notable state" section to reflect that `aion_config` exists and the chat route is live.

## References

- `src/app/api/aion/chat/route/prompts.ts:275–283` — onboarding blocks (the gap)
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318–345` — `draft_follow_up` tool + queue fallback
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178–206` — `saveAionVoiceConfig`
- `src/app/api/aion/lib/generate-draft.ts:52–137` — `buildFollowUpPrompt` with voice injection
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx` — `getDealContextForAion`
