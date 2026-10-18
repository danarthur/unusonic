# Aion voice setup: discoverability + first real draft

_Researched: 2026-08-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise is outdated — both blockers from April 2026 have since been resolved.

**`aion_config` exists and is fully wired.** `public.workspaces.aion_config` is a JSONB column storing `{ voice, learned, follow_up_playbook, onboarding_state, kill_switch, voice_default_derived }`. `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads it; `saveAionVoiceConfig()` at line 178 writes it. `AionVoiceConfig` has three fields: `description`, `example_message`, `guardrails`.

**The conversational onboarding flow is built.** A 5-state machine at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route injects onboarding instructions into the system prompt at `src/app/api/aion/chat/route/prompts.ts:275`, and `buildGreeting` at line 292 dispatches the right opening message for each state with suggestion chips.

**`/api/aion/draft-follow-up` is operational.** It auth-gates, tier-gates, reads voice config, and calls `generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:26`. Voice fields are injected into the system prompt and respected.

**The "Brain tab" concept was never built as a separate surface.** The Aion chat at `/aion` (with `ChatInterface` and `viewState='chat'`) replaced it. There is no `viewState='brain'`.

**The onboarding flow is bypassed by default.** `applyVoiceDefaultIfEmpty` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a default voice from the workspace name on every config read when no explicit voice is stored, setting `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` immediately returns `'configured'` when `voice_default_derived === true` — the 4-step onboarding chat flow never fires for new workspaces.

**The only discoverability path is buried.** The sidebar overflow at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` shows "Tune Aion's voice," which calls `resetAionVoiceConfig()` to clear the synthesized flag and re-enter the `no_voice` state. It is invisible unless you know to look.

## Intended state

Daniel opens Aion, describes how he communicates with clients, and immediately sees a real follow-up draft that sounds like him — not a generic synthesized default. The voice setup path should be a one-session loop: input communication style → see a draft → confirm it sounds right. The `save_voice_config` chat tool (`core.ts:118`) and the draft generation pipeline are already plumbed end-to-end; the flow just needs to be surfaced.

## The gap

- All new workspaces receive a synthesized default voice (`voice_default_derived: true`) and skip onboarding entirely.
- No visible prompt tells an owner that Aion is using a default voice, not their actual style.
- The "Tune Aion's voice" entry point is in a settings overflow — not on the primary chat surface.
- The `needs_test_draft` greeting offers a "Yes, try one" chip — one more turn before seeing a draft. The draft is not generated automatically at the end of onboarding.

## Options

### Option A: Voice-derived banner on the Aion landing
- **What it is:** A one-line inline notice rendered on the `/aion` page when `voice_default_derived === true`. Copy: "Aion is using a default voice. [Tune it to match how you write]." The CTA calls `resetAionVoiceConfig()` (already exists) and starts a new chat — which opens in `no_voice` state and begins the conversational onboarding.
- **Effort:** Small — a ~50-line client component, wired into `AionPageClient.tsx`. No new API surface.
- **Main risk:** Owners who deliberately accepted the default voice will see a persistent banner. Needs a dismiss action that writes `voice_explicit_confirmed: true` into `aion_config` to suppress it permanently.
- **Unlocks:** The onboarding flow becomes discoverable without any UX model change.

### Option B: Auto-draft on `needs_test_draft` greeting
- **What it is:** Modify `buildGreeting` in `prompts.ts` so the `needs_test_draft` state fetches the top follow-up queue item server-side and includes a pre-generated draft inline — instead of offering a "Yes, try one" chip that requires an extra round-trip.
- **Effort:** Small-medium — `buildGreeting` becomes async, fetches `getFollowUpQueue(workspaceId, limit=1)`, calls `generateFollowUpDraft`, and includes the result in the greeting response.
- **Main risk:** If the workspace has zero active deals in the follow-up queue, the draft cannot be generated. Needs a graceful fallback ("No active follow-ups yet — your voice is saved, I'll draft the moment one comes in").
- **Unlocks:** Collapses the last step: voice configured → draft appears in the same session without another chip interaction.

### Option C: One-shot voice-setup form (form-first UX)
- **What it is:** A `VoiceSetupCard` component rendered above the chat input when `voice_default_derived === true`. Three text areas: communication style, example message, rules/guardrails. On submit: calls `saveAionVoiceConfig()`, then immediately POSTs to `/api/aion/draft-follow-up` for the top follow-up queue item, and renders the draft result inline.
- **Effort:** Medium — new component (~120 lines), a new Server Action or route handler that chains voice-save + draft-generation, error handling for no-queue state.
- **Main risk:** Diverges from the chat-first model. Two paradigms (form + chat) for the same thing. Also requires an active follow-up queue item like Option B.
- **Unlocks:** Literally the "3 paragraphs → immediate draft" flow described in the question.

## Recommendation

Ship Option A and B together — they are independent, each is small, and together they deliver the intended loop without architectural disruption.

Option A gives discoverability: owners see that Aion is using a default voice and have a one-click path to tune it. Option B removes the final friction point: once voice is configured through the conversational flow, the first real draft appears in the same chat session automatically.

Option C is the closest match to the literal "3 paragraphs → draft" description, but it adds a second input paradigm to a surface that already has a working conversational one. The chat flow took significant investment to build; a form that duplicates it adds maintenance surface. The right call is to surface what's already there, not build a parallel path.

One thing to resolve before shipping B: whether Daniel's workspace has any active follow-up queue items. If it doesn't, the auto-draft fallback message ("your voice is saved, I'll draft the moment one comes in") is the visible result — which is still correct behavior, just less instantly gratifying.

## Next steps for Daniel

1. Add `voice_explicit_confirmed?: boolean` to `AionConfig` type in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceDerivedBanner.tsx` — a client component that reads `voice_default_derived` from props and renders the dismiss-able notice. Wire into `AionPageClient.tsx`.
3. Modify `saveAionVoiceConfig()` to set `voice_explicit_confirmed: true` and clear `voice_default_derived`; modify `resetAionVoiceConfig()` to also clear `voice_explicit_confirmed`.
4. Make `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts:292` async; for `needs_test_draft`, fetch `getFollowUpQueue(workspaceId, 1)` and call `generateFollowUpDraft` if a follow-up exists — include the draft in the `messages` array.
5. Add a `voice_default_derived` read to the Aion page server component (`src/app/(dashboard)/aion/page.tsx`) and pass it to `AionPageClient`.
6. Test the loop manually: trigger "Tune Aion's voice," complete onboarding, confirm the draft appears in the same session.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:275,292` — onboarding system-prompt injection + greeting dispatch
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` in-chat tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route (fully operational)
- `src/app/api/aion/lib/generate-draft.ts:26` — `generateFollowUpDraft`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow (current entry point)
