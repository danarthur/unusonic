# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-10-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: The primer's description of the current state is outdated. The actual state is materially different — see Current state below. This doc answers the real question: what blocks the stated goal today?_

## Current state

The infrastructure is further along than the primer indicates.

**`public.workspaces.aion_config` exists.** `getAionConfig` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads a JSONB column on `public.workspaces`. The `AionConfig` type has `voice?: AionVoiceConfig` with `description`, `example_message`, and `guardrails` fields.

**The Brain tab is live.** `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `<ChatInterface viewState="chat">` — no pause gate, no placeholder. The full chat interface is running at `/aion`.

**The 4-step voice onboarding flow is fully implemented in the chat route.** `getOnboardingState` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` returns `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting` at `src/app/api/aion/chat/route/prompts.ts:302` serves a distinct opening prompt for each state. `buildSystemPrompt` at `src/app/api/aion/chat/route/prompts.ts:284` injects ONBOARDING instructions per state.

**Voice is already injected into draft generation.** `src/app/api/aion/draft-follow-up/route.ts:53` loads `aionConfig.voice` and passes it to `generateFollowUpDraft`. `src/app/api/aion/lib/generate-draft.ts:63` injects `description`, `example_message`, and `guardrails` into the system prompt under a "How This Company Communicates" block.

