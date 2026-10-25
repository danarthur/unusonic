# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-10-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premises:** This question was filed against the April 2026 primer, which described the Aion system as a 16-line unauthenticated stub with no `aion_config` column and a paused Brain tab. As of October 2026, the situation is substantially different. The research below reflects actual code, not the primer.

## Current state

The system described in the question is fully shipped. Specifically:

**`aion_config` exists.** The column lives on `public.workspaces` and is read/written by `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:92`. The type is `AionConfig` with `voice: { description, example_message, guardrails }`, `learned`, `follow_up_playbook`, `kill_switch`, `voice_default_derived`, and `onboarding_state`.

**The onboarding voice-setup flow is implemented.** `getOnboardingState()` at `aion-chat-types.ts:247` drives a 5-state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state has a tailored cold-open greeting (`prompts.ts:308–342`) that asks Daniel for exactly the information the queue item describes.

**The draft pipeline is live.** `/api/aion/draft-follow-up/route.ts` handles authenticated requests, injects `aionConfig.voice` into `generateFollowUpDraft()` (`generate-draft.ts:25`), and returns a draft tuned to the workspace voice. The tone-anchoring system (`tone-anchoring.ts:60`) additionally pattern-matches from actual sent messages as a three-tier fallback.

**The reset path exists.** `AionSidebar.tsx:31` imports `resetAionVoiceConfig` and exposes it via a "Tune Aion's voice" affordance in the sidebar overflow (`Mic2` icon). Calling it clears `voice` + `voice_default_derived`, which causes the next cold-open to enter the `no_voice` state and kick off the 4-step interview.

**The chat route is fully authenticated and model-routed.** `src/app/api/aion/chat/route.ts` is a ~460-line streaming endpoint with auth, rate limiting, tier gating, intent classification, tool assembly, and rolling session summarization.

## Intended state

Per the queue item: Daniel opens the Aion tab, writes 3 paragraphs about how he talks to clients, and immediately sees a follow-up draft that respects that voice.

The design-doc intent (inferred from the onboarding state machine and `buildGreeting`) is that new workspaces get a synthesized default voice from the workspace name (`aion-config-helpers.ts:20`), which skips the forcing block so they can start chatting immediately. Owners who want to explicitly tune their voice use the sidebar overflow to reset and re-enter the 4-step flow. The test draft step (`needs_test_draft`) offers to generate a draft from an active deal with one chip tap.

## The gap

The infrastructure is built. The only gaps are operational:

- **Primer is 6 months stale.** The queue item was filed against outdated state. No code work is needed to reach the described goal.
- **Voice default bypasses onboarding for all workspaces.** `applyVoiceDefaultIfEmpty()` synthesizes a voice from the workspace name and sets `voice_default_derived: true`, which causes `getOnboardingState()` to return `'configured'` immediately. Daniel cannot encounter the 4-step voice-setup conversation without first hitting "Tune Aion's voice" in the sidebar overflow.
- **Test draft requires an active deal.** The `needs_test_draft` greeting (`prompts.ts:340`) offers a chip that sends "Yes, draft a test message for my top priority deal." — but if the workspace has no deals, this silently fails or falls back to a generic response.
- **The sidebar reset affordance is easy to miss.** It lives in the `MoreHorizontal` overflow on the sidebar header — not obviously discoverable for a first-time tuning session.

## Options

### Option A: Try the existing flow end-to-end

- **What it is:** Reset voice config via the sidebar overflow, walk the 4-step onboarding conversation, use the test draft chip on an active deal. Validate the path works without code changes.
- **Effort:** Small — 20 minutes at the keyboard, no code.
- **Main risk:** Discovers a real bug or UX gap that's invisible from code alone (e.g. the `draft_follow_up` tool not being assembled for the `needs_test_draft` intent context, or a misfire in the onboarding chip flow).
- **Unlocks:** Confident understanding of what works and what doesn't before any code investment.

### Option B: Add a direct voice setup form in Settings → Aion

- **What it is:** A structured form (3 text areas: communication style, example message, guardrails) at `/settings/aion` that writes directly to `saveAionVoiceConfig`. Accepts free-form paragraphs rather than requiring a conversational exchange. The current `AionSettingsView.tsx` covers consent and cadence but not voice.
- **Effort:** Medium — a new settings section, 3 text areas, the save action already exists.
- **Main risk:** Duplicates the conversational flow; two paths that can diverge. The example message that Aion learns from a form is static, while the conversational path can extract and refine it over turns.
- **Unlocks:** The exact UX the queue item describes: "open a tab, write 3 paragraphs, done." Works without needing to explain the sidebar overflow affordance.

### Option C: Surface voice onboarding as a first-run modal or Aion welcome screen

- **What it is:** When `voice_default_derived === true` (workspace has never explicitly tuned voice), show a one-time inline prompt in the Aion page: "Aion is using a default voice — want to tune it?" with a CTA that calls `resetAionVoiceConfig` and opens the chat. Makes the "Tune Aion's voice" intent discoverable without requiring the sidebar overflow.
- **Effort:** Small-medium — a conditional banner or overlay in `AionPageClient.tsx`, the reset action already exists.
- **Main risk:** Adds noise to the Aion page for workspaces that are happy with the synthesized default. Needs to be shown once and then suppressed.
- **Unlocks:** Discoverability of the existing conversational setup flow without adding a second path.

## Recommendation

**Do Option A first, then Option C.**

The system is built. Spend 20 minutes validating the end-to-end path before writing any code. Specifically: hit the sidebar overflow, reset the voice, walk the 4-step chat conversation, use the test draft chip on a real deal. This will surface any actual bugs (the `draft_follow_up` tool routing under `needs_test_draft` is the most likely failure point) faster than code inspection can.

If Option A succeeds, the only remaining problem is discoverability — and Option C (a one-time "tune your voice" banner on the Aion page for `voice_default_derived` workspaces) is the minimal fix. It requires no new form, no schema changes, and doesn't duplicate the conversational flow. It just makes the reset path visible.

Skip Option B. A form adds a second source of truth for voice config, splits the experience, and doesn't meaningfully improve on what a 3-question chat conversation already does.

## Next steps for Daniel

1. Open `/aion` in the app. Click the `MoreHorizontal` (three-dot) icon at the top of the session sidebar. Confirm "Tune Aion's voice" appears as a menu item.
2. Click "Tune Aion's voice". Start a new chat. Confirm the greeting is the `no_voice` variant ("Hey, I'm Aion… how would you describe your style?") not the pull-mode warm greeting.
3. Walk through all 3 steps (style → example message → guardrails). Confirm each response triggers `save_voice_config` (check Network tab or watch for config state updating between turns).
4. At the `needs_test_draft` greeting, tap "Yes, try one". Confirm a real draft appears that references a deal and matches the voice you described.
5. If any step silently fails or produces the wrong greeting, note the exact step and check the `/api/aion/chat` response body for the `configUpdates` field — that's the signal that the save tool fired.
6. If everything works, update `planning-primer.md` lines 107–110 to reflect current state. If a step fails, that failure is the actual Phase A task.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:284–295` — onboarding state injected into system prompt
- `src/app/api/aion/chat/route/prompts.ts:308–342` — onboarding greeting variants
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint with voice injection
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` with voice config injection
- `src/app/api/aion/lib/tone-anchoring.ts` — 3-tier tone matching from outbound message history
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — `resetAionVoiceConfig` import, sidebar overflow affordance
