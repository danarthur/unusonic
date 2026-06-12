# Aion Phase A: Voice setup and first real draft

_Researched: 2026-06-12 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of the question is significantly outdated. Phase A has been largely shipped since the primer was written (April 10, 2026). Here is what actually exists today:

**`aion_config` column exists** on `public.workspaces`. It is a live JSONB column with a full type system — `AionConfig`, `AionVoiceConfig`, `AionLearnedConfig`, `AionFollowUpPlaybook` — all defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`.

**The chat route is fully implemented.** `/api/aion/chat/route.ts` is not a stub — it is an authenticated, rate-limited, tier-gated, tool-calling, streaming route with workspace snapshot injection, session continuity, and rolling summarization.

**Voice config server actions exist.** `getAionConfig()`, `saveAionVoiceConfig()`, `updateAionConfigForWorkspace()`, `resetAionVoiceConfig()` are all implemented at `aion-config-actions.ts:84`.

**`save_voice_config` tool exists.** The chat route's tool set (`src/app/api/aion/chat/tools/core.ts:118`) includes a tool that extracts and saves `description`, `example_message`, and `guardrails` whenever a user describes their communication style. Aion calls this automatically.

**The onboarding forcing block is implemented.** `getOnboardingState()` at `aion-chat-types.ts:247` drives a state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `route/prompts.ts:292` returns structured onboarding messages for each state. `buildSystemPrompt()` at `route/prompts.ts:275` injects onboarding instructions per state.

**`/api/aion/draft-follow-up` is fully implemented** at `src/app/api/aion/draft-follow-up/route.ts` — auth, tier gate, kill switch, voice injection, and `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25`.

**`getDealContextForAion` exists** — imported by the chat tools in `core.ts:26`.

**The real current behavior for a new workspace:**
`applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35` auto-synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. Because `getOnboardingState()` returns `'configured'` when that flag is set (`aion-chat-types.ts:248`), the 4-step onboarding forcing block never fires. The only explicit voice-setup path is the sidebar overflow → "Tune Aion's voice" (`AionSidebar.tsx`), which calls `resetAionVoiceConfig()`.

## Intended state

Daniel opens `/aion`, writes 3 paragraphs describing how he talks to clients, and immediately sees a follow-up draft that respects that voice — without needing to know about a sidebar overflow menu.

The onboarding state machine (`no_voice → needs_test_draft`) already handles this flow end-to-end. The `needs_test_draft` greeting at `route/prompts.ts:329` offers a draft with suggestion chips. The `save_voice_config` tool handles extraction. The gap is purely about entering that flow: the synthesized-default path bypasses it silently.

## The gap

- New workspaces get `voice_default_derived: true` silently — Daniel lands in `configured` state and the onboarding flow never fires.
- The "Tune Aion's voice" affordance to re-enter explicit setup is two levels deep in the sidebar overflow — not discoverable on first open.
- After conversational voice save mid-chat, there is no explicit prompt to generate a test draft (the `needs_test_draft` forcing logic only fires when `buildGreeting()` is the entry point, not mid-conversation).
- The draft step requires at least one deal in the follow-up queue; no guard surfaces this clearly.

## Options

### Option A: Add a "Tune your voice" chip to the configured greeting when voice is auto-derived

- **What it is:** In `buildGreeting('configured')` (called when `voice_default_derived: true`), add one chip: `{ label: 'Set up your voice', value: 'I want to describe how I actually talk to clients — tell me what you need.' }`. This passes `AionConfig` into `buildGreeting()` to check the flag. No new states, no new routes.
- **Effort:** Small. One parameter added to `buildGreeting` signature, one conditional chip in the `configured` case at `route/prompts.ts:340`.
- **Main risk:** Changes the pull-mode greeting design slightly — adds a setup chip that disappears after first explicit voice save. Low visual noise.
- **Unlocks:** The existing `no_voice → needs_test_draft` flow becomes reachable without knowing about the sidebar overflow.

### Option B: Distinct `voice_setup_pending` onboarding state

- **What it is:** Replace `voice_default_derived: true → configured` mapping with a new `voice_setup_pending` state that produces a softer greeting: "I've set up a starter voice for [workspace]. Want to tune it now, or just start using me?" Two chips: tune now / skip. Clicking "tune now" triggers the `no_voice` instruction path.
- **Effort:** Small-medium. New state added to `OnboardingState` type, new case in `buildGreeting()` and `buildSystemPrompt()`, update `getOnboardingState()` logic.
- **Main risk:** More state surface area to maintain; `voice_default_derived` flag semantics shift slightly.
- **Unlocks:** Cleaner first-run experience with a named decision point, rather than a chip that appears on every fresh open.

### Option C: Voice setup form in `settings/aion/`

- **What it is:** Add a form to `AionSettingsView.tsx` with three text areas (description, example message, guardrails) wired to the existing `saveAionVoiceConfig()` server action. Independent of the chat flow.
- **Effort:** Medium. New form component, save/reset wiring, display of current values.
- **Main risk:** Splits voice setup across two surfaces (chat + settings). Owners might not find settings; others might miss the chat-learning path.
- **Unlocks:** Non-chat path to voice setup; useful as a supplemental surface once the primary chat path works.

## Recommendation

Ship Option A. The existing infrastructure is complete and correct — the only problem is the `voice_default_derived` path silently skips the front door. Adding one conditional chip to the configured greeting is a targeted fix with no architectural risk.

The chip should appear only when `voice_default_derived === true` (i.e., voice has never been explicitly set) and disappear once `saveAionVoiceConfig` has been called. This keeps the pull-mode greeting clean for owners who have already done voice setup.

Option B is a better long-term design but adds state complexity that is not justified until A proves the flow. Option C is worth adding eventually as a settings-page supplement, but building the form before the conversational path is proven inverts the priority.

After Option A ships, the 3-paragraph → test draft loop works: Daniel opens `/aion` → sees setup chip → clicks it → types his style → Aion calls `save_voice_config` → onboarding state advances to `needs_test_draft` on next turn → Aion offers a draft chip → draft generates using saved voice.

One prerequisite to verify: the follow-up queue must have at least one entry for `draft_follow_up` to produce a real draft. If the queue is empty on first run, the `needs_test_draft` step should gracefully say so rather than failing silently.

## Next steps for Daniel

1. Read `src/app/api/aion/chat/route/prompts.ts:292` — the `buildGreeting` function. This is where the chip goes.
2. Update `buildGreeting`'s signature to accept `AionConfig` as an optional second parameter (it currently takes `onboardingState, userName, workspaceId, pageContext`).
3. In the `configured` case (line 340), check `config?.voice_default_derived === true` and push a setup chip: `{ label: 'Set up your voice', value: 'I want to describe how I actually talk to clients.' }`.
4. In `route.ts:126`, pass `aionConfig` to `buildGreeting()`.
5. Verify the follow-up queue has at least one entry in dev before testing the `needs_test_draft → draft` step. If empty, `draft_follow_up` in core.ts will need to handle no-queue gracefully.
6. Test the full loop: fresh workspace → setup chip → 3 paragraphs → `save_voice_config` fires → next turn offers draft chip → draft generates.

## References

- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting()`
- `src/app/api/aion/chat/route/prompts.ts:275` — `buildSystemPrompt()` onboarding injection
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty()`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft()`
