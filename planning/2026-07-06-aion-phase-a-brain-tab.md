# Aion Phase A: Brain tab voice form + first real draft

_Researched: 2026-07-06 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The two premises in the queue item need correction before anything else.

`public.workspaces.aion_config` **does exist.** It was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` as `jsonb NOT NULL DEFAULT '{}'`. The TypeScript shape `AionConfig` is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` and includes `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

The old "16-line GPT-4-turbo stub" at `/api/aion/route.ts` no longer exists. It has been replaced by a full implementation:

- `src/app/api/aion/chat/route.ts` — streaming AI SDK endpoint, model picker (auto/fast/thinking)
- `src/app/api/aion/draft-follow-up/route.ts` — 74-line endpoint that reads `aionConfig.voice` and calls `generateFollowUpDraft()`
- `src/app/api/aion/lib/generate-draft.ts` — shared draft logic (`buildFollowUpPrompt` uses voice description + guardrails)

Voice setup already exists as an in-chat onboarding flow. The state machine at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` drives four conversational steps: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Prompts are injected at `src/app/api/aion/chat/route/prompts.ts:275–282`.

What is **actually absent** is the Brain tab page. There is no route at `/aion/brain` and no dedicated Brain tab UI. `src/app/(dashboard)/aion/AionPageClient.tsx:73` renders only `<ChatInterface viewState="chat" ...>`. The reference in `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — "can live inside the Brain tab, a workspace settings page, or an onboarding checklist" — confirms the tab was planned but never built. All Aion configuration currently surfaces either in the conversational flow or at the `/settings/aion` page (`src/app/(dashboard)/settings/aion/page.tsx`).

## Intended state

Daniel opens a Brain tab within the Aion surface, fills in 3 labeled text areas (communication style, example message, guardrails), saves, and immediately sees a follow-up draft rendered below the form. The draft uses the saved voice config and is scoped to the most recent open deal. This is a form with instant feedback — not a chat wizard, not a buried settings page.

## The gap

- No `/aion/brain` route or Brain tab navigation exists
- No structured voice form UI (the 3 text areas) exists — only the 4-step conversational flow
- `generateFollowUpDraft` requires a full `AionDealContext` — the form needs to fetch the most recent open deal to power the preview
- No way to reach this surface from the current Aion navigation

## Options

### Option A: Extend the existing settings page
- **What it is:** Add a "Voice" card to `/settings/aion/AionSettingsView.tsx` with 3 text areas and a "Generate test draft" button calling `draft-follow-up` with the most recent deal.
- **Effort:** Small — 1 component, wire into existing view
- **Main risk:** Settings page is the wrong destination for something Daniel will revisit regularly. It also has no deal context today — a new server action is needed to fetch one.
- **Unlocks:** Voice form + test draft immediately, no new routing

### Option B: Build a dedicated Brain tab page
- **What it is:** Add `src/app/(dashboard)/aion/brain/page.tsx` + `BrainPageClient.tsx` with (a) 3-field voice form calling `saveAionVoiceConfig`, (b) live draft preview powered by the most recent open deal, (c) two-item tab navigation on the Aion surface (Chat / Brain). `CadenceLearningToggle` and future intelligence controls live here.
- **Effort:** Medium — 2 new files (route + client component), 1 server action for "fetch most recent deal + generate preview", tab nav in the Aion layout
- **Main risk:** Requires a navigation pattern decision: tab bar in `src/app/(dashboard)/aion/layout.tsx` vs. a toggle in the Aion sidebar. That decision adds scope but not complexity.
- **Unlocks:** The canonical Brain tab surface — a permanent home for voice config, playbook management, cadence learning, and future intelligence controls

### Option C: First-run modal overlay
- **What it is:** When `onboarding_state` is `null`, render a focused modal over the chat with all 3 fields and a draft preview inline, then dismiss to chat on save.
- **Effort:** Small-medium — 1 modal component, 1 onboarding state check in `AionPageClient`
- **Main risk:** Solves first-run only. Does not give Daniel a place to return to and tune. This is a dead end for the Brain tab goal.
- **Unlocks:** Voice setup + first draft for new workspaces. Nothing more.

## Recommendation

Build **Option B**. The two smaller options defer the navigation decision and leave no durable home for intelligence controls, which will accumulate. Option C solves one-time setup but is architectural dead weight the moment Daniel wants to retune his voice.

The scope is smaller than it looks. Every building block exists:

- `saveAionVoiceConfig` is at `aion-config-actions.ts:152`
- `generateFollowUpDraft` is at `generate-draft.ts` and already respects `voice`
- `getDealContextForAion` is at `follow-up-actions.ts:545`

New work: a route shell, a single client form component, one server action that fetches the most recent open deal and returns a draft preview, and a minimal two-item tab bar. The tab bar is the only design call — whether it lives in the Aion layout or as a toggle in the sidebar. Given Stage Engineering's density tiers, a two-item tab row above the chat pane is the obvious move.

The one tradeoff: Option B surfaces the playbook and cadence learning controls alongside voice config, which adds a little more surface area to the first build. Keep `BrainPageClient` scoped to the 3 voice fields + preview on the first pass; `CadenceLearningToggle` can drop in on the second.

## Next steps for Daniel

1. Read `src/app/(dashboard)/aion/AionPageClient.tsx` and `src/app/(dashboard)/aion/` to understand the layout and where to add the tab bar
2. Read `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` and `:152–213` — the `AionConfig` shape and `saveAionVoiceConfig` write path, before writing the form
3. Read `src/app/api/aion/lib/generate-draft.ts` — understand what `voice.description`, `voice.example_message`, and `voice.guardrails` drive in the prompt, so the form field labels are accurate
4. Create `src/app/(dashboard)/aion/brain/page.tsx` as a server component that loads `aion_config.voice` + the most recent open deal via `getDealContextForAion`
5. Build `BrainPageClient.tsx`: 3 labeled text areas bound to voice fields, save action calling `saveAionVoiceConfig`, then fire `POST /api/aion/draft-follow-up` and render the returned draft below the form
6. Add a two-item tab row (Chat / Brain) to the Aion layout — `src/app/(dashboard)/aion/layout.tsx` is the right place if it exists; otherwise add a nav toggle to `AionPageClient`

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — current Aion surface entry point
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — AionConfig type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:152` — saveAionVoiceConfig
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint (voice-aware, kill-switch gated)
- `src/app/api/aion/lib/generate-draft.ts` — generateFollowUpDraft + buildFollowUpPrompt
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — onboarding state machine
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545–611` — getDealContextForAion
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — Brain tab reference
- `src/app/(dashboard)/settings/aion/page.tsx` — existing Aion settings surface (Option A baseline)
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — aion_config column origin
