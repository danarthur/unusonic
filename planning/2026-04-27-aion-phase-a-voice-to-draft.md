# Aion Phase A: voice setup to first draft — minimum path

_Researched: 2026-04-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: The premise in the queue entry is stale. `aion_config` exists on `public.workspaces` (verified: `src/types/supabase.ts:7614`). The `/api/aion/chat` route is a fully implemented 1,319-line tool-calling route, not a stub. `/api/aion/draft-follow-up` is live and fully wired. The Brain tab referenced is the `/aion` full-page chat, not a CRM tab — that page is live. The real problem is different from what the question assumed, and is described below._

## Current state

**Voice config infrastructure — complete.** `AionConfig` type is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`. It holds `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`. `saveAionVoiceConfig()` (line 178) and `getAionConfigForWorkspace()` (line 106) both exist and are wired.

**Voice synthesis bypasses onboarding.** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` generates a generic voice from the workspace name when no voice is stored. `applyVoiceDefaultIfEmpty()` (line 35) sets `voice_default_derived: true` on every read. `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` returns `configured` when that flag is true — meaning existing workspaces skip the onboarding flow entirely and Aion greets them as if they already have a real voice.

**The onboarding state machine exists but is fragmented.** There are five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route handles each at `src/app/api/aion/chat/route.ts:948-956` (system prompt) and `965-1003` (greeting). Each state prompts for exactly one field per turn — three separate back-and-forth rounds minimum.

**Draft generation is live.** `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts` calls the fast model with voice config injected into the system prompt. The `/api/aion/draft-follow-up` route (line 1-73) is authenticated, tier-gated, and wired. The `draft_follow_up` tool is loaded in the chat route at line 649.

**Voice reset is buried.** The only primary-path way for an existing workspace owner to enter the voice onboarding is via the AionSidebar overflow → "Tune Aion's voice" (line 992 in `AionSidebar.tsx`), which calls `resetAionVoiceConfig()`. There is no primary CTA — no empty-state call-out, no landing starter, no settings form.

**`needs_test_draft` requires an extra tap.** After completing the three-turn voice setup, the greeting offers chips ("Yes, try one" / "Looks good, I am done"). The draft does not auto-fire — it waits for the chip click.

## Intended state

Daniel opens `/aion`, writes 3 paragraphs covering his style, a sample message, and his rules, and within 1-2 interactions sees a live follow-up draft for a real deal — demonstrating that the voice landed.

## The gap

- Synthesis sets `voice_default_derived: true` on load, so existing workspaces never enter the onboarding flow; the voice setup path is invisible unless you know the sidebar overflow exists.
- The conversational onboarding is single-field-per-turn by design — getting all three fields into the system and seeing a draft requires 5+ interactions from the sidebar overflow entry point.
- The `save_voice_config` tool CAN save all three fields in one call, but the system prompt for `no_voice` state only instructs the model to ask about style, not to accept a bulk dump.
- `needs_test_draft` adds a required chip click after onboarding, even when the user clearly wants a draft.
- No standalone voice setup form exists in Settings > Aion (the page has consent management but no voice fields).

## Options

### Option A: Two-line system prompt change (patch `no_voice` instruction)

- **What it is:** Change the system prompt instruction at `src/app/api/aion/chat/route.ts:949` from `'Ask about communication style. Save via save_voice_config.'` to `'If the user describes their style, example message, AND guardrails in one turn, save all three via save_voice_config, then immediately call draft_follow_up for their top priority deal — no extra prompts. Otherwise, ask about communication style first.'` This makes the LLM respect a bulk-dump without breaking the step-by-step path for users who need hand-holding.
- **Effort:** Small (2 lines in one file, no schema, no UI)
- **Main risk:** Model compliance is probabilistic. A long first message may still trigger clarifying questions. Works reliably only for users who write clearly structured input.
- **Unlocks:** Power users (Daniel testing his own product) get from zero to draft in a single turn. No regression for guided users.

### Option B: Voice setup form in Settings > Aion

