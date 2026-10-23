# Aion Phase A: voice setup to first real draft

_Researched: 2026-10-23 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on stated premises:** The queue item was written against the 2026-04-10 primer. As of 2026-10-23 the codebase is significantly further along. `aion_config` exists and is wired. The chat route is a full production implementation. The gap is narrower than the question assumes — restated below.

## Current state

`public.workspaces.aion_config` is a live JSONB column. `AionConfig` is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` and includes `voice: { description, example_message, guardrails }`. The column is read by `getAionConfigForWorkspace` (`:106`) via the service-role client and written by `saveAionVoiceConfig` (`:178`).

The chat route at `src/app/api/aion/chat/route.ts:59` is fully built: auth-gated, tier-gated, tool-calling, streaming. It loads `aionConfig` on every turn (`:110`) and injects the voice fields into the system prompt via `buildSystemPrompt` at `src/app/api/aion/chat/route/prompts.ts:98`.

A 5-state onboarding machine exists at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route reads this via `getOnboardingState` (`:124`) and `buildSystemPrompt` appends a one-line onboarding instruction at `prompts.ts:284`: _"Ask about communication style. Save via save_voice_config."_ The `save_voice_config` tool lives at `src/app/api/aion/chat/tools/core.ts:118`.

The follow-up draft route at `src/app/api/aion/draft-follow-up/route.ts:59` is fully built. `generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:26` already injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`:63`).

**The bypass:** `voice_default_derived === true` (set by `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts`) causes `getOnboardingState` to return `'configured'` immediately (`:248`). New workspaces never enter the onboarding. The only path back is the sidebar overflow → "Tune Aion's voice" → `resetAionVoiceConfig` — then the 4-step conversational flow starts.

There is no "Brain tab" as a named UI surface. The Aion chat at `/aion` is the operational equivalent.

## Intended state

Daniel opens the Aion chat, pastes a few paragraphs about his communication style in one message, and immediately gets back a test follow-up draft in that same conversation. From that point forward every draft Aion generates — in the follow-up card, in the dispatch API, anywhere — reflects his voice. The 4-step conversational inquisition is gone; one free-form paste is the full onboarding act.

## The gap

- The `no_voice` onboarding prompt is a single terse instruction (`"Ask about communication style. Save via save_voice_config."`). Aion interprets this as a step-by-step questioning loop rather than a single-paste intake.
- The `voice_default_derived` bypass means Daniel will never see `no_voice` state unless he explicitly resets via the sidebar overflow — an affordance buried two levels deep.
- After `needs_test_draft`, the prompt says `"Offer a test draft. Use draft_follow_up."` (`prompts.ts:291`). But `draft_follow_up` requires deal context (`AionDealContext`); when no deal is in scope the tool call fails silently and Aion halts.
- No feedback loop: after the draft is generated, there's no path to refine the voice config from the draft output ("make it less formal" → save updated guardrail).

## Options

### Option A: Prompt surgery only

- **What it is:** Rewrite the two onboarding instructions in `prompts.ts` (lines 285, 291). `no_voice` becomes: invite a single free-form paste, extract all three fields in one `save_voice_config` call. `needs_test_draft` becomes: ask for the most recent active deal title, call `lookup_historical_deals`, then call `draft_follow_up` with that context — or use a placeholder client if no deals exist.
- **Effort:** Small — one file, two prompt strings, no schema or API changes.
- **Main risk:** LLM extraction quality. Pulling `description`, `example_message`, and `guardrails` from 3 free-form paragraphs in a single tool call may produce misclassified fields. Recoverable — user can re-paste.
- **Unlocks:** The stated goal immediately. Every downstream draft route already consumes `voice` — nothing else to wire.

### Option B: Voice setup form in `/settings/aion`

- **What it is:** Add a `VoiceSetupSection` component to `src/app/(dashboard)/settings/aion/`. Three labeled textareas (description, example message, guardrails). On save: call `saveAionVoiceConfig`, then call `/api/aion/draft-follow-up` against the most recent active deal and render the draft inline as a preview.
- **Effort:** Medium — new component, new API call in the settings page, deal-lookup server action.
- **Main risk:** Requires navigating away from the primary work surface. "Immediately see a draft" is harder to deliver — the draft preview lives in settings, not alongside a real deal.
- **Unlocks:** A cleaner separation between configuration and conversation. Good if voice setup is expected to happen repeatedly (rebranding, new employee).

### Option C: Remove the `voice_default_derived` bypass, add a first-chat interstitial

- **What it is:** Change `applyVoiceDefaultIfEmpty` so it does NOT set `voice_default_derived`. New workspaces enter `no_voice` state. Add a pre-chat UI card (rendered in `ChatInterface` when `onboardingState === 'no_voice'`) that presents a single textarea — structured like a form, not a chat message. On submit, calls `saveAionVoiceConfig` directly from the client action, then starts the chat.
- **Effort:** Medium-large — touches the bypass logic (risk of regressing existing users), adds a UI component to `ChatInterface`, and requires a client-side server action call.
- **Main risk:** Removing the bypass could interrupt the first-session experience for new workspace members who aren't the owner and shouldn't be setting voice config. Needs role gating.

## Recommendation

**Option A.** The backend is already complete. The only reason the stated goal isn't achieved today is that the onboarding instructions in `prompts.ts` drive Aion toward a step-by-step interrogation instead of a single-paste intake. Two prompt strings rewritten, no schema changes, no new components, no deployment coordination. The tradeoff accepted: extracting three distinct fields from free-form paragraphs is LLM-dependent and can produce blurry field boundaries — but misclassification is recoverable (user pastes again, or the sidebar "Tune voice" path corrects it), and the downside is a weaker voice config, not a broken feature.

Option B is the right long-term home for voice setup but doesn't deliver the "open chat, paste once, see draft" experience. Build it after Option A proves the extraction quality.

Option C solves discoverability but adds scope risk: removing the `voice_default_derived` bypass touches existing workspace state for all users, not just new ones, and the interstitial needs role gating to avoid crew members overwriting the owner's voice.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts:284`. Replace the `no_voice` instruction with: _"The user hasn't set their voice yet. Invite them to paste 2-3 paragraphs describing how they write to clients — tone, phrases they always use or avoid, formality level. From that text, extract `description`, `example_message` (a representative sentence in their style), and `guardrails` (any hard rules). Call `save_voice_config` with all three fields in one shot."_
2. On line 291, replace the `needs_test_draft` instruction with: _"All voice fields are saved. Call `lookup_historical_deals` with `status_filter: 'active'`, `limit: 1` to get the most recent active deal. Use the deal's client and title to call `draft_follow_up`. If no deals exist, generate a draft for a generic production-company follow-up using the saved voice. After the draft appears, ask: does this sound right? If the user says something is off, infer the correction, update the relevant voice field via `save_voice_config`, and regenerate."_
3. Test end-to-end: call `resetAionVoiceConfig` from the sidebar to put your workspace in `no_voice` state, then open a new chat and paste three sentences about your style.
4. If the extraction is blurry (e.g., `description` and `guardrails` swap), add explicit labeling to the intake prompt: ask the user to tag their paragraphs ("My style:", "An example:", "Hard rules:"). Update step 1 accordingly.
5. Optional: add a `VoiceSetupSection` to `src/app/(dashboard)/settings/aion/` (three labeled textareas, live draft preview) as a deliberate configuration surface — after the chat path is validated.
6. Optional: remove the `voice_default_derived` bypass once the form path (step 5) is live, so first-time owners are routed there instead of getting a synthesized default.

## References

- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding instruction strings
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty` (bypass)
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` (voice injection)
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool definition
