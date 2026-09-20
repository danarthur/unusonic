# Aion Voice Setup: Path to First Personalized Draft

_Researched: 2026-09-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture. Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Both premises in the question are now outdated.** The primer was written 2026-04-10; substantial Aion work landed since then.

**`aion_config` column exists.** Added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` as a JSONB column on `public.workspaces`, defaulting to `{}`. In use across 10+ call sites. Confirmed in `src/types/supabase.ts:7897`.

**Brain tab is the `/aion` page.** No separate "Brain tab" was ever shipped. The planning-primer description was a forward note. `AionInput.tsx`, `AionVoice.tsx`, and `ChatInterface.tsx` are all fully implemented and wired into `src/app/(dashboard)/aion/AionPageClient.tsx:73`. The old 16-line stub at `/api/aion/route.ts` is gone; it was replaced by a full suite under `src/app/api/aion/`.

**The 4-step voice onboarding is live in the chat route.** `src/app/api/aion/chat/route/prompts.ts:284-292` defines a state-machine forcing block that walks through `no_voice → no_example → no_guardrails → needs_test_draft → configured`. When all three `AionVoiceConfig` fields (`description`, `example_message`, `guardrails`) are filled, Aion immediately offers a test draft in the same chat turn (`needs_test_draft` state), then marks `onboarding_state: 'complete'`.

**Voice feeds drafts today.** `src/app/api/aion/draft-follow-up/route.ts:62` reads `aionConfig.voice` and passes it to `generateFollowUpDraft`. `src/app/api/aion/lib/generate-draft.ts:63-75` injects all three voice fields into the LLM system prompt.

**But most workspaces skip onboarding.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-27` synthesizes a generic default from the workspace name when `aion_config.voice` is empty and sets `voice_default_derived: true`. `getOnboardingState` in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` treats `voice_default_derived` as configured and skips the 4-step flow. New workspaces — and probably Daniel's workspace — have been using a generated voice profile all along without knowing it.

**The retune path exists but is buried.** `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` exposes "Tune Aion's voice" in the sidebar header overflow. Clicking it calls `resetAionVoiceConfig`, clears the stored voice and `voice_default_derived`, and tells the user to start a new chat. The next chat then enters the 4-step onboarding.

## Intended state

Daniel opens the Aion page, writes about his communication style (3 fields: style description, example message, guardrails), and immediately sees a draft follow-up for one of his active deals, calibrated to that voice. From there, voice is set and all future follow-up card drafts reflect it.

The end-to-end mechanics already exist. The missing piece is discoverability: Daniel likely has `voice_default_derived: true` and does not know the setup exists or how to enter it.

## The gap

- New and existing workspaces silently receive a synthesized voice and skip the 4-step onboarding entirely
- No surface tells the owner "your voice is a default — customize it for better drafts"
- "Tune Aion's voice" requires navigating to the Aion page, finding the sidebar header overflow, and starting a new chat — none of which is discoverable from the place where drafts are consumed (the follow-up card)
- The test draft at the end of onboarding uses whatever deal Aion picks; there is no path from "set up voice while looking at deal X" to "see a draft for deal X immediately"

## Options

### Option A: Document the existing path
- **What it is:** Write a short internal note describing how to enter voice onboarding today (sidebar overflow → reset → new chat → 3 turns → draft). No code change.
- **Effort:** Small
- **Main risk:** Does not fix the underlying discoverability gap; Daniel finds it but users won't
- **Unlocks:** Daniel can personally test and validate the full flow today

### Option B: Surface a voice setup nudge when the default is in use
- **What it is:** When `voice_default_derived === true`, render a small "Your voice is a default — set it up for better drafts" callout on the Aion page greeting or in the follow-up card. Clicking it calls `resetAionVoiceConfig` and opens a new Aion chat, which then enters the 4-step onboarding. No new server logic — just an indication and a shortcut.
- **Effort:** Small (one callout component, one client action, ~80 lines)
- **Main risk:** Minor — needs to avoid re-prompting on every visit if the user dismisses; a simple `localStorage` guard or `onboarding_state: 'dismissed'` patch handles it
- **Unlocks:** Owners discover voice setup organically; the conversational 3-paragraph flow works as designed

### Option C: Add a standalone voice setup form
- **What it is:** A dedicated form (3 textareas: description, example, guardrails) in the Aion sidebar or as a page section. On submit, calls `saveAionVoiceConfig`, then immediately calls `POST /api/aion/draft-follow-up` to show a test draft inline — all without the chat conversational loop.
- **Effort:** Medium (~180 lines: form component, draft-preview card, wiring)
- **Main risk:** Duplicates the conversational onboarding path; two UX flows for the same data is confusion risk; the follow-up draft needs a real deal ID to be meaningful, so a standalone form still needs deal-picker logic
- **Unlocks:** Faster setup for owners who prefer forms; also gives an editable view of the current voice config

## Recommendation

**Option B.** The plumbing is complete. Daniel can test it today by going to `/aion` → sidebar overflow → "Tune Aion's voice" → new chat → answer three questions → see a draft. That is the "3 paragraphs" flow — it just happens over 3 chat turns instead of one form.

The real problem is that nobody knows to do this. Adding a small nudge when `voice_default_derived === true` surfaces the path at the moment it's relevant (on the Aion page, or from the follow-up card) and feeds into the conversational onboarding that already works. Option A (doc only) fixes nothing for users. Option C duplicates the path and adds complexity without fixing discoverability. Option B is the minimum change that makes the existing system discoverable.

Accept the tradeoff: the nudge will reappear on next session if dismissed without completing setup unless you track dismissal (which `localStorage` handles fine per the `AionFirstVisitPrompt.tsx:14-54` pattern already in the codebase).

## Next steps for Daniel

1. **Validate the existing flow today.** Open `/aion`, click the sidebar header overflow (three-dot or settings icon), click "Tune Aion's voice", confirm reset, start a new chat, answer Aion's three voice questions. Confirm a test draft is offered at the end. This takes 5 minutes and proves the path works before adding any UI.

2. **Identify where to surface the nudge.** Best candidate: the `AionLandingStarters.tsx` area or a one-line callout in `ChatInterface.tsx` rendered when `voice_default_derived === true`. The Aion page server component already has access to `aionConfig` (fetched via `getAionConfig()` on load).

3. **Add the nudge component.** A small `StagePanel`-style callout: "Your voice is based on your workspace name. Teach Aion how you actually write." with a "Set it up" button that calls `resetAionVoiceConfig` and reloads the chat. Follow the `AionFirstVisitPrompt.tsx:47-54` dismissal pattern using `localStorage`.

4. **Also surface from the follow-up card.** In `follow-up-card.tsx`, when the "Draft a message" flow returns a `voice_default_derived` draft, append a one-line "This used a default voice — tune it in Aion for better results" below the draft with a `/aion` link.

5. **Rename legacy constants** (low-priority, separate commit). `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts` → `PACKAGE_SYSTEM` / `PACKAGE_FULL_SYSTEM`. Noted as pending in primer line 111.

## References

- `src/app/api/aion/chat/route.ts:124` — onboarding state loaded per request
- `src/app/api/aion/chat/route/prompts.ts:284-292` — 4-step forcing block
- `src/app/api/aion/draft-follow-up/route.ts:60-62` — voice → draft generation
- `src/app/api/aion/lib/generate-draft.ts:52-86` — voice injection into system prompt
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-27` — default voice synthesis
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:241-257` — `getOnboardingState` + `voice_default_derived` short-circuit
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:972-1044` — "Tune Aion's voice" overflow entry
- `src/app/(dashboard)/(features)/aion/components/AionFirstVisitPrompt.tsx:47-54` — dismissal pattern to reuse
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — column origin
