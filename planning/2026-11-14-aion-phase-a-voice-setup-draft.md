# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-11-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

This question was written in April 2026. By November 2026, Phase A has been substantially implemented.

**`aion_config` exists and is live.** The column `public.workspaces.aion_config` stores a JSONB `AionConfig` blob. The shape is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`: `voice.description`, `voice.example_message`, `voice.guardrails`. Read by `getAionConfig()` (line 84) and `getAionConfigForWorkspace()` (line 106).

**The Brain tab is live.** `src/app/(dashboard)/aion/page.tsx` renders `<ChatInterface>` directly. No "paused" gate exists in the current code.

**Conversational voice onboarding is wired.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` resolves one of five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route's greeting (`src/app/api/aion/chat/route/prompts.ts:310`) serves a different opening message for each state. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` saves each field to `aion_config` as the user answers. The system prompt injects the onboarding instruction at lines 284–292 of `prompts.ts`.

**Draft generation is wired.** The `draft_follow_up` tool at `core.ts:318` calls `getDealContextForAion` and `generateFollowUpDraft`. The draft injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`src/app/api/aion/lib/generate-draft.ts:62–74`). A standalone REST route at `src/app/api/aion/draft-follow-up/route.ts` does the same with tier gating.

**Learn-from-edit is wired.** `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx:283` POSTs to `/api/aion/learn-from-edit` after a user edits a draft. That route extracts vocabulary and pattern signals and merges them into `aion_config.learned`.

**Voice retune exists.** The AionSidebar header overflow (line 973) exposes "Tune Aion's voice", which calls `resetAionVoiceConfig()` and re-enters the 4-step flow on next chat open.

## Intended state

The original question's specific framing was: Daniel writes 3 paragraphs in one place and immediately sees a draft. The intent was a low-friction, single-session path from blank → voice configured → first real draft in hand.

The current in-chat onboarding is a reasonable proxy for this — it's 3–4 short turns, not 3 paragraphs in a form — but the final step ("immediately see a draft") has a dependency that can break it.

## The gap

- **Empty-queue at `needs_test_draft`**: `draft_follow_up` resolves its deal from `ops.follow_up_queue`. If the queue is empty (new workspace, no overdue deals), the tool returns `{ error: 'No deals in the follow-up queue.' }`. Aion has no fallback for this case — the onboarding arc ends on a silent error at the most motivating moment.
- **No voice editor outside chat**: `/settings/aion` (`AionSettingsView.tsx`) only manages consent and cadence. There is no form to view or edit `voice.description`, `voice.example_message`, or `voice.guardrails` outside the chat. The only escape hatch is "Tune Aion's voice" which resets everything and re-opens the 3-step conversational flow — no surgical edit.
- **Voice description depth**: The `no_voice` greeting offers 3 short chips as answers. The original goal assumed 3 paragraphs of rich input. The chip-shortcut path produces thin voice configs, which affects draft quality. This is a prompt/UX design gap, not a code gap.

## Options

### Option A: Fix empty-queue fallback at test-draft step

- **What it is:** When `draft_follow_up` encounters an empty follow-up queue during the `needs_test_draft` onboarding step, Aion should ask the user to describe a deal (or use the most recently created deal from `ops.deals`) rather than returning an error. Add a `fetchMostRecentDeal` fallback inside the `draft_follow_up` tool and a system-prompt note for the `needs_test_draft` state: "If the queue is empty, use the most recently updated deal."
- **Effort:** Small — 1 file edit (`core.ts`, the `draft_follow_up` execute block), no schema changes.
- **Main risk:** Most recent deal may not be a good test case (closed, no client context). The draft might look odd. Guard with a "this is a test draft — your first real draft will be better" framing in the response.
- **Unlocks:** Every new workspace can complete the full onboarding arc end-to-end without hitting a dead end.

### Option B: Add voice config editor to settings

- **What it is:** Add a `VoiceConfigSection` to `AionSettingsView.tsx` with three textarea fields for `description`, `example_message`, and `guardrails`, wired to `saveAionVoiceConfig`. Read the current values from `getAionConfig()` in the page's server component.
- **Effort:** Medium — new component, server action already exists (`saveAionVoiceConfig` at `aion-config-actions.ts:178`), no schema changes.
- **Main risk:** Duplicate edit paths (settings form vs. chat onboarding) can diverge. Need to decide: does editing voice in settings reset `onboarding_state` to `configured`, or does it re-enter the test-draft offer?
- **Unlocks:** Daniel can tweak voice config precisely without re-entering the full 3-step chat flow. Good for ongoing tuning post-launch.

### Option C: Replace chip shortcuts with a free-text prompt at the `no_voice` greeting

- **What it is:** Change the `no_voice` greeting to drop the 3-chip shortcuts and instead ask an open question: "Tell me how you talk to clients. Write as much as you like — a few sentences or a few paragraphs." Set a note in the ONBOARDING system prompt: "This is their answer. Extract description, style, and any implied guardrails. Ask for an example message next." Let Aion synthesize rich input rather than capturing thin chip answers.
- **Effort:** Small — changes to `prompts.ts` and the greeting catalog (`greeting-catalog.ts`), no schema changes.
- **Main risk:** Users may still give short answers even without chips. Harder to predict quality. The chip path is a known, testable experience.
- **Unlocks:** Richer voice configs from first setup, closer to the original "3 paragraphs" intent.

## Recommendation

Do Option A first, then Option C.

Option A is the only remaining blocker to completing the full onboarding arc the question describes. An empty queue returning a silent error at exactly the moment Aion is about to prove its value is a trust-destroying experience. It takes an hour to fix and unblocks every fresh workspace.

Option C is the low-cost way to close the gap between "3 chip taps" and "3 paragraphs." It doesn't require a new settings form — it just changes the conversation shape. Try it, evaluate the quality of the voice configs it produces after 20–30 real users, and decide whether Option B is still needed.

Skip Option B for now. The settings form doubles the edit surface without adding much for new users. Revisit once there's evidence users want to edit individual voice fields post-setup.

Tradeoff accepted: not building a form means voice can only be set/reset through the chat. That's acceptable because the chat flow is the designed onboarding surface, not a workaround.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/tools/core.ts:333` — in `draft_follow_up`'s execute block, add a fallback: when queue is empty, query `ops.deals` for the most recently updated deal with status not "closed" and pass its ID to `getDealContextForAion`.
2. In the same block, add a flag to the return value (e.g. `is_fallback_deal: true`) so the chat route can tell Aion to frame the draft as a test example, not a live action.
3. Update the `needs_test_draft` ONBOARDING prompt in `src/app/api/aion/chat/route/prompts.ts:291` to say: "If queue is empty, use the most recently updated active deal as a test. Frame the draft as a test example."
4. Update the `no_voice` greeting in `src/app/api/aion/chat/route/prompts.ts:313`: drop the 3 chips (or move them to `no_example`), and replace with an open question: "How do you talk to clients? Write as much as you like."
5. Update the matching `no_voice` ONBOARDING system-prompt note (line 285) to: "The user is describing their voice — extract style, tone, and implied guardrails. When they're done, save via save_voice_config and move on to asking for an example message."
6. Run `npm run test` and check `src/app/api/aion/chat/__tests__/` for any onboarding-state tests to update.

## References

- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/chat/route/prompts.ts:284–295` — onboarding state injections
- `src/app/api/aion/chat/route/prompts.ts:310–348` — greeting cases per state
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12,178` — `AionVoiceConfig`, `saveAionVoiceConfig`
- `src/app/api/aion/lib/generate-draft.ts:62` — voice injection into draft prompt