- **What it is:** Add a "Voice" section to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` with three `<textarea>` fields (style, example message, guardrails). On save, call `saveAionVoiceConfig()` (already exists), then redirect to `/aion?justSetupVoice=1`. On the `/aion` page, catch that param in `AionPageClient.tsx`, send a synthetic chat message (`sendChatMessage({ text: 'Draft a test follow-up for my top deal', workspaceId })`), and strip the param. Draft appears on page load. No schema changes. No new API routes.
- **Effort:** Medium (new settings section ~150 lines, redirect + param handler ~30 lines, connects to existing server actions)
- **Main risk:** If the workspace has no active deals, the draft call fails silently; need a graceful "no deals yet" fallback message.
- **Unlocks:** Discoverable, deterministic path. Daniel fills a form, saves, and sees a draft. Form persists for future edits. Visible to any team member who opens Settings > Aion.

### Option C: Landing starter card in the empty /aion state

- **What it is:** Add a "Set your voice" card to `AionLandingStarters.tsx` that fires a pre-filled structured prompt into the chat: `"Set up my voice: [style goes here] / [example message goes here] / [rules go here]"`. The user replaces the placeholders and submits. Aion reads the structured format, calls `save_voice_config` with all three fields, then immediately calls `draft_follow_up`. Wire a `voice_setup` onboarding tip to AionSidebar when `voice_default_derived === true` so the CTA is surfaced proactively.
- **Effort:** Small-medium (new starter card ~50 lines, sidebar tip ~40 lines)
- **Main risk:** Discoverability only helps new chats — existing users who already have `voice_default_derived: true` will only see this if the sidebar tip is wired. Still depends on the same LLM-compliance issue as Option A unless the structured format is tight enough to guarantee parsing.
- **Unlocks:** Clear on-ramp in the empty landing state. Lower friction than a settings page for quick testing.

## Recommendation

**Ship Option A today, then Option B this week.**

Option A is a two-line change that directly addresses the immediate goal: Daniel typing 3 paragraphs and seeing a draft. The instruction change is additive — it doesn't remove the step-by-step path, it just tells the model to skip steps when the user front-loads everything. Ship it in 20 minutes.

Option B is the durable fix. The settings form makes voice setup discoverable and repeatable — it doesn't depend on model compliance, it doesn't require navigating the sidebar overflow, and it gives a clear home for voice review and editing. The `?justSetupVoice=1` redirect pattern is clean and does not require new state management. Do B second, within the same sprint.

Skip Option C for now. The structured prompt template is clever but it adds a third code surface for the same behavior that Option B covers more reliably.

Accepted tradeoffs: Option A gives probabilistic behavior until B ships. Option B requires a graceful fallback for workspaces with no deals (trivially solved with a text fallback message instead of a draft card).

## Next steps for Daniel

1. Edit `src/app/api/aion/chat/route.ts:949` — change the `no_voice` onboarding instruction to accept bulk input and auto-draft. (20 min)
2. Trigger the onboarding by calling `resetAionVoiceConfig()` in the app (sidebar overflow works) — then open `/aion` and paste 3 paragraphs as one message to verify the model saves all three and drafts.
3. Check the resulting `aion_config.voice` in the Supabase SQL Editor to confirm all three fields landed correctly.
4. Add a "Voice" section to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — three textareas bound to `saveAionVoiceConfig()`. (~150 lines, no schema changes.)
5. In `src/app/(dashboard)/aion/AionPageClient.tsx`, add a `useEffect` that checks `searchParams.get('justSetupVoice')` and fires a synthetic `sendChatMessage` for the top-deal draft, then clears the param via `router.replace('/aion')`.
6. Test end-to-end: Settings → Voice form → save → redirect → draft appears.

## References

- `src/app/api/aion/chat/route.ts:948-956` — onboarding system prompt branch
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` + synthesized-default short-circuit
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-45` — voice synthesis
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig()`
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft()`, `buildFollowUpPrompt()`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint (live)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page (add voice section here)
- `src/app/(dashboard)/aion/AionPageClient.tsx` — redirect handler goes here
