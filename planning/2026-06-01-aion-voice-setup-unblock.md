# Aion Phase A: Unblocking Voice Setup + First Real Draft

_Researched: 2026-06-01 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The planning primer is severely out of date.** The codebase has moved well past the "paused Brain tab + 16-line stub" state.

What exists today:

- `public.workspaces.aion_config` is a `Json` column, fully typed (`supabase.ts:7689`). The `AionConfig` type has `voice: { description, example_message, guardrails }`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived` (`aion-config-actions.ts:50–74`).

- The chat route is a production-grade 450-line handler at `src/app/api/aion/chat/route.ts` with auth, per-user rate limiting, tier gate, kill switch, session scope, rolling summarization, and streamed tool-calling via Anthropic/Claude.

- A 5-state onboarding machine lives in `aion-chat-types.ts:247–257`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `getOnboardingState` derives the current state from `aion_config`.

- `save_voice_config` tool at `core.ts:118` captures description, example, and guardrails conversationally and writes via `updateAionConfigForWorkspace`. `draft_follow_up` tool at `core.ts:318` generates a draft using `getDealContextForAion` + memory enrichment + playbook rules.

- `saveAionVoiceConfig` server action at `aion-config-actions.ts:178` accepts an `AionVoiceConfig` directly (description, example_message, guardrails) and does a clean config merge.

- `buildGreeting` at `prompts.ts:292` returns the right opening message for each onboarding state. The system prompt injects per-state instructions at `prompts.ts:275–283`.

**The hidden blocker.** `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35–45`) synthesizes a voice from the workspace name when `aion_config.voice?.description` is empty and injects `voice_default_derived: true`. `getOnboardingState` immediately returns `'configured'` when that flag is set (`aion-chat-types.ts:248`). This means **every new workspace silently skips the entire onboarding flow** and Aion starts with a generic synthesized voice, not Daniel's voice. The only re-entry point is "Tune Aion's voice" in the AionSidebar overflow, which calls `resetAionVoiceConfig` — a buried affordance that most owners will never find.

## Intended state

Daniel opens the Aion page, sees a clear invitation to teach Aion his voice, writes one rich message (or fills a short form) with his style, an example message, and his guardrails, and immediately receives a follow-up draft that sounds like him. After approving the draft, `onboarding_state = 'complete'` is set and Aion enters pull-mode (the greeting stops prompting about voice).

The infrastructure for this flow already exists. The missing piece is **discoverability** (new workspaces never hit the onboarding flow because of `voice_default_derived`) and **UX shape** (the conversational path is 4 back-and-forth turns, not one-shot).

## The gap

- New workspaces jump to `configured` via synthesized voice — Daniel never sees the onboarding prompts unless he hunts for "Tune Aion's voice" in an overflow menu.
- The conversational onboarding requires 4 separate chat turns before a draft appears. Daniel's stated goal is "write 3 paragraphs → see draft" (one shot).
- No visible form or UI card invites voice setup; the `saveAionVoiceConfig` server action exists but has no form surface.
- The `draft_follow_up` tool is wired and the `needs_test_draft` state does trigger it, but reaching that state through the chat flow is slow.

## Options

### Option A: Voice setup form in the Aion sidebar
- **What it is:** A three-field form (communication style, example message, guardrails) surfaced in the AionSidebar when `voice_default_derived === true` or triggered via the existing "Tune Aion's voice" overflow. On submit, calls `saveAionVoiceConfig`, then fires a synthetic chat turn that invokes `draft_follow_up` for the top-priority deal.
- **Effort:** Small. `saveAionVoiceConfig` already exists; form is ~80 lines of UI with three textareas and a submit button. The synthetic "draft for me" turn is a single message to the existing chat session.
- **Main risk:** Two paths to voice setup (form and conversational) that need to stay in sync. If the playbook capture flow later extends `AionVoiceConfig`, both paths need updating.
- **Unlocks:** The exact UX Daniel described. Works for first-time setup and re-tuning. Power users who know what they want bypass the 4-turn chat.

### Option B: Banner + prompt collapse (minimum viable path)
- **What it is:** Two changes. (1) When `voice_default_derived === true`, show a lobby card on the Aion page: "Aion is using a generic voice — teach it yours." One CTA calls `resetAionVoiceConfig` and sets focus to the chat input. (2) Update the `no_voice` system prompt to accept a long multi-field message: if Daniel's first message covers style + example + rules, the model should call `save_voice_config` with all three fields in one shot and immediately call `draft_follow_up`. No new form UI.
- **Effort:** Small. Banner component (~40 lines), one server action call on CTA, two sentences added to `buildSystemPrompt` for `no_voice` state at `prompts.ts:276`.
- **Main risk:** The model may not reliably extract all three fields from a single unstructured message. If it misses `guardrails`, the flow stalls at `no_guardrails` state instead of jumping to draft.
- **Unlocks:** Discoverability + a path to one-shot voice setup, all within the existing conversational UI. No new UI components.

### Option C: Remove the synthesized-default shortcut entirely
- **What it is:** Delete the `voice_default_derived` shortcut in `applyVoiceDefaultIfEmpty`. New workspaces always enter `no_voice` state and the onboarding chat fires naturally on first open.
- **Effort:** Tiny. One-line change in `aion-config-helpers.ts:39` (remove the early return) + remove the `voice_default_derived` check in `getOnboardingState`.
- **Main risk:** Worse first-run experience for workspaces that want to use Aion immediately without voice setup — they hit a 4-turn onboarding flow before getting any real utility. Also ignores the "3 paragraphs → draft" UX shape entirely.
- **Unlocks:** Every workspace hits the onboarding flow, so the existing infrastructure gets exercised. But the flow is still slow.

## Recommendation

**Option A.** The `saveAionVoiceConfig` server action is the only missing surface — and it already exists. A small form inside the sidebar (or triggered by "Tune Aion's voice") that surfaces the three fields lets Daniel write his paragraphs once, submit, and immediately see a draft. This is the exact UX goal and costs one small component.

Pair it with one element from Option B: add the lobby banner when `voice_default_derived === true`. Without it, Daniel still won't know to open voice setup. The banner is the discovery hook; the form is the fast-path UX. Together they add up to one small session.

Skip Option C. Removing the synthesized default makes first-run feel broken for workspaces that want to use Aion before they have voice preferences. The default is a reasonable safety net — just make it transparent.

Tradeoff accepted: two voice-setup entry points (form + conversational). The system prompt and server action are the single source of truth for what gets saved, so they won't drift.

## Next steps for Daniel

1. Add a banner component to the Aion lobby page (`src/app/(dashboard)/aion/AionPageClient.tsx`) — renders when `aionConfig.voice_default_derived === true`, CTA calls `resetAionVoiceConfig` then sets focus to the chat.
2. Create a `VoiceSetupPanel` component (~80 lines) inside `src/app/(dashboard)/(features)/aion/components/` with three textareas: communication style, example message, guardrails. Wire to `saveAionVoiceConfig`.
3. Surface `VoiceSetupPanel` via the existing "Tune Aion's voice" overflow in `AionSidebar.tsx` (replace/augment the current resetAionVoiceConfig call with an inline expansion or a modal).
4. After `saveAionVoiceConfig` resolves, trigger a synthetic chat message: `"Draft a follow-up for my top priority deal."` — this hits the existing `draft_follow_up` tool with no changes needed.
5. Smoke-test the full flow: new workspace → banner appears → fill form → submit → draft renders. Then "Tune Aion's voice" overflow → form opens → edit fields → submit → draft renders.
6. Optional: update `buildSystemPrompt` `no_voice` branch (`prompts.ts:276`) to add "If the user's first message is long and clearly covers their style, example, and rules, save all three in one `save_voice_config` call and immediately call `draft_follow_up`." This makes the conversational path faster too without breaking anything.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` — `applyVoiceDefaultIfEmpty` (the synthesized-default gate)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275–283` — onboarding system prompt injection
- `src/app/api/aion/chat/route/prompts.ts:292–338` — `buildGreeting` onboarding states
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318–` — `draft_follow_up` tool
- `src/types/supabase.ts:7689` — `aion_config` column on `public.workspaces`
