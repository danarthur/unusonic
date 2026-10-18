# Aion Phase A — Voice Setup + First Draft: Current State

_Researched: 2026-08-10 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was written against the codebase state from the planning primer (circa early April 2026). The two premises — "Brain tab is paused" and "aion_config doesn't exist" — are both false today. The research below reflects what actually exists as of 2026-08-10, and reframes the question accordingly._

## Current state

The full pipeline is already built. Here is what exists:

**`aion_config` on `workspaces`** — fully typed. `getAionConfig()` reads `workspaces.aion_config` and returns `AionConfig` (which holds `voice.description`, `voice.example_message`, `voice.guardrails`, `learned`, `follow_up_playbook`, `onboarding_state`). See `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84-100`.

**Five-state onboarding machine** — implemented in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257`. States: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route reads onboarding state on every turn and injects the appropriate forcing block into the system prompt (`src/app/api/aion/chat/route/prompts.ts:275-283`).

**`save_voice_config` chat tool** — wired in `src/app/api/aion/chat/tools/core.ts:118-144`. When onboarding prompts the model to ask about style and the user responds, the model calls this tool, which writes to `workspaces.aion_config` via `updateAionConfigForWorkspace`.

**`draft_follow_up` chat tool** — wired at `src/app/api/aion/chat/tools/core.ts:318+`. After voice is configured, the model calls this tool to produce a draft from an active deal. It delegates to `/api/aion/draft-follow-up`, which calls `generateFollowUpDraft` and injects voice config into the system prompt (`src/app/api/aion/lib/generate-draft.ts:52-76`).

**Brain tab is live** — `AionPageClient.tsx` renders a full `ChatInterface` with session management, `AionInput`, `AionVoice`, and the sidebar. The `/api/aion/chat` route is fully auth'd, tier-gated, and model-routing.

**Voice-reset entry point** — `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1043`. A Mic2 icon in the sidebar header overflow menu labeled "Tune Aion's voice" calls `resetAionVoiceConfig()`, which clears the stored voice and re-enters the `no_voice` state.

## Intended state

Per the queue item: Daniel opens Brain, describes his client-communication style in a few paragraphs, and sees an Aion-generated follow-up draft for an active deal that matches that voice.

Every backend piece for this exists. The only friction is discoverability: new workspaces receive a synthesized default voice (`voice_default_derived = true`) via `applyVoiceDefaultIfEmpty` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45`), so `getOnboardingState()` returns `'configured'` on first open — bypassing the 4-step chat flow entirely. The user must manually find "Tune Aion's voice" in the sidebar overflow to enter the setup flow.

## The gap

- New workspace: synthesized default voice fires → onboarding state is `configured` → the 4-step chat flow never appears on first open.
- "Tune Aion's voice" entry point is in a sidebar overflow menu (Mic2 icon, ~1000 lines deep in AionSidebar). Discoverable only if you know to look.
- No in-page prompt or landing CTA tells a new user that their voice is a synthesized placeholder and they can tune it.
- If the user never resets, draft quality is generic (workspace name, no example, no guardrails).

## Options

### Option A: Document and ship nothing

- **What it is:** Recognize the flow is fully built; update the primer and close the ticket. Daniel can try the full loop today via Sidebar overflow → "Tune Aion's voice" → 4-step chat.
- **Effort:** Small (doc update only)
- **Main risk:** Nobody discovers the tuning flow organically. Voice stays synthesized for most workspaces. Draft quality is mediocre.
- **Unlocks:** Nothing new — but confirms the backend is shippable.

### Option B: Add a voice-setup CTA to the Aion landing starters

- **What it is:** In `AionLandingStarters.tsx`, detect `voice_default_derived === true` (pass as a prop from the page server component that already reads config). Render a "Set up your voice" card above the general starters. Tapping it calls `resetAionVoiceConfig()` and refreshes the session — the next greeting fires `no_voice`, starting the 4-step flow.
- **Effort:** Small (~2 files: `AionLandingStarters.tsx` + the server layout that passes the prop)
- **Main risk:** Prop-threading requires reading `aion_config` in the page server component. Low complexity; the server component already exists at `src/app/(dashboard)/aion/`.
- **Unlocks:** First-time users see a clear "tune your voice" prompt. Draft quality improves as soon as they engage.

### Option C: Remove synthesized-default entirely; force 4-step onboarding for new workspaces

- **What it is:** In `getAionConfig()`, stop calling `applyVoiceDefaultIfEmpty`. New workspaces start with `no_voice`. The onboarding flow fires on first chat open without any explicit reset needed.
- **Effort:** Small code change, medium risk audit
- **Main risk:** Any workspace that never completed setup (because the synthesized default covered them) now sees the forced onboarding flow on next open. Could feel like a regression for established users who were comfortable with the generic voice. Needs a migration filter (e.g., only apply if `created_at` is recent).
- **Unlocks:** Voice is always explicitly authored before any draft is generated.

## Recommendation

**Option B.** The synthesized default is a sensible safety net — it prevents blank-voice drafts for workspaces that never bother with setup. Removing it (Option C) risks surprising established users. But the current discoverability (buried overflow menu) means the stated goal — "open Brain, describe style, see draft" — requires prior knowledge of a hidden affordance.

A landing CTA is the smallest delta: one conditional block in `AionLandingStarters.tsx`, one prop from the server layout, and the full backend pipeline starts delivering value. The 4-step chat flow already handles everything from there.

Tradeoff: Option B only helps users who land on the Aion page with an empty thread. Users who already have chat history see the landing starters fade out after their first message. Longer-term, the sidebar "Tune Aion's voice" item should be more prominent (icon badge, tooltip) — but that's a separate polish pass, not a blocker.

## Next steps for Daniel

1. Verify the current flow works today: go to Aion → sidebar → Mic2 icon → "Tune Aion's voice" → describe style in 3 messages → check that draft quality changes.
2. Open `src/app/(dashboard)/aion/page.tsx` (or its layout) and confirm it is a server component that can read `getAionConfig()`.
3. Add a `voiceIsDefault: boolean` prop to `AionLandingStarters.tsx` (`src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx`).
4. In the `AionLandingStarters` render, when `voiceIsDefault === true`, prepend a "Set up your voice" card with a button that calls `resetAionVoiceConfig()` (import from `aion-config-actions`) and calls `router.refresh()`.
5. Thread the prop from the server layout: call `getAionConfig()`, check `config.voice_default_derived === true`, pass to the client component.
6. Test: fresh workspace → Brain tab opens → "Set up your voice" card appears → click → 4-step voice flow fires → pick active deal → draft generated respecting voice.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84-100` — `getAionConfig`, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty` (synthesized default)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState` (5-state machine)
- `src/app/api/aion/chat/route/prompts.ts:275-283` — onboarding state injection into system prompt
- `src/app/api/aion/chat/tools/core.ts:118-144` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318+` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:52-76` — `buildFollowUpPrompt` (voice injection)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1043` — "Tune Aion's voice" overflow entry point
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab client root
