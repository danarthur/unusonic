# Aion Phase A: voice setup + first real draft

_Researched: 2026-07-29 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise is outdated.** The planning primer is dated 2026-04-10; the codebase has shipped all of Phase A in the intervening four months. Everything the question asks for is already live.

**`public.workspaces.aion_config` exists.** The column is typed `Json` in `src/types/supabase.ts:7782` and is actively read in the follow-up cron at `src/app/api/cron/follow-up-queue/route.ts:199–208`, casting to `AionConfig` which includes `.voice` and `.follow_up_playbook` sub-objects.

**Voice setup is chat-driven, not a form.** When `aion_config.voice` is missing, the chat system prompt (`src/app/api/aion/chat/route/prompts.ts:275–283`) enters a 4-step onboarding flow: `no_voice → no_example → no_guardrails → needs_test_draft`. The greeting for `no_voice` state (`:301–311`) asks "How would you describe your style?" with suggestion chips. Aion saves the result via the `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118–144`, writing `{ description, example_message, guardrails }` into `workspaces.aion_config.voice`. The "Brain tab" was cancelled; this chat flow is the replacement.

**`getDealContextForAion` exists** at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`. It assembles deal + client + proposal + recent follow-up log into an `AionDealContext` object. It is imported and called in 4 places.

**`POST /api/aion/draft-follow-up` is fully implemented** at `src/app/api/aion/draft-follow-up/route.ts:1–73`. It authenticates the session, gates on tier, loads `aionConfig` from `getAionConfigForWorkspace`, and calls `generateFollowUpDraft({ context, voice: aionConfig.voice ?? null })`.

**The Follow-Up Card calls the draft route.** `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338–370` — `handleDraftMessage()` calls `getDealContextForAion`, POSTs to `/api/aion/draft-follow-up`, and sets the draft state to `ready`, displaying the result inline with edit tracking via `normalizedEditDistance`.

**Voice reset path exists.** The Aion sidebar at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002–1043` has a "Tune Aion's voice" overflow item that clears `aion_config.voice` and triggers re-onboarding on next chat open.

## Intended state

The original goal: Daniel opens a tab, writes about his communication style, sees a voice-aware follow-up draft. The shipped system achieves this through the Aion chat interface rather than a dedicated form. The chat onboarding collects style description, example message, and guardrails, then the Follow-Up Card uses that profile to generate deal-specific drafts.

## The gap

- The **planning primer is 4 months stale** and misrepresents what's built. Any queue item written from the primer will target already-solved problems.
- **No dedicated voice profile page** — voice is editable only by resetting (sidebar overflow) and re-running the 4-step chat flow. There is no "view/edit my saved voice config" UI.
- The `ION_SYSTEM` / `ION_FULL_SYSTEM` constants at `src/features/ai/tools/package-generator.ts:22,102` are legacy brand naming (minor cosmetic debt, not a blocker).
- **Draft quality is unknown.** The route and card are wired, but whether the 4-step conversational capture produces enough voice signal to make drafts feel noticeably personal has not been verified in this research pass.

## Options

### Option A: Walk the flow and update the primer
- **What it is:** Open the Aion chat, complete the 4-step voice onboarding, go to a deal's Follow-Up Card, click "Draft message," read the output. Immediately after: update `planning-primer.md` to reflect the current shipped state.
- **Effort:** Small (30–60 min)
- **Main risk:** None to the codebase. If draft quality feels generic, that surfaces a real signal gap — but you'd still know.
- **Unlocks:** Grounded baseline for all future queue items; actual subjective quality assessment of the end-to-end pipeline.

### Option B: Add a voice profile settings page
- **What it is:** A `/settings/aion` or modal showing the three saved voice fields (`description`, `example_message`, `guardrails`) as editable text areas — readable, editable, saveable without going through chat. Could live under the sidebar's "Tune Aion's voice" item instead of resetting.
- **Effort:** Medium (2–3 days — new settings route, form, server action to patch `aion_config.voice`)
- **Main risk:** Duplicates capture logic that already exists in the chat flow; now has two write paths to maintain.
- **Unlocks:** Voice profile is inspectable and editable without clearing it. Useful if Daniel wants to make incremental adjustments.

### Option C: Improve onboarding signal capture
- **What it is:** Extend the `no_voice` onboarding prompt to ask for 2–3 concrete examples ("paste a message you actually sent") rather than a style description. Update `generateFollowUpDraft` to use examples as few-shot anchors. This improves draft fidelity without UI changes.
- **Effort:** Medium (1–2 days — prompt engineering + test against real drafts)
- **Main risk:** Anthropic prompt cost per draft increases with longer few-shot context.
- **Unlocks:** Drafts that match Daniel's actual tone rather than an approximation from a description.

## Recommendation

**Do Option A first, then decide.** The entire pipeline is shipped. The only unknown is whether the output is good enough to use in practice. Spend 30 minutes walking the end-to-end flow with a real deal. If the draft feels like it could have come from Daniel, update the primer and close the queue item — Phase A is done. If the draft feels generic despite the voice profile being saved, that is the signal to pursue Option C (few-shot examples), not to build more UI. Option B (settings page) is a quality-of-life improvement worth doing later, but it does not affect draft quality and should not be prioritized over verifying the pipeline actually works.

## Next steps for Daniel

1. Open the Aion chat in the app. If `aion_config.voice` is already set (from prior onboarding), use the sidebar overflow → "Tune Aion's voice" to reset and re-run it fresh.
2. Complete the 4-step onboarding. Be specific: paste a real message you sent a client, not a description of your style.
3. Go to a deal in the CRM with an active follow-up queue item. Open the Follow-Up Card.
4. Click "Draft message." Read the output. Ask: would you actually send this?
5. If yes — update `planning-primer.md` lines 107–112 to reflect that Phase A shipped and the chat onboarding is the mechanism. The "Brain tab is paused" note is obsolete.
6. If the draft is generic — add the question "How to improve Aion draft fidelity via few-shot examples?" to `## Active` in the queue and re-fire the agent.

## References

- `src/types/supabase.ts:7782` — `aion_config` column on `workspaces`
- `src/app/api/aion/chat/route/prompts.ts:275–283` — 4-step voice onboarding state machine
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/api/aion/draft-follow-up/route.ts:1–73` — draft generation route
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338–370` — `handleDraftMessage()` wiring
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002–1043` — voice reset path
- `src/app/api/cron/follow-up-queue/route.ts:199–208` — live `aion_config` read in cron
- `src/features/ai/tools/package-generator.ts:22,102` — legacy `ION_SYSTEM` constants (cosmetic debt)
