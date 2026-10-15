# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-10-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise is substantially outdated.** As of the current codebase (2026-10-15), Phase A is largely shipped:

- `public.workspaces.aion_config` **exists and is fully active**. `getAionConfig` / `saveAionVoiceConfig` / `getAionConfigForWorkspace` server actions are all live at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,178,106`.
- Voice config is fully typed: `AionVoiceConfig` with `description`, `example_message`, `guardrails` at `aion-config-actions.ts:12–16`.
- `/api/aion/draft-follow-up` is a production route with auth guard, tier gate, kill-switch check, and voice injection at `src/app/api/aion/draft-follow-up/route.ts`.
- The onboarding state machine (5 states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`) is implemented at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257`.
- Both `buildSystemPrompt` and `buildGreeting` handle all 5 states, including a `needs_test_draft` greeting that offers a chip to generate a test draft at `src/app/api/aion/chat/route/prompts.ts:290,338–347`.
- The "Brain tab" is now the `/aion` chat page — `AionPageClient.tsx` renders `ChatInterface` directly. No pause gate exists.
- `/api/aion/learn-from-edit` is live and extracts vocabulary from user draft edits at `src/app/api/aion/learn-from-edit/route.ts`.

**The one gap:** A Wk 11 §3.8 shortcut in `aion-config-helpers.ts:35–45` auto-synthesizes a default voice from the workspace name on every first read, setting `voice_default_derived=true`. `getOnboardingState` treats this as `'configured'` (`aion-chat-types.ts:248`), so the 4-step chat onboarding is silently bypassed for all new workspaces. The only entry point to explicit voice setup is the **sidebar overflow → "Tune Aion's voice"** (`AionSidebar.tsx:975–977`), which calls `resetAionVoiceConfig` and re-enters the `no_voice` state.

## Intended state

Daniel opens the Aion page, sees a clear "set up your voice" invitation (not buried in a sidebar overflow), writes his 3-paragraph description in a single interaction, and immediately sees a draft follow-up from one of his active deals — so he can judge whether Aion has it right before moving on.

The chat infrastructure to deliver this draft already exists. What's missing is the **discovery path** (no CTA for `voice_default_derived` workspaces) and the **form UX** (3 chat turns vs. 3 paragraphs at once).

## The gap

- No visible CTA for voice setup — hidden behind sidebar overflow, invisible to new users.
- Voice setup is 3 separate chat turns (description → example → guardrails), not a single free-form submission.
- `needs_test_draft` greeting requires clicking a chip to generate the draft — not automatic.
- No auto-dispatch mechanism after voice is saved to trigger a draft immediately.

## Options

### Option A: Add a voice setup CTA in the Aion chat landing state

- **What it is:** Add a new `OnboardingState` value `'configured_default'` (when `voice_default_derived=true`). Update `buildGreeting` to return a prominent inline CTA — "You're using a default voice. Personalize it so Aion matches how you write." — with a "Set up voice" button. The button calls `resetAionVoiceConfig` client-side; the next chat init returns `no_voice` and the existing 3-turn flow runs. Separately, modify `needs_test_draft` to auto-dispatch the top-priority draft without requiring a chip click.
- **Effort:** Small (1 day — 2 files: `aion-chat-types.ts`, `prompts.ts`; 1 new button action in message renderer; 1 handler in `SessionContext`).
- **Main risk:** The 3-turn chat setup still takes 3 message exchanges — the "3 paragraphs at once" feeling isn't there.
- **Unlocks:** Discovery + auto draft at end of setup.

### Option B: Voice setup form in the Aion chat input area (drawer/sheet)

- **What it is:** Add a "Set up voice" icon button near `AionInput`. On click, a slide-up sheet opens with 3 labelled textareas (describe your style, paste an example message, list any rules). Submit calls `saveAionVoiceConfig` (clearing `voice_default_derived`), then dispatches a synthetic chat message that triggers the `draft_follow_up` tool on the top-priority deal. The draft streams back into the chat as a normal response.
- **Effort:** Medium (2 days — new drawer component, wire to existing `saveAionVoiceConfig` server action + synthetic message dispatch in `SessionContext`).
- **Main risk:** Slightly more UI complexity; needs design care to not conflict with Stage Engineering surface rules.
- **Unlocks:** True "write 3 paragraphs → see a draft immediately" in a single interaction — exactly what the question describes.

### Option C: Voice setup page at `/settings/aion/voice`

- **What it is:** A dedicated settings route with the 3-field form, a "Generate test draft" button that calls `/api/aion/draft-follow-up` with the top queued deal, and an inline result preview.
- **Effort:** Medium (2 days — new route, server component for deal context, client form).
- **Main risk:** Splits the draft experience from the workspace it applies to. Owners set voice in settings, but the draft preview context is detached from the live deal flow.
- **Unlocks:** Cleanest standalone path, but less integrated with actual work.

## Recommendation

**Ship Option B.** Option A is tempting as a small diff, but the 3-turn chat setup is a real friction point for the described goal — Daniel wants to write his style once, not have a conversation about it. Option B delivers the exact UX: 3 textareas, one submit, immediate draft.

The infrastructure already exists. `saveAionVoiceConfig` is a single server-action call. `/api/aion/draft-follow-up` accepts a `workspaceId` + `AionDealContext` (use the top item from `ops.follow_up_queue`). The only new code is: (1) the drawer UI component, (2) a `getTopQueuedDeal` helper to fetch the follow-up context, and (3) a synthetic message dispatch in `SessionContext` that fires after the form saves.

The tradeoff you're accepting: the drawer adds one more UI surface to the chat page. That's justified because it solves a real discovery + friction problem that currently makes the whole voice system invisible.

## Next steps for Daniel

1. Add `'configured_default'` to `OnboardingState` in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` and update `getOnboardingState` to return it when `voice_default_derived === true` (instead of `'configured'`).
2. Add a `buildGreeting` case for `'configured_default'` in `src/app/api/aion/chat/route/prompts.ts:309` that returns a message with a `set_up_voice` CTA chip.
3. In `AionInput.tsx` or `ChatInterface`, add a "Set up voice" button (visible only when onboarding state is `configured_default`) that opens the drawer.
4. Build `VoiceSetupDrawer` — 3 textareas, submit calls `saveAionVoiceConfig`, on success fetches top queued deal and dispatches a synthetic `"Draft a test follow-up for my top priority deal."` message via `sendChatMessage`.
5. Verify the `draft_follow_up` tool in the chat route can handle the synthetic message and stream back a draft. (It already can — this is the existing `needs_test_draft` chip flow.)
6. Test with a workspace that has `voice_default_derived=true` and at least one deal in `ops.follow_up_queue`.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:284–347` — onboarding handling in system prompt + greeting
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–100` — voice config types and read/write actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` — default voice synthesis (the bypass)
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint, already wired
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–977` — current "Tune Aion's voice" entry point (too buried)
- `src/app/api/aion/learn-from-edit/route.ts` — vocabulary learning from edits (Phase A complement, already live)