**The blocking issue: `synthesizeDefaultVoice` short-circuits onboarding for every workspace.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` (`applyVoiceDefaultIfEmpty`) synthesizes a voice from the workspace name whenever `config.voice.description` is empty and sets `voice_default_derived: true`. `getOnboardingState` at line 248 checks `voice_default_derived === true` and returns `configured` immediately — bypassing all four onboarding steps. A new workspace, or one that hasn't explicitly set a voice, **never hits the `no_voice` greeting or the 4-step tuning conversation.**

**The "Tune Aion's voice" escape hatch exists but requires manual discovery.** `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` wires `handleTuneVoice` → `resetAionVoiceConfig()` → clears `voice` and `voice_default_derived` → next chat re-enters `no_voice`. It lives in a sidebar overflow menu, not on the landing screen.

## Intended state

Daniel opens `/aion` on a fresh (or explicitly reset) workspace, sees a warm prompt asking how he talks to clients, types 3 paragraphs, and the chat walks through the 4-step flow (style → example → guardrails → test draft). At the end of step 4, Aion generates a draft against a real deal that sounds like Daniel — not the generic synthesized default.

The 4-step chat onboarding exists and is instrumented. The draft generation end-to-end is wired. The gap is purely about whether a user ever lands in a state that triggers those flows.

## The gap

- New workspaces get `voice_default_derived: true` immediately. The 4-step flow never fires.
- The only re-entry to the flow is the sidebar overflow menu ("Tune Aion's voice"), which most users will never find proactively.
- There is no first-visit surface that says "Aion is using a default voice — want to personalize it?" before the user starts chatting.
- The chat greeting for `configured` state (warm line + chips) gives no signal that a default voice is in use vs. a personalized one.

## Options

### Option A: Surface a first-visit banner in the chat landing state

- **What it is:** When `voice_default_derived === true` (i.e. the voice was synthesized, not set by the user), render a non-blocking banner in the chat interface ("Aion is using a default voice for your workspace. Teach it how you communicate for better drafts.") with a single CTA that calls `resetAionVoiceConfig()` and re-enters the 4-step onboarding flow.
- **Effort:** Small. One new banner component in `ChatInterface` or `AionSidebar`, reading `voice_default_derived` from the server-rendered config.
- **Main risk:** Banner fatigue if the user has already typed into the chat and finds the banner re-appears. Needs a dismiss-and-not-re-show path (localStorage flag or `onboarding_state` field).
- **Unlocks:** The 4-step flow fires from a visible prompt. No architectural changes needed. Draft quality improves immediately once voice is set.

### Option B: Remove the voice synthesis bypass for owners on first visit

- **What it is:** Change `applyVoiceDefaultIfEmpty` so it does NOT set `voice_default_derived: true` for the first 72 hours of a workspace's life (or until the owner has completed at least one chat turn). The synthesized voice is applied only as a silent fallback for draft generation, but the onboarding state still advances through the 4-step chat flow.
- **Effort:** Medium. Requires a `created_at`-based or `first_chat_at` gate, a migration to add that flag if needed, and careful testing of the `voice_default_derived` path (search, aion card, draft all depend on it).
- **Main risk:** Breaks the clean "Wk 11 §3.8 — bypass for existing workspaces" intent. New workspaces see the 4-step flow on every fresh session until they complete it, which could feel forced if they want to skip straight to using the product.
- **Unlocks:** The flow fires automatically for new workspaces without any user action. Cleaner for a guided onboarding sequence.

### Option C: Add a voice-status affordance to the Aion greeting chips

- **What it is:** When `voice_default_derived === true`, include a chip in the greeting chip row — "Teach Aion your voice" — that dispatches `resetAionVoiceConfig()` inline and immediately enters the `no_voice` conversation. No separate banner, no architecture change.
- **Effort:** Small. One conditional chip in `src/app/api/aion/lib/greeting-chips.ts` reading the `voice_default_derived` flag from the server config passed to the greeting builder.
- **Main risk:** The chip row is already capability-teaching ("Draft a follow-up", "Summarize pipeline"). Adding a setup chip mixes two registers. If the user clicks it by accident mid-session, they interrupt their current use.
- **Unlocks:** Discovery path exists without blocking the greeting or adding a new UI element. Reversible and unobtrusive.

## Recommendation

**Option A.** Ship a first-visit banner.

The 4-step chat flow is already correct and complete. The draft pipeline is already using voice. The only gap is that Daniel never lands in a state where those flows trigger. A banner solves this directly: it appears exactly when `voice_default_derived === true`, is dismissable, and makes the re-entry action one tap rather than a sidebar hunt.

Option C is tempting for its minimal footprint, but the chip row is already at its design limit (3 chips) and mixing a setup action into capability-teaching chips muddies the pattern.

Option B is the right long-term architecture if onboarding needs to be gated, but it risks breaking the "existing workspaces don't get forced re-onboarding" invariant that Wk 11 §3.8 established for good reason.

The tradeoff accepted with A: the banner is a soft interrupt, and a small percentage of users will dismiss it without ever setting their voice. That's fine — the synthesized default is a working fallback, and the re-entry path via the sidebar overflow remains available.

## Next steps for Daniel

1. Read `synthesizeDefaultVoice` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` and `getOnboardingState` in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` to confirm the bypass logic.
2. In `ChatInterface` (or the top-level `/aion` page server component), read `aionConfig.voice_default_derived` from the server-rendered config.
3. Render a new `VoiceSetupBanner` component when `voice_default_derived === true` and no dismiss flag is stored. CTA calls `resetAionVoiceConfig()` then `router.refresh()`.
4. After the reset, the next greeting will be the `no_voice` cold-open at `src/app/api/aion/chat/route/prompts.ts:310`. Walk through the 4-step flow yourself to confirm voice saves correctly (check `aion_config.voice` in Supabase Studio after).
5. Confirm the draft test in step 4 (`needs_test_draft`) calls `draft_follow_up` and renders a `draft_preview` content block — that is the first real draft.
6. Optional: after completing voice setup, check `src/app/api/aion/lib/tone-anchoring.ts:60` — if there are outbound messages in `ops.messages`, those will also contribute to the draft preamble independently of the voice config.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, `OnboardingState` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding state injection in system prompt; `:302` — `buildGreeting` per state
- `src/app/api/aion/draft-follow-up/route.ts:53` — voice loading in draft endpoint
- `src/app/api/aion/lib/generate-draft.ts:63` — voice injection into `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` — existing "Tune Aion's voice" escape hatch
- `src/app/(dashboard)/aion/AionPageClient.tsx:66` — Brain tab renders live ChatInterface
