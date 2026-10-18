# Aion Phase A: voice setup + first real draft

_Researched: 2026-07-07 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** Both stated blockers no longer exist. The research below describes what actually shipped between April and July 2026, then identifies the real remaining gap.

## Current state

**`public.workspaces.aion_config` exists.** It is a JSONB column read and written by `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94` (`getAionConfig`) and mutated via `saveAionVoiceConfig` (line 178), `resetAionVoiceConfig` (line 214), and `updateAionConfigForWorkspace` (line 262). The stored shape is `AionConfig` with a `voice` sub-object (`description`, `example_message`, `guardrails`), a `learned` sub-object, a `follow_up_playbook`, and a `voice_default_derived` flag.

**The chat route is a full tool-calling implementation.** `/api/aion/chat/route.ts` runs `streamText` against Claude, with 15+ tools across `core.ts`, `writes.ts`, `knowledge.ts`, `entity.ts`, `production.ts`, and `analytics.ts`. The "16-line stub" is gone.

**The onboarding state machine is implemented.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines `getOnboardingState` — a 5-state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts:292` returns a tailored first-message for each state, including voice-style chips for `no_voice`.

**Voice is injected into draft generation.** The `draft_follow_up` tool in `src/app/api/aion/chat/tools/core.ts:318` calls `buildDraftPrompt` (line 36) which injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt. The standalone `/api/aion/draft-follow-up/route.ts:60` does the same via `generateFollowUpDraft`.

**The "Tune Aion's voice" reset exists.** `AionSidebar.tsx:1002` exposes `resetAionVoiceConfig` in a sidebar header overflow menu, clearing `voice` and `voice_default_derived`, so the next chat cold-open returns the `no_voice` greeting.

**The Wk 11 §3.8 bypass is in effect.** `aion-config-helpers.ts:35` (`applyVoiceDefaultIfEmpty`) synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` short-circuits to `'configured'` on line 248 when this flag is set. New workspaces skip the 4-step onboarding entirely.

## Intended state

A new workspace owner opens the Aion chat, describes how they write (3 paragraphs, or via chips), and within that session sees Aion generate a follow-up draft that matches their described style — no settings pages, no sidebar hunting.

The conversational infrastructure for this (onboarding greetings, `update_aion_config` tool, `draft_follow_up` tool, `draft_preview` content block) is fully wired. The only piece missing is the entry point that routes new workspaces into the onboarding flow rather than bypassing it.

## The gap

- New workspaces get `voice_default_derived: true` from `applyVoiceDefaultIfEmpty`, so `getOnboardingState` immediately returns `'configured'` — they never see the voice-setup greeting.
- The escape hatch (`resetAionVoiceConfig` → sidebar overflow → "Tune Aion's voice") is buried and undiscoverable without prior knowledge.
- The `NEW_WORKSPACE_STARTERS` in `AionLandingStarters.tsx:48` do not include a voice-setup CTA, so the landing pane gives no signal that voice setup is available or valuable.
- No direct path from "describe my style" to "show me a draft" without knowing to ask Aion explicitly.

## Options

### Option A: Add a voice-setup CTA to the new-workspace landing pane
- **What it is:** Add a "Set up Aion's voice" button to `AionLandingStarters` (visible when `voice_default_derived === true`) that calls `resetAionVoiceConfig` then triggers a new session. The next greeting fires the `no_voice` flow as designed. Everything downstream already works.
- **Effort:** Small — one CTA component added to `AionLandingStarters.tsx`, one server action call. No API changes.
- **Main risk:** Button requires a full session reset (`resetAionVoiceConfig` + re-load), which feels clunky. The transition from the button click to the onboarding greeting needs care.
- **Unlocks:** The designed 4-step conversational onboarding for new workspaces, with zero backend work.

