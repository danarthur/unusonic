# Aion Phase A: Voice Setup to First Real Draft

_Researched: 2026-11-12 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premises in this question are outdated.** The codebase has moved significantly since April 2026. As of November 2026:

The `aion_config` JSONB column exists on `public.workspaces` and is live. It holds an `AionVoiceConfig` shape (`description`, `example_message`, `guardrails`), a `learned` block, a `follow_up_playbook`, and a `kill_switch`. See `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`.

A 5-state onboarding machine is fully implemented: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `getOnboardingState` drives it; `buildSystemPrompt` injects per-state instructions; `buildGreeting` returns the matching cold-open copy. See `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` and `src/app/api/aion/chat/route/prompts.ts:284`.

`/api/aion/draft-follow-up` is a fully authenticated route with tier gating, voice injection, and `generateFollowUpDraft`. It is not a stub. See `src/app/api/aion/draft-follow-up/route.ts:1`. The chat's `draft_follow_up` tool calls the same logic and returns a `draft_preview` card in the chat. See `src/app/api/aion/chat/tools/core.ts:318`.

The `/aion` page renders a full `ChatInterface` via `AionPageClient.tsx:66`. There is no "paused" state at the route level.

**However, there is one bypass that breaks the described scenario.** `applyVoiceDefaultIfEmpty` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`) synthesizes a default voice from the workspace name and sets `voice_default_derived: true` on every cold read where no voice is stored. `getOnboardingState` treats `voice_default_derived === true` as `'configured'` (Wk 11 §3.8 — `aion-chat-types.ts:248`), so the 4-step onboarding forcing block never fires for new workspaces. The only entry point to explicit voice setup is "Tune Aion's voice" buried in a sidebar overflow icon (`AionSidebar.tsx:973`).

## Intended state

Daniel opens `/aion`, sees an obvious invitation to teach Aion his style, writes a free-form description (the "3 paragraphs" framing), optionally pastes an example message, sets any guardrails, and immediately sees a draft for a real deal that reflects what he wrote. The whole loop takes under 5 minutes and requires no digging in settings.

The conversational chat machinery for all of this is already built and working. The only thing missing is a first-open entry point that makes the voice setup flow reachable without discovering a hidden overflow menu.

## The gap

- `synthesizeDefaultVoice` bypasses onboarding for every new workspace — the 5-state flow never fires unless the user already knows about "Tune Aion's voice"
- "Tune Aion's voice" lives in a sidebar overflow icon (`SlidersHorizontal`, 15px) with no label — not discoverable on first visit
- The `needs_test_draft` state requires at least one deal in the follow-up queue; a workspace with no deals can't complete the last step
- There is no settings-page form alternative for owners who prefer to write rather than converse

## Options

### Option A: Dismissable first-open banner on `/aion`

- **What it is:** When `voice_default_derived === true`, render a one-time dismissable banner at the top of the Aion page: "Aion is using a placeholder voice for [workspace name]. Tune it to your style." One button calls `resetAionVoiceConfig` and the chat immediately shows the `no_voice` greeting. Dismissal stores a flag in `aion_config.onboarding_state` (e.g. `'banner_dismissed'`) so it doesn't reappear.
- **Effort:** Small — one new component, one `aion_config` read in the page server component, one flag write on dismiss.
- **Main risk:** `resetAionVoiceConfig` wipes the synthesized default; if the user dismisses the banner without tuning, they lose even the placeholder voice until they manually tune later. Could be mitigated by keeping the synthesized voice until explicit tuning starts.
- **Unlocks:** The exact described scenario with zero additional infrastructure.

### Option B: Voice setup card in settings (`/settings/aion/voice`)

- **What it is:** A new settings page with three textareas (`description`, `example_message`, `guardrails`). Submit calls `saveAionVoiceConfig` and redirects to `/aion`. On arrival at `/aion`, `voice_default_derived` is now false and the voice is set, so `getOnboardingState` returns `needs_test_draft` — the chat immediately offers a test draft.
- **Effort:** Medium — new page, form component, Zod validation, redirect logic.
- **Main risk:** Splits the setup experience from the conversational interface. The 3-paragraph form doesn't connect to the follow-up draft unless the user clicks through to `/aion` and asks for one.
- **Unlocks:** The specific "write 3 paragraphs" static-form experience; keeps `/aion` clean for returning users.

### Option C: Promote the sidebar overflow to a visible first-visit chip

- **What it is:** On the `no_voice` or `voice_default_derived` cold open, include a chip in the greeting suggestions: "Tune Aion's voice" (value: `I want to set up my voice.`). When selected, the chat transitions into the voice setup flow in-line without any UI changes.
- **Effort:** Small — add one chip to the `configured` greeting in `buildGreeting` when `voice_default_derived === true`.
- **Main risk:** Relies on the user seeing and understanding the chip. Less authoritative than a banner. Also requires that the `configured` greeting renders even when `voice_default_derived === true` — which it does, but the workspace snapshot greeting doesn't currently include a voice-tune path.
- **Unlocks:** A lower-friction entry without a new page, fully inside the existing chat model.

## Recommendation

**Option A with one tweak:** show the banner on first open but do NOT call `resetAionVoiceConfig` immediately — only call it when the user clicks "Tune my voice." If they dismiss without clicking, leave `voice_default_derived` intact (the synthesized voice keeps working). After they click, the chat opens to the `no_voice` greeting and the existing 5-step flow runs to completion.

This is the minimum viable path to the described scenario. The conversational onboarding, `save_voice_config`, `draft_follow_up`, and `needs_test_draft` greeting are all shipped and tested. The only code needed is a banner component, a one-line flag write on dismiss, and a client-side `resetAionVoiceConfig` call on the "Tune" button.

Option B is worth building afterward as a companion for owners who prefer forms over conversation, but it shouldn't block the first-open scenario.

## Next steps for Daniel

1. **Add a `voiceDefaultDerived` boolean prop to the Aion page server component** (`src/app/(dashboard)/aion/page.tsx`) by reading `aion_config.voice_default_derived` from `getAionConfig()`.
2. **Create a `VoiceSetupBanner` client component** that renders when `voiceDefaultDerived === true`. On "Tune my voice", call `resetAionVoiceConfig()` then `router.refresh()`. On "Not now", call `updateAionConfigForWorkspace(workspaceId, { onboarding_state: 'banner_dismissed' })` and hide.
3. **Gate the banner on `onboarding_state !== 'banner_dismissed'`** so dismiss is permanent.
4. **Test the full loop**: reset a workspace's `aion_config` to `{}` in the SQL editor, open `/aion`, banner appears → click "Tune my voice" → chat shows the `no_voice` greeting → describe style in 3 messages → Aion saves → reaches `needs_test_draft` → draft appears.
5. **Verify empty-workspace graceful fallback** in `needs_test_draft`: if `get_follow_up_queue` returns empty, Aion should offer to draft a hypothetical or redirect to adding a deal rather than showing an error.
6. **Optionally**, add a "Tell Aion how you write" textarea shortcut in `/settings/aion/` (Option B) as a follow-on, linking to `/aion` after save.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `updateAionConfigForWorkspace`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding state injection into system prompt
- `src/app/api/aion/chat/route/prompts.ts:310` — `buildGreeting` per-state cold opens
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft endpoint
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973` — hidden "Tune Aion's voice" overflow
