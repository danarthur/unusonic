# Aion Phase A: minimum path to voice setup + first draft

_Researched: 2026-10-01 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer's two premises are both wrong — in a good way.**

`public.workspaces.aion_config` exists. It was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` and is reflected in `src/types/supabase.ts:7895`. The TypeScript shape (`AionConfig`) is fully defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` with a `voice?: AionVoiceConfig` sub-object containing `description`, `example_message`, and `guardrails` fields.

The server action to save it — `saveAionVoiceConfig(voice: AionVoiceConfig)` — already exists at `aion-config-actions.ts:178–206`. It reads the current config, strips the `voice_default_derived` flag (so a manual save overrides any synthesized default), merges, and writes back. `resetAionVoiceConfig` is also there for the "Tune Aion's voice" flow (line 214).

The draft endpoint `POST /api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts`) already reads `aionConfig.voice` and passes it to `generateFollowUpDraft` at line 60–63. The voice has been wired to draft generation since this route was written.

`getDealContextForAion` exists at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` and is called from the Follow-Up Card (`follow-up-card.tsx:341`), the chat tools, and the dispatch engine. The full pipeline from deal context → voice-aware draft is live.

The "Brain tab" is absent. There is no route at `/aion/brain` or any component that renders a voice setup form. The closest reference is a comment inside `CadenceLearningToggle.tsx:14` ("can live inside the Brain tab"). The kill_switch infrastructure exists server-side (`aion-config-actions.ts:292`), but there is no frontend tab, paused state banner, or voice input form anywhere in the codebase.

One flag: `saveAionVoiceConfig` writes via the RLS client (`createClient()`), while `setLearnOwnerCadence` explicitly uses the system client because "public.workspaces has no UPDATE policy for authenticated callers." Either there is a per-field policy or `saveAionVoiceConfig` silently fails. Verify the workspaces UPDATE RLS before shipping.

## Intended state

Daniel opens the Brain tab, fills three fields about his communication style, saves, then opens any deal's Follow-Up Card and clicks "Generate draft." The draft's voice matches what he wrote. Subsequent edits via `POST /api/aion/learn-from-edit` reinforce the pattern over time.

The tab itself is envisioned as a home for voice config + cadence learning toggle, sitting alongside the main chat view under `/aion`.

## The gap

- No Brain tab route exists (`/aion/brain` or equivalent)
- No voice setup form (the form that calls `saveAionVoiceConfig` with three textarea fields)
- `saveAionVoiceConfig` may fail silently if no UPDATE RLS policy covers workspace members writing `aion_config` — needs verification
- No navigation link pointing to the Brain tab

Everything else is complete and wired.

## Options

### Option A: Voice form in the existing `/settings/aion` page
- **What it is:** Add three textareas (`description`, `example_message`, `guardrails`) to `AionSettingsView.tsx`, calling `saveAionVoiceConfig` on save. No new route.
- **Effort:** Small (< 2 hours). The settings page exists, the action is importable, no routing work.
- **Main risk:** Settings page is already dense with beta consent and cadence toggle. Voice setup gets lost between admin controls.
- **Unlocks:** The described demo flow works immediately. No new files except the form UI.

### Option B: New Brain tab at `/aion/brain`
- **What it is:** New Server Component route at `src/app/(dashboard)/aion/brain/page.tsx` that loads `getAionConfig()` and passes it to a `BrainView` client component. `BrainView` renders the 3-field voice form + `CadenceLearningToggle`. Add a tab link in the Aion navigation.
- **Effort:** Small-medium (half day). New page + client view + navigation wire-up. The action is already written.
- **Main risk:** Need to find where Aion nav tabs are rendered and wire the new tab correctly without knowing the exact component. Low risk once located.
- **Unlocks:** The Brain tab exists as a durable home. Voice setup, cadence toggle, and future Brain-layer features have a clear address.

### Option C: Inline voice setup inside the Aion chat sidebar
- **What it is:** A gear/settings affordance inside `AionSidebar` that opens a panel or drawer with the voice form. No new route, stays in-context with the chat.
- **Effort:** Medium. The sidebar is complex (808-line `ChatInterface.tsx`); adding a panel without breaking the streaming/scope state takes care.
- **Main risk:** Architecturally awkward — voice config is a workspace setting, not a per-session concern. Mixing it into the chat surface creates confusion when non-owners open the sidebar.
- **Unlocks:** Voice config accessible from within the chat experience, without leaving context.

## Recommendation

**Option B: build the Brain tab.** The half-day cost buys the right permanent home for all Brain-layer features. The comment in `CadenceLearningToggle.tsx` confirms this was always the plan. Option A works but buries a user-facing voice tuning experience inside an admin settings page — the wrong register. Option C is architecturally the weakest: voice config is owner-level and shouldn't be inside the per-session chat surface.

The implementation is mechanical: one server page, one client view with three textarea fields and a save button, one navigation link. The hard work (`saveAionVoiceConfig`, `AionVoiceConfig` type, draft-follow-up pipeline) is already done. The only pre-work is verifying the workspaces UPDATE RLS policy — if it's missing, add a row allowing workspace owners/admins to update their own workspace's `aion_config`.

## Next steps for Daniel

1. **Verify RLS:** search `supabase/migrations/` for any UPDATE policy on `public.workspaces`. If there is none, add one scoped to workspace members before touching the UI — `saveAionVoiceConfig` will silently no-op otherwise.
2. **Find Aion nav:** grep for the existing Aion tab navigation (likely in `src/app/(dashboard)/aion/layout.tsx` or a sibling layout). Identify where to add the Brain tab link.
3. **Create `src/app/(dashboard)/aion/brain/page.tsx`:** Server Component. Call `getAionConfig()`, pass `voice` and `cadenceOptIn` to `BrainView`.
4. **Create `src/app/(dashboard)/aion/brain/BrainView.tsx`:** Client component. Three `<textarea>` fields for `description`, `example_message`, `guardrails`. Save button calls `saveAionVoiceConfig`. Show current values from props. Use `stage-panel` and the surface context system.
5. **Add tab link** pointing to `/aion/brain` in the Aion nav, label "Brain".
6. **Smoke test:** save a voice, open a deal with a pending follow-up, click "Generate draft" on the Follow-Up Card, confirm the draft tone reflects the saved voice.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — `AionConfig` / `AionVoiceConfig` types
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178–256` — `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/api/aion/draft-follow-up/route.ts:60–63` — voice passed to draft generation
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:341` — Follow-Up Card draft generation call
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — Brain tab comment
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing Aion settings page (consent + cadence)
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