### Option B: Condition the Wk 11 bypass on outbound message history
- **What it is:** Modify `getOnboardingState` (or the chat route that calls it) to treat `voice_default_derived` as `configured` only when the workspace has sent outbound messages. New workspaces with 0 outbound history enter the `no_voice` flow automatically, regardless of the synthesized default.
- **Effort:** Medium-small — a message-count query in the chat route's `workspace-data.ts`, passed into `getOnboardingState`. Requires care not to re-trigger onboarding for workspaces that intentionally skipped it.
- **Main risk:** Adds a DB query to every chat cold-open. Also, workspaces with real message history but no explicit voice may need to opt back in, complicating the flag semantics.
- **Unlocks:** Automatic onboarding for workspaces that have genuinely never set up voice. No UI change required.

### Option C: Dedicated voice setup step in the Aion settings page
- **What it is:** Add a "Voice setup" section to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` with three labelled textareas (style description, example message, guardrails). On save, calls `saveAionVoiceConfig` and redirects to `/aion`. A test draft button calls `/api/aion/draft-follow-up` client-side against the top-priority deal and renders the result inline.
- **Effort:** Medium — form UI, server action wiring, inline draft preview. 4–6 hours.
- **Main risk:** Creates two voice-setup surfaces (settings form + chat onboarding). The conversational path is the canonical design; the form becomes a second source of truth to maintain.
- **Unlocks:** The explicit "3 paragraphs → draft" UX the queue item envisions, as a form rather than a conversation.

## Recommendation

**Option A.** The full path already works — voice-setup greeting, conversational style capture, test draft, config save. The only job left is pointing new workspace owners toward it.

Add a "Set up Aion's voice" CTA at the bottom of `NEW_WORKSPACE_STARTERS` in `AionLandingStarters.tsx`. When clicked, it calls `resetAionVoiceConfig` (server action, already exists) then calls `startNewChat` from `useSession` (already available in the chat surface). The next session greeting will be `no_voice`: "How would you describe your style?" with the three chips. From there the conversational onboarding runs as designed, ending with `needs_test_draft` → `draft_preview`.

Option B is architecturally cleaner long-term but adds query complexity for a case (new workspaces) that is temporary by definition — once they complete setup, the bypass is irrelevant. Option C duplicates the voice surface without adding capability.

Accept the tradeoff: Option A's "reset + new session" transition is slightly awkward (the chat scrolls to empty state), but it reuses the full designed flow with zero backend risk.

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx:48` — add a fourth entry to `NEW_WORKSPACE_STARTERS`: `{ label: "Set up Aion's voice", value: '__voice_setup__' }`.
2. In the `AionLandingStarters` renderer, detect the `__voice_setup__` sentinel — instead of dispatching as a chat message, call `resetAionVoiceConfig()` (import from `aion-config-actions`) and then `startNewChat()` (from `useSession`).
3. Pass `isVoiceDefaultDerived: boolean` prop to `AionLandingStarters` from `ChatInterface`; show `NEW_WORKSPACE_STARTERS` only when `true`. The parent already reads `aionConfig` from the session context — check if `voice_default_derived` is exposed there, otherwise add it to the session init payload from the chat route.
4. Smoke-test: create a workspace, open `/aion`, confirm the "Set up Aion's voice" CTA appears; click it, confirm the `no_voice` greeting fires; describe a style; ask "draft a follow-up for my top deal"; confirm the `draft_preview` card appears with matching voice.
5. After the first successful draft, the user approves via Aion chat → `save_voice_config` with `onboarding_complete: true` → state moves to `configured` → next session shows the pull-mode greeting.
6. Check that the CTA disappears after voice is explicitly configured (i.e., `voice_default_derived` is no longer set after `saveAionVoiceConfig` runs — verify line 190 of `aion-config-actions.ts` strips the flag).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding branch in `buildSystemPrompt`; `:292` — `buildGreeting`
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx:48` — `NEW_WORKSPACE_STARTERS`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — existing "Tune Aion's voice" reset affordance
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft route (auth + tier gate + voice injection)
