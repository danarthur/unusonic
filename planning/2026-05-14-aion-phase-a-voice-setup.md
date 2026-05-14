# Aion Phase A: Voice Setup and First Draft

_Researched: 2026-05-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: I understood the question as written but the primer's "current notable state" is dated 2026-04-10. Significant work has shipped since then. The research below reflects what is actually in the codebase as of today._

## Current state

**`aion_config` exists and is fully wired.** `public.workspaces.aion_config` is a `Json` column present in `src/types/supabase.ts`. The `AionConfig` TypeScript type is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` and includes `voice?: AionVoiceConfig` with three sub-fields: `description`, `example_message`, and `guardrails`.

**The 4-step conversational voice setup is live.** The `getOnboardingState()` function at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` maps config state to `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route at `src/app/api/aion/chat/route.ts:122` reads this state, the system prompt at `src/app/api/aion/chat/route/prompts.ts:275` injects per-state directives, and the greeting builder at `prompts.ts:301` opens the right conversation. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` writes voice fields to `aion_config` via `updateAionConfigForWorkspace`.

**The draft endpoint is live.** `POST /api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts` handles auth, tier gating, kill switch, and calls `generateFollowUpDraft` from `src/app/api/aion/lib/generate-draft.ts:25`. That function runs `generateText` via Vercel AI SDK with a real model. The voice config is injected into the prompt at `generate-draft.ts:63` — if `voice.description`, `voice.example_message`, and `voice.guardrails` are set, they override the generic tone instructions.

**`getDealContextForAion` is live.** `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` assembles the full `AionDealContext` struct the draft endpoint consumes.

**What does not exist: a "Brain tab" page.** The term "Brain" in the codebase refers only to the Lucide `Brain` icon used for the "Thinking" model mode in ChatInterface. There is no `/aion/brain` route, no `BrainTab.tsx`, and no standalone voice config form. The `CadenceLearningToggle` component (`src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14`) is a drop-in component that references "the Brain tab" in a comment, but has no host page. The only path to retuning voice today is `AionSidebar` overflow → "Tune Aion's voice" (sidebar line 1043), which calls `resetAionVoiceConfig` and restarts the conversational flow.

## Intended state

Daniel opens a dedicated Brain settings surface, types 3 paragraphs describing his voice, saves them, then immediately sees an Aion-generated follow-up draft that reflects that voice. The surface should also host the cadence-learning opt-in toggle. This is a first-party explicit-config moment — not buried in chat history, not reset-and-redo, but a direct form.

## The gap

- No Brain settings page exists (no route, no form component)
- Voice config is write-only from the chat — no read view outside conversation history
- `CadenceLearningToggle` is orphaned (no parent page)
- No "test draft" trigger outside the full deal card flow
- Discoverability: the only entry point to voice setup is starting an Aion chat for the first time, or hunting for "Tune Aion's voice" in the sidebar overflow

## Options

### Option A: Surface the existing conversational flow

- **What it is:** Add a visible entry point — a "Set up Aion voice" card on the `/aion` landing page — that links to a new Aion chat scoped to voice onboarding. No new form, no new server actions; the 4-step chat flow already handles it.
- **Effort:** Small (one landing card, one router push with a `?mode=onboarding` param the chat route already ignores gracefully)
- **Main risk:** Voice config remains invisible outside chat; Daniel still can't see his saved paragraphs without reading back through chat history
- **Unlocks:** Discoverability without adding a new page

### Option B: Build a minimal Brain settings page

- **What it is:** New page at `/aion/brain` (or a tab in the existing `/aion` layout) with three textarea fields bound to `AionVoiceConfig`, a Save button calling the existing `saveAionVoiceConfig` server action, a `CadenceLearningToggle`, and a "Preview draft" button that calls `POST /api/aion/draft-follow-up` against the top queue item. Reads current config via `getAionConfig()` for initial values.
- **Effort:** Medium (one new page, one new form component, one server fetch, one API call from the client — roughly 200 lines)
- **Main risk:** The "Preview draft" button needs a deal in the queue; if the queue is empty, the button must degrade gracefully
- **Unlocks:** Daniel's exact stated goal; also gives a home to `CadenceLearningToggle` and makes voice config inspectable

### Option C: Inline voice config editor in AionSidebar

- **What it is:** Replace the "Tune Aion's voice" overflow menu item with an expandable panel inside the sidebar that shows the three fields as textareas, saves on blur via `saveAionVoiceConfig`. No new route.
- **Effort:** Medium (sidebar is already 1000+ lines; adding an inline panel keeps it contained but increases sidebar complexity)
- **Main risk:** Sidebar already complex; inline editing inside a nav surface is a weak UX pattern and harder to test
- **Unlocks:** Voice config visibility without a new route, but cramped

## Recommendation

**Build Option B.** Daniel's stated goal requires a named UI surface — the Brain page — and the server machinery is complete. `saveAionVoiceConfig` already exists and handles the merge correctly (strips `voice_default_derived`, merges into existing config). `getAionConfig()` provides initial field values. The only implementation work is a React form and one API call.

For the preview draft: fetch the top item from `ops.follow_up_queue` ordered by `priority_score DESC` in the page's server component, call `getDealContextForAion` on it, and pass the context to the client so the "Test draft" button can POST to `/api/aion/draft-follow-up`. If the queue is empty, disable the button with copy like "No active deals in queue — save your voice and it will apply to the next draft."

Skip the conversational flow for this surface. The chat-based onboarding is a good secondary path (new users who open chat cold), but the Brain page is for intentional setup. Two valid paths, same backing store.

## Next steps for Daniel

1. Create `src/app/(dashboard)/aion/brain/page.tsx` — server component that calls `getAionConfig()` and fetches top queue item via `getDealContextForAion`
2. Create `src/features/aion/VoiceConfigForm.tsx` — client component with three labeled textareas (`description`, `example_message`, `guardrails`) pre-filled from server props, Save button calls `saveAionVoiceConfig`
3. Drop `CadenceLearningToggle` into the Brain page below the form, passing `initialEnabled={config.learn_owner_cadence ?? false}`
4. Add "Test draft" button that POSTs to `/api/aion/draft-follow-up` with the prefetched context; render result in a `DraftPreviewCard` (component already exists at `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx`)
5. Add a "Brain" link to the Aion sidebar nav and remove or redirect the sidebar overflow "Tune Aion's voice" item to the new page
6. Smoke-test with an empty queue (button should disable gracefully) and a populated queue (draft should reflect saved voice)

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection into prompt
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx` — orphaned component, ready to drop in
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — existing draft preview UI component
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — current "Tune Aion's voice" entry point to remove/redirect
