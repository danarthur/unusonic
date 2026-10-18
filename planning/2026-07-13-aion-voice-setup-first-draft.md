# Aion voice setup + first real draft: minimum path

_Researched: 2026-07-13 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The planning-primer snapshot (2026-04-10) is now materially outdated. Several premises in the question no longer hold.

**`aion_config` already exists.** Migration `20260407140000_aion_voice_foundation.sql` added `aion_config jsonb NOT NULL DEFAULT '{}'` to `public.workspaces`. The type is `AionConfig` in `aion-config-actions.ts:50`, with a `voice: AionVoiceConfig` key (`description`, `example_message`, `guardrails`). `saveAionVoiceConfig()` and `resetAionVoiceConfig()` server actions are at lines 178 and 214 of that file.

**Voice is already injected into drafts.** `generate-draft.ts:63-74` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the follow-up system prompt. The chat route's `buildSystemPrompt()` in `prompts.ts:89-91` does the same for the conversational context.

**The chat route is a full tool-calling agent.** `/api/aion/chat/route.ts` is not a stub — it is a 450-line streaming route with auth, rate limiting, tier gating, onboarding state machine, `save_voice_config` tool (core.ts:118), and `draft_follow_up` tool (core.ts:318). `draft_follow_up` calls `getDealContextForAion()`, fetches entity memories, and calls `generateFollowUpDraft()`. Everything is wired.

**But the 4-step chat onboarding is bypassed for every new user.** `aion-config-helpers.ts:35-44` — `applyVoiceDefaultIfEmpty()` synthesizes a voice from the workspace name and sets `voice_default_derived: true` on every read where no voice is stored. `getOnboardingState()` in `aion-chat-types.ts:248` short-circuits to `'configured'` when that flag is true. So the chat route's onboarding instructions in `prompts.ts:275-282` never fire for new workspaces.

**There is no Brain tab and no voice setup form.** `/aion` renders only `ChatInterface` (`AionPageClient.tsx:73`). `/settings/aion` (`AionSettingsView.tsx`) covers consent and cadence toggle, not voice. The only voice affordance is an overflow menu item in `AionSidebar.tsx:975` ("Tune Aion's voice") that calls `resetAionVoiceConfig()` to re-enter the chat-driven 4-step flow — but it is hidden behind two clicks and produces no immediate draft.

**`ArthurInput.tsx` is gone.** Not present in the working tree. The primer listed it as a delete candidate; it was deleted.

## Intended state

Daniel opens a surface, writes how he talks to clients (tone, example, guardrails), saves, and immediately sees an Aion-generated follow-up draft for a real deal that sounds like him. The draft is the proof that the config works. Subsequent drafts — from the Follow-Up Card or by asking Aion in chat — are consistent without any further setup.

## The gap

- No voice setup UI form exists. The only path to voice setup is "Tune Aion's voice" in the sidebar overflow, which re-enters the 4-step chat interview (slow, manual, easy to abandon).
- The synthesized default (`voice_default_derived`) silently blocks the chat-driven onboarding for all new workspaces. Owners who never click "Tune Aion's voice" have a generic voice they never knowingly chose.
- After writing voice config (via any method), there is no mechanism to immediately surface a draft. The user must navigate to a deal's Follow-Up Card and click "Draft," or type "draft a follow-up for [deal]" in chat.
- No `?prompt=` URL param exists to pre-fill a chat turn from a settings redirect.

## Options

### Option A: Two-line change to re-enable chat onboarding, no new UI

- **What it is:** Remove the `voice_default_derived` bypass in `aion-config-helpers.ts:39` (or make it only fire for non-owner roles). New owners who open `/aion` enter the 4-step interview immediately. After guardrails are saved, the existing `needs_test_draft` prompt (`prompts.ts:282`) already tells Aion to call `draft_follow_up`. Change the `no_voice` prompt (`prompts.ts:276`) to invite a free-form paragraph instead of a single question: "Tell me as much or as little as you want about how you communicate with clients."
- **Effort:** Small (2–4 lines changed, no new components)
- **Main risk:** All first-time owners see an onboarding chat on first `/aion` load; if no deals are in the queue, the test draft step fails with "No deals in the follow-up queue."
- **Unlocks:** The "write → see draft" flow with zero new UI. Voice setup becomes a chat conversation, not a form.

