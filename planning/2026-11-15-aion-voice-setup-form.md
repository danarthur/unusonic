# Aion Phase A: Voice setup form + first draft preview

_Researched: 2026-11-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The queue question is significantly outdated.** It was written against the April 2026 primer state. The November 2026 codebase has built out nearly everything the question assumed was missing:

- **`aion_config` exists** on `public.workspaces`. It is fully typed as `AionConfig` with a `voice: AionVoiceConfig` field containing `description`, `example_message`, and `guardrails` strings. (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`)

- **`/api/aion/chat` is a full production route**, not the 16-line stub the primer described. It has auth, tier gating, kill-switch checks, tool assembly, rolling conversation summarization, and workspace snapshot injection. (`src/app/api/aion/chat/route.ts:59`)

- **`OnboardingState` machine is implemented**. Five states — `no_voice`, `no_example`, `no_guardrails`, `needs_test_draft`, `configured` — derived from `aion_config.voice` fields. (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`)

- **`/api/aion/draft-follow-up` is live** with auth guard, tier gate, and voice config injection via `generateFollowUpDraft`. (`src/app/api/aion/draft-follow-up/route.ts:21`)

- **Voice config flows into drafts**. `buildFollowUpPrompt` injects `voice.description`, `voice.example_message`, and `voice.guardrails` as a system-prompt block. (`src/app/api/aion/lib/generate-draft.ts:52`)

- **`AionInput.tsx`**, **`AionVoice.tsx`**, and **`ChatInterface.tsx`** are all fully wired.

**What is missing:**

`saveAionVoiceConfig` exists as a server action but nothing in the UI calls it directly. There is no form surface that presents the three voice fields to Daniel for direct input with a live draft preview.

The `voice_default_derived` bypass (`src/app/api/aion/lib/aion-config-helpers.ts:35`) means new workspaces auto-synthesize a voice from their workspace name and `getOnboardingState` immediately returns `configured`, so the 4-step chat-driven onboarding never fires. The only way back is "Tune Aion's voice" in the AionSidebar overflow, which is not discoverable without trying the chat first.

## Intended state

Daniel opens Aion, sees a lightweight "Set your voice" prompt (since `voice_default_derived === true` for his workspace), writes naturally in three labeled areas — how he describes his style, an example message, what to never do — and hits a preview button. A sample follow-up draft appears inline, using that voice config against a real or synthetic deal context. If it sounds right, he saves it. Done in under 5 minutes; Aion subsequently uses this for every draft-follow-up call.

## The gap

- No UI component calls `saveAionVoiceConfig` from a form surface
- No "preview a draft with this voice" affordance anywhere in the Aion UI
- `voice_default_derived === true` for new workspaces means the chat-driven onboarding never surfaces organically — the form is the only practical entry point
- `draft-follow-up` needs a deal context; new workspaces may have no deals, so the preview needs a fallback (mock context or first open deal)

## Options

### Option A: Freeform prose parser

- **What it is:** One textarea where Daniel pastes 3 paragraphs; a new `POST /api/aion/parse-voice-setup` route runs the prose through an LLM to extract `description`, `example_message`, and `guardrails`; saves via `updateAionConfigForWorkspace`; immediately calls `generateFollowUpDraft` with a mock context and returns the draft.
- **Effort:** Medium — new API route, LLM call in the happy path, parsing error handling, plus the form component.
- **Main risk:** LLM extraction is lossy. If Daniel writes abstractly ("I like to keep it short"), the extracted `guardrails` may be vague and not improve drafts meaningfully. No structured field-level feedback.
- **Unlocks:** Closest to the goal as literally described ("3 paragraphs"). No field-level guidance required.

### Option B: Structured form with live preview

- **What it is:** A `VoiceSetupPanel` component with three labeled textareas (`description`, `example_message`, `guardrails`) + a "Preview a draft" button. On preview: call `saveAionVoiceConfig` then `POST /api/aion/draft-follow-up` with the first open deal (or a hardcoded synthetic context if no deals exist). Render the draft inline. Surface the panel in the Aion landing area when `voice_default_derived === true`.
- **Effort:** Small — one new component, no new API routes, uses all existing server actions and routes.
- **Main risk:** Three separate fields can feel like a form rather than a conversation. If Daniel doesn't know what "guardrails" means, the field may stay empty.
- **Unlocks:** Every subsequent `draft-follow-up` call uses the saved voice. The form can double as the edit surface when Daniel wants to retune later.

### Option C: Fix the onboarding bypass

- **What it is:** Remove `voice_default_derived` as a bypass for the `no_voice` → `configured` machine. New workspaces with no stored voice get the chat-driven 4-step collection (Aion asks: how do you write to clients? → give me an example → any strict rules? → here's a test draft). The synthesized default becomes a fallback for the first draft only, not a permanent bypass.
- **Effort:** Small code change, medium behavioral change — requires verifying the 4-step forcing block is still properly written in the chat route and tested.
- **Main risk:** Breaking change for workspaces that have already bypassed onboarding and tuned via sidebar. Requires auditing the system-prompt onboarding block in the chat route to confirm it still fires correctly and collects via tools (there is no `save_voice` tool visible in `tools/index.ts` — may need verifying).
- **Unlocks:** Fully conversational onboarding, no new UI components. Voice gets richer over time via `learn-from-edit`.

## Recommendation

**Option B.** Build the structured form with live preview.

The three-field structure already matches how `generate-draft.ts` consumes voice config — a freeform parser (Option A) adds LLM extraction latency and failure modes for no real user benefit, since the labels can guide Daniel to write a short paragraph per field. Option C is tempting but the 4-step chat forcing block needs an audit before trusting it (no `save_voice` tool is visible in the tools index), and the conversational approach means Daniel can't see all three fields at once to refine them.

The panel should live in the Aion landing area (the empty-state block in `AionPageClient.tsx`) and trigger when `voice_default_derived === true`. On save, clear `voice_default_derived` from the config (a saved voice is explicit intent). For the preview, use `ops.deals` to find the first active deal — if there are none, use a hardcoded synthetic context (fictional deal with a first name, event date, and proposal total) with a note saying "preview uses a sample deal."

This ships in one focused session: one component, two server action calls, no new routes.

## Next steps for Daniel

1. Audit `src/app/api/aion/chat/tools/index.ts` — verify there is or isn't a `save_voice` tool. If there is, Option C becomes cheaper and may be worth revisiting; if not, Option B is unambiguously the right call.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPanel.tsx` — three labeled textareas (`description`, `example_message`, `guardrails`) + "Preview a draft" button. Call `saveAionVoiceConfig` then `POST /api/aion/draft-follow-up`.
3. Add a synthetic deal context fallback in the panel: when `ops.deals` returns empty, construct a `AionDealContext` stub with plausible values and pass it with a visible "sample deal" label.
4. Wire the panel into `src/app/(dashboard)/aion/AionPageClient.tsx` — render it in the landing state when `aionConfig.voice_default_derived === true`.
5. On successful save inside the panel, strip `voice_default_derived` from the config (call `saveAionVoiceConfig`, which already strips the flag at `aion-config-actions.ts:190`).
6. Smoke-test: open `/aion` on a fresh workspace, fill the form, hit preview, verify the draft references the voice description you wrote.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — existing preview endpoint
- `src/app/api/aion/lib/aion-config-helpers.ts:20` — `synthesizeDefaultVoice`, `voice_default_derived` bypass
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — `resetAionVoiceConfig` import (existing sidebar overflow affordance)
- `src/app/(dashboard)/aion/AionPageClient.tsx` — landing area mount point
