# Aion voice setup + first draft: what's actually blocking it

_Researched: 2026-08-08 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Interpreted as: "what's the current status, and what's needed to hit the goal above?" — the premises are outdated (see below)._

---

## Current state

**Both stated premises are wrong.** The codebase has moved substantially since the planning primer was written (2026-04-10).

**`public.workspaces.aion_config`** exists: `src/types/supabase.ts:7782` shows `aion_config: Json` on the `workspaces` row. It has been live in production for months.

**`/api/aion/draft-follow-up`** is fully wired: `src/app/api/aion/draft-follow-up/route.ts` has auth guard (line 23), tier gate (line 44), kill-switch check (line 54), `getAionConfigForWorkspace` loading (line 53), and a call to `generateFollowUpDraft({ context, voice: aionConfig.voice ?? null })` (line 60). Voice injects directly into the system prompt at `src/app/api/aion/lib/generate-draft.ts:63–75`.

**The 5-state voice onboarding machine is live:** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route's greeting responds to each state with the appropriate question (`src/app/api/aion/chat/route/prompts.ts:300–338`). The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` persists description/example/guardrails and sets `onboarding_state: 'complete'` when `onboarding_complete: true`.

**The Brain tab is gone.** The Aion page at `src/app/(dashboard)/aion/page.tsx` renders only `<ChatInterface viewState="chat" />`. No separate Brain tab exists.

**The flow Daniel wants can happen today** — but only if he knows to look for it. The friction is discoverability, not capability.

---

## Intended state

A workspace owner who opens /aion for the first time should be clearly invited to teach Aion their voice. After 3 paragraphs of description, they paste an example message, state any rules, and get a generated draft for their top-priority deal — all without navigating menus.

Reference pattern (from the existing codebase): the `no_voice` greeting at `prompts.ts:303–311` already does exactly this — warm opening, style question, 3 suggestion chips.

---

## The gap

- **Default bypass blocks the onboarding.** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a voice from the workspace name on every read, setting `voice_default_derived: true`. `getOnboardingState()` treats that as `'configured'` and skips the 4-step forcing block. A new workspace (or Daniel's) goes straight to pull-mode chat, never prompted.

- **The explicit tuning entry point is buried.** The only way to trigger the 4-step onboarding is the AionSidebar overflow → "Tune Aion's voice" (calls `resetAionVoiceConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:214`). No CTA on the main Aion surface.

- **Step 4 requires an active deal.** The `draft_follow_up` chat tool needs a queued deal. Workspaces with no deals in `ops.follow_up_queue` can't complete the test-draft step, so `needs_test_draft` silently stalls.

---

## Options

### Option A: Surface a voice-tuning CTA for `voice_default_derived` workspaces

- **What it is:** Add a dismissible banner or starter card in `AionLandingStarters.tsx` (or below the greeting in `ChatInterface.tsx`) when `config.voice_default_derived === true`. The card says something like "Teach Aion your voice — takes 2 minutes" and when clicked calls `resetAionVoiceConfig()` then sends the first onboarding message. The 4-step onboarding already handles the rest.
- **Effort:** Small — one component change, no schema work, no new routes.
- **Main risk:** The banner is easy to dismiss and forget. If Daniel dismisses it on first open, he may never find the tuning flow again.
- **Unlocks:** The existing, working onboarding flow becomes discoverable. Voice quality improves for all draft generation.

### Option B: Add a structured inline voice setup form

- **What it is:** A card or sheet (not a route) with three labeled text areas — "How you talk to clients", "Paste a real message you sent", "Rules Aion must follow" — wired to `saveAionVoiceConfig()` directly. After submit, the chat sends a test draft for the top follow-up deal. Displays when `voice_default_derived === true` and the user hasn't explicitly set their voice.
- **Effort:** Medium — new component (~150 lines), needs a "find top follow-up deal" server action, and a mechanism to trigger a test draft message into the chat after submission.
- **Main risk:** Introduces a parallel path alongside the conversational onboarding. Two surfaces doing the same job create maintenance overhead.
- **Unlocks:** The "write 3 paragraphs + immediately see draft" UX Daniel described, exactly.

### Option C: Dedicated /aion/setup onboarding wizard

- **What it is:** A multi-step page (`/aion/setup`) that intercepts a new session before the chat. Step 1: voice description. Step 2: example message. Step 3: guardrails. Step 4: test draft. On complete, redirects to `/aion`. Middleware or the Aion page checks `voice_default_derived` and redirects to setup on first visit.
- **Effort:** Large — new route, middleware change, 4 step components, redirect logic. 1–2 days.
- **Main risk:** High friction path for returning users who reset their voice. Middleware-level redirects can cause redirect loops if the check isn't careful.
- **Unlocks:** First-class onboarding experience. Pairs well with the broader onboarding flow if voice setup ever becomes part of workspace creation.

---

## Recommendation

**Option A, ship today. Option B in the next sprint.**

The 4-step onboarding is already correct and generates real drafts. The only problem is that no new workspace ever hits it, because `voice_default_derived` silently bypasses it. A single banner card in `AionLandingStarters.tsx` — shown when `voice_default_derived === true`, dismissed on click, calling `resetAionVoiceConfig()` before sending the `no_voice` greeting — makes the whole flow discoverable with ~30 minutes of work.

Option B delivers the "write 3 paragraphs, see a draft immediately" UX with more certainty (the form controls the exact fields, the chat doesn't have to infer them from prose). But it's a second path to maintain. Do A first, observe whether users complete the 4-step chat onboarding, then decide if B is worth the complexity.

Avoid C until voice setup is part of a broader workspace onboarding flow. The redirect approach is risky and the setup is rarely visited.

---

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — add a prop to receive `voiceDefaultDerived: boolean` from the parent `ChatInterface`.
2. In `ChatInterface.tsx`, pass `config.voice_default_derived` down (the config is already loaded in `SessionContext` via the greeting response's `configUpdates`).
3. In `AionLandingStarters.tsx`, render a dismissible card when `voiceDefaultDerived === true`: "Aion is using a default voice. Teach it how you actually write — takes 2 minutes." with a CTA button.
4. CTA onClick: call `resetAionVoiceConfig()` (import from `aion-config-actions`), then call `sendChatMessage({ text: '' })` to trigger the `no_voice` greeting.
5. To test: ensure `aion_config.voice_default_derived` is true in your workspace (run `resetAionVoiceConfig()` via the sidebar overflow, then reload — the default re-synthesizes on next read). Confirm the banner appears and the 4-step flow completes to a real draft.
6. For the "no deals" stall at step 4: update the `needs_test_draft` greeting to offer "I'm done with setup" as the chip default rather than requiring a draft, so the onboarding can complete without a live deal.

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:275–285` — onboarding state injection into system prompt
- `src/app/api/aion/chat/route/prompts.ts:300–338` — per-state greeting responses
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft route (fully wired)
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` (voice injection)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:214` — `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — target file for Option A