### Option B: Voice setup form in `/settings/aion` + redirect to chat

- **What it is:** Add a "Voice" section to `AionSettingsView.tsx` — three labeled textareas (`description`, `example_message`, `guardrails`) that call `saveAionVoiceConfig()` on submit. After a successful save, redirect to `/aion` with a `?prompt=Draft+a+follow-up+for+my+top+deal` URL param. Wire `AionPageClient.tsx` to dispatch that param as the first user message (same pattern as `?openPin=`).
- **Effort:** Medium (new form section ~80 lines, one new URL param handler in `AionPageClient.tsx`)
- **Main risk:** If no deals are in `ops.follow_up_queue`, Aion returns "No deals in the follow-up queue" — visible immediately after redirect. Could feel broken for a fresh workspace.
- **Unlocks:** The exact "write 3 paragraphs → immediately see draft" flow the question describes. Form is explicit; user knows what they set.

### Option C: "Brain" panel in the Aion sidebar

- **What it is:** Add a slide-in panel accessible from the AionSidebar that shows the current voice config as editable textareas. Save button calls `saveAionVoiceConfig()` and then auto-sends a synthetic `draft_follow_up` request into the active chat session via `sendChatMessage`.
- **Effort:** Large (new panel component, panel state in sidebar, sending synthetic message from a panel context)
- **Main risk:** Most complex; needs careful state threading between panel and chat session. The Brain tab concept is a larger design investment.
- **Unlocks:** The closest match to the "Brain tab" framing in the question. Voice config and live Aion chat co-exist on one surface.

## Recommendation

**Ship Option A first, then Option B.** Option A is two file changes that unblock the full end-to-end flow right now using existing infrastructure. The chat-driven onboarding already works — it just needs the bypass removed. It will let Daniel type naturally ("I write short, blunt texts to wedding clients and longer emails to corporate buyers — I always end with a specific next step, never a vague 'let me know'") and have Aion extract the structure, save it, and immediately draft.

The risk (empty queue) is real but manageable: guard the `draft_follow_up` step in the `needs_test_draft` prompt instruction so that if the queue is empty, Aion asks Daniel to name a deal by title instead.

Option B is the right follow-on once there are 3+ real users: a form gives power users direct control and is faster to iterate on than a conversation. But for Daniel testing solo, the chat path is good enough and takes 20 minutes to ship.

Option C is a sprint of its own. Park it.

## Next steps for Daniel

1. **In `aion-config-helpers.ts:35-44`** — add a role or flag guard to `applyVoiceDefaultIfEmpty`. Simplest: rename the bypass to only fire for non-owner sessions, or just delete the `voice_default_derived` path entirely and let owners always start at `no_voice`.
2. **In `prompts.ts:276`** — change the `no_voice` onboarding instruction from "Ask about communication style" to "Invite the user to write as much or as little as they want — one sentence to three paragraphs. Save everything at once via `save_voice_config` rather than asking follow-up questions."
3. **In `prompts.ts:281-282`** — update `needs_test_draft` to add a fallback: "If the queue is empty, ask the user to name a deal title and call `draft_follow_up` with the result of `lookup_historical_deals` for that title."
4. **Smoke test:** open `/aion` in an incognito tab (fresh session), confirm Aion asks about your voice. Paste a paragraph about how you write. Confirm `save_voice_config` fires and voice appears in `aion_config` on the workspace row.
5. **Ask Aion in chat:** "Draft a follow-up for [a real deal title]." Confirm the draft sounds like the voice you set.
6. **(Later — Option B)** Add 3 textareas to `AionSettingsView.tsx`, wire `saveAionVoiceConfig()`, add a `?prompt=` dispatch to `AionPageClient.tsx`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-44` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275-282` — onboarding state prompt injections
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:52-75` — `buildFollowUpPrompt` (voice injection into drafts)
- `src/app/(dashboard)/aion/AionPageClient.tsx:66` — URL param dispatch pattern to follow for `?prompt=`
