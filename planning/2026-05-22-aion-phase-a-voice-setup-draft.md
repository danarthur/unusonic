# Aion Phase A: voice setup + first real draft

_Researched: 2026-05-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note:** the two premises in this question are outdated. Both blockers are already resolved — see Current State below. The research below re-scopes to what's actually next.

## Current state

**`aion_config` exists.** `src/types/supabase.ts:7689` shows `aion_config: Json` as a live column on `workspaces`. The actions layer reads it via `getAionConfig()` (`aion-config-actions.ts:84`) and writes it via `saveAionVoiceConfig()` (`aion-config-actions.ts:178`). The typed shape (`AionConfig`) lives at `aion-config-actions.ts:50–74` and includes `voice`, `voice_default_derived`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

**Voice onboarding is wired into the chat route.** On every cold-open, `/api/aion/chat/route.ts:122` calls `getOnboardingState(aionConfig)`, which returns one of: `no_voice`, `no_example`, `no_guardrails`, `needs_test_draft`, or `configured` (`aion-chat-types.ts:247–257`). The greeting builder at `prompts.ts:300–338` emits the appropriate message + chips for each state. The system prompt at `prompts.ts:275–283` instructs the model to collect the missing field and call `save_voice_config`.

**`save_voice_config` tool is live.** `chat/tools/core.ts:118–144` defines the tool: it writes description, example_message, and guardrails, and sets `onboarding_state: 'complete'` when `onboarding_complete: true` is passed.

**`draft_follow_up` tool is live.** `chat/tools/core.ts:318–394` assembles `AionDealContext` via `getDealContextForAion()` (`follow-up-actions.ts:545`), enriches it with semantic memory and entity-scoped facts from `cortex.aion_memory`, applies playbook channel rules, and calls the draft generator with the workspace voice config baked in.

**"Brain Mode is paused" text is gone.** A grep of `src/` finds no such string. The Aion surface (`/aion`) is the unified entry point and is active.

**`QueuePreviewCard` exists** at `aion/components/QueuePreviewCard.tsx`. It renders deal rows with Draft / Skip buttons that call `sendChatMessage()`. Whether it surfaces in the configured-workspace greeting is not fully confirmed — `prompts.ts:340–432` shows the configured greeting runs in "pull mode" and `QueuePreviewCard` is a render-tool response type, not a greeting injection.

## Intended state

A workspace owner opens `/aion`, writes 3 paragraphs about how they talk to clients, and immediately gets a voice-respecting follow-up draft for a real deal. Per the onboarding flow, "immediately" means: one exchange for description, one for example, one for guardrails, then a test draft before `onboarding_state` is set to `complete`.

The end state is also a settings-visible voice config that owners can inspect and edit without re-entering conversational onboarding.

## The gap

- The conversational onboarding path (chat-driven) is fully functional today.
- `AionSettingsView` (`settings/aion/AionSettingsView.tsx`) manages consent and the kill switch only — there is no form to read or edit the 3 voice fields directly. An owner who wants to retune must use the sidebar "Tune Aion's voice" affordance or start a fresh chat session.
- The "Tune Aion's voice" sidebar entrypoint exists (referenced in `aion-chat-types.ts:245`) but the settings page doesn't surface the current configured values, so owners can't see what Aion has on file.
- Legacy renames not yet done: `SIGNAL_SPRING_DURATION_MS` (`motion-constants.ts:116`), `ION_SYSTEM` / `ION_FULL_SYSTEM` (`package-generator.ts:22,102`).

## Options

### Option A: Voice config inspector in settings

- **What it is:** Add a read-only (then editable) panel in `/settings/aion` that shows the three voice fields using `getAionConfig()`. A "Retune in Aion" button opens `/aion` and calls `resetAionVoiceConfig()`. Later, make the fields inline-editable via `saveAionVoiceConfig()`.
- **Effort:** Small — no new backend, no new routes. Pure UI addition to `AionSettingsView.tsx`.
- **Main risk:** Voice config can be long freeform text; the settings panel needs to handle multiline gracefully.
- **Unlocks:** Owners can audit and correct what Aion has on file without starting a new chat session. Reduces support burden when voice drifts.

