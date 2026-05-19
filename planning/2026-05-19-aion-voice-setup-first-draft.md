# Aion Phase A: Voice Setup + First Real Follow-up Draft

_Researched: 2026-05-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The queue item's two premises are outdated — both blockers have already shipped.**

`aion_config` column exists in `public.workspaces` since migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`. The schema is a JSONB column with the `AionConfig` type defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`. It holds `voice` (`description`, `example_message`, `guardrails`), `learned`, `follow_up_playbook`, `kill_switch`, and `voice_default_derived` fields.

The Brain tab is the standalone Aion chat page at `/aion`, rendered by `ChatInterface.tsx` (808 lines). It is not paused at the infrastructure level. The `kill_switch` flag controls per-workspace pausing and defaults to `false`. The chat route at `src/app/api/aion/chat/route.ts` gates on `kill_switch` at line 109 and is otherwise fully operational.

The 4-step voice onboarding flow is fully implemented in `src/app/api/aion/chat/route/prompts.ts:300-338`. It walks `no_voice → no_example → no_guardrails → needs_test_draft → configured` and at `needs_test_draft` offers to draft a test message for a top priority deal.

`/api/aion/draft-follow-up/route.ts` is a complete 73-line implementation that authenticates the caller, tier-gates, reads `aionConfig.voice`, and calls `generateFollowUpDraft()` with the voice config at line 60-63. Save path: `saveAionVoiceConfig()` at `aion-config-actions.ts:178`.

**The actual blocker:** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` auto-generates a voice from the workspace name on every config read when no explicit voice is stored. `getOnboardingState()` at `aion-chat-types.ts:247` returns `'configured'` immediately when `voice_default_derived === true`. This means the 4-step chat onboarding **never fires automatically** for any workspace. The only entry point to explicit voice setup is "Tune Aion's voice" buried in the AionSidebar overflow menu (line 1043), which calls `resetAionVoiceConfig()`.

The `AionSettingsView` at `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` covers only consent and feature flags for `crm.unified_aion_card` — no voice setup form.

## Intended state

Daniel opens a focused UI, writes how he talks to clients (description + an example message + guardrails), saves it, and immediately sees a generated follow-up draft for a real deal that demonstrates the voice. The whole loop should take under 5 minutes and leave him with a configured voice that every subsequent draft inherits. No chat scaffolding required — just a direct form-to-draft path.

## The gap

- No direct voice setup form in settings. The only path to explicit setup is an overflow menu item that restarts the chat onboarding.
- `voice_default_derived` silently satisfies the onboarding gate, so the 4-step chat flow never surfaces on its own.
- No "preview a draft now" affordance after voice config is saved. The `draft-follow-up` API exists and works, but nothing calls it from the settings context.
- `crm.unified_aion_card` feature flag + consent is a separate gate for the deal-page card. If Daniel hasn't consented, deal-page drafts stay hidden regardless of voice config.

## Options

### Option A: Make the existing chat flow discoverable
- **What it is:** Add a "Set up your voice" call-to-action on the `/aion` page when `voice_default_derived === true`. Clicking it calls `resetAionVoiceConfig()` and the chat enters `no_voice` mode. No new UI components — just a prompt card that routes to the existing 4-step flow.
- **Effort:** Small (one conditional banner in `ChatInterface.tsx`, no new API surface)
- **Main risk:** The chat's chip-based onboarding asks for style in structured steps, not as 3 free-form paragraphs. The "test draft" at the end needs an active deal in the follow-up queue to be meaningful.
- **Unlocks:** Voice config visible at chat level; drafts personalized on next use.

### Option B: Voice setup section in `/settings/aion` with live draft preview
- **What it is:** Add a `VoiceSetupSection` component to `AionSettingsView` with three textareas (communication style, example message, guardrails). On save, call `saveAionVoiceConfig()`. Add a "Preview a draft" button that fetches the top item from `ops.follow_up_queue` for the workspace and calls `POST /api/aion/draft-follow-up` with its `context_snapshot`. Shows the rendered draft inline.
- **Effort:** Medium (new section + preview action + display; all existing API surface, no schema changes)
- **Main risk:** Preview requires at least one item in `follow_up_queue`. If the queue is empty, the preview has no deal context and falls back to generic text — need a graceful empty state.
- **Unlocks:** Exactly the loop Daniel described. Can ship independently of the deal-card consent flow.

### Option C: Contextual setup prompt on the deal page
- **What it is:** When `crm.unified_aion_card` is enabled but `voice_default_derived === true`, show an onboarding prompt card inside the deal lens that walks voice setup inline (replacing the Aion card until complete), then immediately drafts for that deal.
- **Effort:** Large (new deal-lens conditional, voice setup state machine in deal context, deal-scoped draft trigger)
- **Main risk:** Adds complexity to the deal page; conflates voice config (a workspace setting) with the deal lens. If Daniel skips it on one deal he may never see it again.
- **Unlocks:** Highest-friction moment converted to voice setup; draft is always deal-specific.

## Recommendation

**Option B.** The settings page is the right location for workspace-level configuration — putting it there respects the product's information architecture and doesn't add noise to the deal page. The `VoiceSetupSection` component needs three textareas, a save button, and a preview section. Every piece of the backend already exists: `saveAionVoiceConfig()`, `POST /api/aion/draft-follow-up`, and `ops.follow_up_queue`. The only net-new work is the UI component and a thin server action that fetches the top queue item and proxies the draft request.

Option A is cheaper but leaves the experience inside the chat flow, which is chip-driven and doesn't support writing 3 paragraphs naturally. Option C is the most polished but has more failure modes and is far larger than the current goal.

One important enabler: Daniel also needs to consent to `crm.unified_aion_card` in settings for the deal-page card to appear. That's already a workflow in `AionSettingsView`. Voice setup should be visible and saveable regardless of consent state — the two features are independent.

## Next steps for Daniel

1. Add a `VoiceSetupSection` below the "Cadence learning" section in `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`. Three textareas bound to `description`, `example_message`, `guardrails`. Save calls `saveAionVoiceConfig()`.
2. Add a server action (or inline the logic) to fetch the top `ops.follow_up_queue` item for the active workspace — `context_snapshot` is already stored on the row (`follow_up_queue:4456-4538` in `supabase.ts`).
3. Wire a "Preview draft" button that calls `POST /api/aion/draft-follow-up` with `{ context: contextSnapshot, workspaceId }` and renders the returned `{ draft, channel }` inline below the form.
4. Handle the empty-queue case: if no queue item exists, show a message ("No active deals in queue — save your voice config and drafts will use it when a deal arrives.") instead of the preview button.
5. Clear `voice_default_derived` on save (already handled by `saveAionVoiceConfig()` at line 189-191, which strips the flag before persisting).
6. Verify `crm.unified_aion_card` consent flow is working in the same settings page so deal-page drafts become visible in the same session.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:300-338` — 4-step chat onboarding
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation API
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` migration
- `src/types/supabase.ts:4456-4538` — `follow_up_queue` schema
