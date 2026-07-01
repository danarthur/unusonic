# Aion Phase A — voice setup + first draft: current state and real path

_Researched: 2026-07-01 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this agent re-stated the question as understood. Both stated premises — Brain tab paused, `aion_config` missing — are no longer accurate. The planning primer's "current notable state" section is dated 2026-04-10 and significant work has shipped since. The research below reflects actual current state._

## Current state

**`public.workspaces.aion_config` exists.** The column was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` as a `jsonb NOT NULL DEFAULT '{}'` column. The `AionConfig` type in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` defines it: `voice` (description, example_message, guardrails), `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, `voice_default_derived`.

**The Brain tab is fully wired.** `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `ChatInterface` with `viewState="chat"`. `ChatInterface.tsx:212` opens with a greeting fetch to `/api/aion/chat`. That route (`src/app/api/aion/chat/route.ts:59`) is fully authenticated, tier-gated, and streaming with tool-calling.

**Voice onboarding is fully implemented — conversationally.** `src/app/api/aion/chat/route/prompts.ts:275` injects a forcing block into the system prompt when `onboarding_state` is `no_voice`, `no_example`, `no_guardrails`, or `needs_test_draft`. `src/app/api/aion/chat/route/prompts.ts:292` shows the greeting for each state. The `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:135` writes each field as Daniel provides it. After all three fields are saved, the greeting at `needs_test_draft` offers to draft a test message from an active deal.

**Default voice synthesis bypasses onboarding.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` synthesizes a generic voice from the workspace name when `aion_config.voice` is empty, and marks it `voice_default_derived: true`. `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248` treats `voice_default_derived` as `configured`, which skips the 4-step forcing block entirely. New workspaces therefore open a live chat immediately — but with a generic synthesized voice, not Daniel's actual style.

**"Tune Aion's voice" exists in the sidebar.** `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` shows the menu item. It calls `resetAionVoiceConfig()` (`aion-config-actions.ts:214`), which clears the stored voice and the `voice_default_derived` flag. The next chat session then fires the 4-step conversational onboarding.

**Draft follow-up API is live.** `src/app/api/aion/draft-follow-up/route.ts:60` calls `generateFollowUpDraft({ context, voice: aionConfig.voice })`. The generator at `src/app/api/aion/lib/generate-draft.ts:35` injects the voice config (description, example_message, guardrails) into the system prompt and calls Claude with the deal context.

## Intended state

Daniel opens the Brain tab, describes his client communication style in a few sentences, and quickly reaches a live draft for a real deal that reflects that voice — ideally within one session, not across days.

The 4-step onboarding flow was designed to deliver exactly this: by `needs_test_draft`, all three voice fields are set and Aion calls `draft_follow_up` on the top-priority deal. The issue is discoverability: the default synthesis bypass means Daniel never sees the onboarding unless he finds the sidebar overflow → "Tune Aion's voice" menu item.

## The gap

- **Both stated blockers are already resolved.** `aion_config` exists; the Brain tab is live. No new infrastructure is needed.
- The "3 paragraphs at once" framing doesn't match the implementation: voice setup is 4 sequential conversational turns, not a single form submission.
- New workspaces get a synthesized voice that silently skips onboarding. Daniel may not know his voice hasn't been set, and may not find the sidebar overflow affordance.
- The `aion_card_beta` consent gate in `AionSettingsView.tsx` must be accepted separately for the follow-up card to appear on deal pages — this is independent of the chat tab, but is easy to miss.

## Options

### Option A: Verify the existing path works end-to-end
- **What it is:** Click "Tune Aion's voice" in the sidebar, walk the 4-step conversational flow, confirm a draft appears at the end. No code changes needed.
- **Effort:** Small (minutes of testing, not development)
- **Main risk:** Discovering a runtime bug (e.g., `draft_follow_up` tool not wired to a deal at onboarding time) that needs a targeted fix.
- **Unlocks:** Confidence that the stated goal is already achievable; a clear before/after to show early customers.

### Option B: Add a "Quick voice setup" form shown at first chat open
- **What it is:** When `onboarding_state === 'no_voice'` AND `voice_default_derived` is NOT set (i.e. no prior voice at all), surface a 3-field form (description, example, guardrails) above the chat input. Submitting it calls `saveAionVoiceConfig()` and triggers a test draft immediately. Skippable — the conversational path still works if dismissed.
- **Effort:** Medium (new UI component, wiring to existing action + draft call)
- **Main risk:** Redundancy with the conversational path; two surfaces to keep in sync.
- **Unlocks:** The literal "write 3 paragraphs, immediately see a draft" experience from the queue entry.

### Option C: Surface onboarding more prominently on first load
- **What it is:** Remove or demote the `voice_default_derived` bypass for NEW workspaces (i.e. those with zero deal history), so the first greeting always runs the 4-step flow instead of going straight to chat. Existing workspaces with a synthesized voice are unaffected.
- **Effort:** Small (change `getOnboardingState` condition + one migration to identify "new" workspaces)
- **Main risk:** Could feel intrusive for users who just want to start chatting; the bypass was intentional friction reduction.
- **Unlocks:** Guaranteed voice setup on first use, meaning every workspace's drafts reflect explicit voice from day one.

## Recommendation

**Start with Option A.** The full stack is live — the only unknown is whether the end-to-end path actually produces a good draft. Run it: open the Brain tab, click "Tune Aion's voice" in the sidebar overflow, complete the 4-step flow, and verify the test draft looks right. This takes 10 minutes and either confirms you're done or surfaces a concrete bug to fix.

If the path works, close the queue entry as done — the goal is already achieved. If a bug surfaces (most likely: `draft_follow_up` failing to find a suitable deal at the `needs_test_draft` step), it will be a targeted one-line fix, not a structural gap.

Option B is worth building eventually — a form is faster than 4 turns for power users setting up a second workspace. But it adds a surface to maintain and the conversational path is already there. Build it after you have at least one workspace's real voice data to validate the output quality with.

Option C is the right long-term default but is a product decision about onboarding friction, not a technical gap. Defer until there's usage data on how many workspaces actually reach `needs_test_draft` in the current flow.

## Next steps for Daniel

1. Open `/aion` in the browser and confirm the chat tab loads without a paused/kill-switch message.
2. Click the sidebar header overflow (three-dot or settings icon) and confirm "Tune Aion's voice" appears — `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043`.
3. Click it, complete all 4 steps, and verify the test draft renders in the chat.
4. If the draft step fails (no deal found), check `ops.follow_up_queue` for a pending item with `workspace_id` matching your workspace.
5. Confirm `aion_card_beta` consent is accepted in Settings → Aion so the follow-up card appears on deal pages after the voice is set.
6. If the 4-step flow is working, update the primer's "current notable state" section — it's at least 3 months stale on the Aion front.

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column added
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` — `AionConfig` type; `saveAionVoiceConfig` at :178; `resetAionVoiceConfig` at :214
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` — `synthesizeDefaultVoice`; `applyVoiceDefaultIfEmpty` at :35
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` logic
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding forcing blocks; greeting builder at :292
- `src/app/api/aion/chat/tools/core.ts:135` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts:60` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts:35` — voice injection into system prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" menu item
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx:44` — `aion_card_beta` consent gate