### Option B: Surface QueuePreviewCard in configured greeting

- **What it is:** Inject the top 3 follow-up queue items into the configured-workspace cold-open greeting so the first thing an owner sees is "here are your pending follow-ups, want a draft?" Wire the Draft button to trigger `draft_follow_up` via the chat tool rather than just sending a text message.
- **Effort:** Medium — requires changing `buildGreeting` at `prompts.ts:340` to fetch the queue server-side and return a `queue_preview` message type, then confirming `QueuePreviewCard` renders it.
- **Main risk:** Adds latency to the cold-open greeting (one extra DB read). Need to handle empty queue gracefully.
- **Unlocks:** Configured workspaces get immediate value on every open — not just a warm greeting but an actionable queue.

### Option C: Legacy rename pass (ION / SIGNAL constants)

- **What it is:** Rename `ION_SYSTEM`, `ION_FULL_SYSTEM` in `package-generator.ts` and `SIGNAL_SPRING_DURATION_MS` in `motion-constants.ts` to their Unusonic/Aion equivalents.
- **Effort:** Small — 3 constant renames + grep for any callers.
- **Main risk:** Near-zero. These are module-internal constants with no external API surface.
- **Unlocks:** Brand consistency; eliminates the last known ION/SIGNAL residuals in active code.

## Recommendation

**Ship Option A first.** The conversational onboarding is fully functional, so the Phase A goal from the queue is already achievable — Daniel can open `/aion` today and go through the 4-step voice setup. The real gap is observability: owners have no way to see what voice config Aion is using without reading the chat history. A simple read panel in `/settings/aion` (3 text fields, read-only initially, with a "Retune" link) takes under 2 hours and gives Daniel and future workspace owners confidence in what the AI has on file.

Option B is the right next feature after that — surfacing the queue in the configured greeting closes the "what do I do next" loop for returning users. Option C is a 15-minute cleanup that should run in parallel as a standalone commit.

The doc referenced in the queue (`docs/reference/follow-up-engine-design.md` section 26) is gitignored and wasn't available for this research. If that section describes something not yet built, it should be added as a new queue item with the relevant excerpt pasted in.

## Next steps for Daniel

1. **Confirm Phase A is done:** open `/aion` on a workspace with no voice config, verify the 4-step onboarding fires and produces a draft. If it does, mark Phase A complete.
2. **Add voice inspector to settings:** edit `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — call `getAionConfig()` server-side in the page, pass the `voice` field as a prop, render 3 read-only `<pre>` blocks (description, example, guardrails).
3. **Add "Retune in Aion" button:** button calls `resetAionVoiceConfig()` and `router.push('/aion')` — resets `voice_default_derived` so the next chat open runs onboarding again.
4. **Legacy rename pass:** rename `ION_SYSTEM`/`ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts` and `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts`.
5. **Queue follow-on question:** add "Wire QueuePreviewCard into configured-workspace cold-open greeting" to `planning-queue.md` with a note to check `prompts.ts:340` and confirm queue fetch latency is acceptable.
6. **Paste section 26 excerpt:** if `docs/reference/follow-up-engine-design.md` §26 describes a Phase A item not yet built, add it to `planning-queue.md` with the relevant paragraph so the agent can research it.

## References

- `src/types/supabase.ts:7689` — `aion_config` column on workspaces
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74, 84, 178` — AionConfig type, getAionConfig, saveAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — getOnboardingState, OnboardingState
- `src/app/api/aion/chat/route.ts:122` — onboarding state read on cold-open
- `src/app/api/aion/chat/route/prompts.ts:275–338` — system prompt + greeting builder per onboarding state
- `src/app/api/aion/chat/tools/core.ts:118–144, 318–394` — save_voice_config and draft_follow_up tools
- `src/app/(dashboard)/(features)/aion/components/QueuePreviewCard.tsx` — queue render card
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings UI (consent + kill switch only)
- `src/features/ai/tools/package-generator.ts:22,102` — ION_SYSTEM / ION_FULL_SYSTEM (legacy names)
- `src/shared/lib/motion-constants.ts:116` — SIGNAL_SPRING_DURATION_MS (legacy name)
