# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-06-05 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Two of the three prerequisites the question assumes are missing **already exist**:

`public.workspaces.aion_config` does exist — defined as `jsonb DEFAULT '{}'::jsonb NOT NULL` at `supabase/migrations/20260101000000_baseline_schema.sql:15058`. The queue entry's assumption that it's absent is stale.

The TypeScript shape is fully defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`. The `voice` field maps to `AionVoiceConfig: { description, example_message, guardrails }` — exactly the three fields the goal calls for.

The draft generation endpoint also already exists at `src/app/api/aion/draft-follow-up/route.ts`. It is authenticated, checks `kill_switch`, calls `generateFollowUpDraft({ context, voice })` with voice pulled from `aion_config`, and returns `{ draft: string, channel }`. A read helper `getAionConfigForWorkspace(workspaceId)` lives at `aion-config-actions.ts:108`.

The primer's note that `/api/aion/route.ts` is a 16-line GPT-4-turbo stub is also stale. The real chat route at `/api/aion/chat/route.ts` is fully implemented: authenticated, Claude models via tier routing, intent classification, tools.

What does **not exist**:

- **The Brain tab itself.** No `/brain` route or page. `CadenceLearningToggle.tsx:14` mentions "can live inside the Brain tab" as a future location, but nothing is wired.
- **A voice setup form.** No UI for writing and saving voice config.
- **A server action to write voice config.** The read path exists; the write path is not wired to any UI.

## Intended state

Daniel opens a Brain tab → writes how he communicates with clients → saves → immediately clicks "Try it" for an active deal → sees a follow-up draft in his voice, not generic output.

The data write path: form → server action → `UPDATE public.workspaces SET aion_config = aion_config || '{"voice": ...}'::jsonb WHERE id = workspaceId`. The draft read path already works end-to-end. The gap is one new route, one form, and one server action.

## The gap

- No Brain tab route or page component
- No voice setup form (description, example message, guardrails)
- No `saveAionVoice()` server action to persist `aion_config.voice`
- No "try it" trigger in the tab to immediately show the voice in action

## Options

### Option A: Settings page voice form (no new route)

- **What it is:** Add an "Aion Voice" section to the existing workspace settings page with the three-field form and a save action.
- **Effort:** Small (1 day)
- **Main risk:** Buried in settings, not the Brain tab product vision. CadenceLearningToggle and future Brain features have no natural home.
- **Unlocks:** End-to-end voice → draft pipeline immediately, with no routing work.

### Option B: Brain tab as dedicated workspace-level route

- **What it is:** Add `src/app/(dashboard)/(features)/brain/page.tsx` as a top-level nav item (workspace-wide, not per-deal, since voice config is workspace-scoped). Voice form lives there alongside a "Try it" section: pick the most recent open deal, call `/api/aion/draft-follow-up`, render the draft inline.
- **Effort:** Medium (2–3 days: route, form, server action, draft preview panel, nav link)
- **Main risk:** Requires a nav placement decision — top-level item vs. settings sub-page. Top-level is correct since voice is workspace-wide, but it commits a nav slot.
- **Unlocks:** The proper home for all Aion personalization. CadenceLearningToggle, kill_switch toggle, and onboarding_state are one additional PR away after this lands.

### Option C: In-chat voice extraction

- **What it is:** When `aion_config.voice` is empty, inject a prompt into the Aion chat asking Daniel to describe his style. Extract the voice config via a structured tool call and save automatically.
- **Effort:** Large (3–4 days: extraction tool, onboarding state machine, fallback handling, editability)
- **Main risk:** Extracted config is fragile and hard to review or correct. Users who don't follow the prompt get silent bad config.
- **Unlocks:** Zero-friction onboarding — no form to find. But less reliable and harder to iterate.

## Recommendation

**Option B.** The Brain tab is already part of the product roadmap — `CadenceLearningToggle.tsx:14` explicitly names it — and the actual implementation gap is smaller than the queue entry assumed. `aion_config` exists, the draft route works, only the UI is missing. Option A defers the routing problem by one sprint without closing it; Option C is too clever for a first pass where reliability matters more than friction.

The minimum implementation is four connected pieces: a `brain/page.tsx` with a `stage-panel` surface, a three-textarea form (description / example message / guardrails), a `saveAionVoice()` server action that merges the voice object into the workspace's JSONB column, and a "Try it" section that POSTs to `/api/aion/draft-follow-up` against the most recent open deal and renders the result. No schema migration needed — the column is already there.

## Next steps for Daniel

1. Confirm nav placement: top-level workspace item (recommended) or a tab added to the deal page. Voice config is workspace-wide so the former is correct.
2. Create `src/app/(dashboard)/(features)/brain/page.tsx` with a `stage-panel` wrapper and the three-textarea form.
3. Add `saveAionVoice(workspaceId, voice: AionVoiceConfig)` to `aion-config-actions.ts` — merge update via `supabase.from('workspaces').update(...)` server client.
4. Add a "Try it" section: fetch most recent open deal, POST to `/api/aion/draft-follow-up`, render the returned draft.
5. Wire a nav link in the workspace layout alongside the other top-level items.
6. Smoke test: fill the three fields, save, hit "Try it", confirm the draft tone reflects the input.

## References

- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column definition
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74` — `AionConfig` / `AionVoiceConfig` types
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint, already complete
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — Brain tab design note
- `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` — existing Aion UI patterns
- `src/app/api/aion/chat/route.ts` — auth + kill_switch pattern to follow in new route
