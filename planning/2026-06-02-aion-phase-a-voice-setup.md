# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-06-02 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: This question was written against the 2026-04-10 primer. The code has advanced significantly. The framing below reflects what is actually true today._

## Current state

**`aion_config` is live.** `public.workspaces.aion_config` exists and is fully operational. `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads and writes it. `AionConfig` type at line 50 holds `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

**Voice setup flow is live — but conversational, and effectively bypassed.** A 5-state onboarding machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) lives in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. The `buildGreeting()` function at `src/app/api/aion/chat/route/prompts.ts:292` walks new workspaces through it via the Aion chat. However, `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` pre-fills a synthetic default voice on every read when no explicit voice is stored, setting `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:247` short-circuits to `configured` on that flag. This means new workspaces never enter the 4-step conversational flow — they get an auto-voice and skip straight to pull-mode.

**Draft follow-up is live.** `/api/aion/draft-follow-up/route.ts` is auth-gated, tier-gated, and injects `aionConfig.voice` via `buildFollowUpPrompt()` at `src/app/api/aion/lib/generate-draft.ts:52`. Voice description, example message, and guardrails all feed the prompt.

**Learn-from-edit is live.** `/api/aion/learn-from-edit/route.ts` extracts vocabulary patterns from user edits and writes them back to `aion_config.learned`.

**No standalone voice setup UI exists.** `/settings/aion/` (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx:33`) handles deal-card beta consent and cadence learning — not voice setup. The `CadenceLearningToggle` component comment at `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` says "can live inside the Brain tab" — indicating the Brain tab is planned but unbuilt. The only explicit voice tuning entry point is the sidebar overflow → "Tune Aion's voice" (`resetAionVoiceConfig()` at `aion-config-actions.ts:214`), which clears the synthesized default and re-enters the conversational flow.

## Intended state

Daniel opens a dedicated voice setup surface (the "Brain tab" or a settings section), writes freely about how he communicates with clients — style, example messages, rules — saves it, and immediately gets a live draft against a real active deal. The voice he wrote should be visibly reflected in the draft. From that point forward, every follow-up Aion generates respects that voice. The current synthesized default is silent and invisible; the intended state is explicit and owned.

## The gap

- No form UI for `voice.description`, `voice.example_message`, `voice.guardrails` — fields exist, server actions exist, UI does not.
- Synthesized default bypasses onboarding silently. Daniel has no indication his "voice" is a generic placeholder unless he digs into sidebar settings.
- No "test draft" affordance that calls `/api/aion/draft-follow-up` on demand from a settings surface.
- `CadenceLearningToggle` has no permanent home (comment says it "can live in the Brain tab").

## Options

### Option A: Voice form inside `/settings/aion/`
- **What it is:** Add a `VoiceSetupSection` component to `AionSettingsView.tsx` — three labeled textareas (`description`, `example_message`, `guardrails`), a save button calling `saveAionVoiceConfig()`, and a "Test on a draft" link that navigates to `/aion` with a pre-loaded prompt.
- **Effort:** Small. The server action, data model, and draft generation route all exist. This is pure UI.
- **Main risk:** The test draft requires fetching a real deal's context (`AionDealContext`). Easiest path is routing to `/aion` and letting the chat handle it rather than calling `/draft-follow-up` directly from settings.
- **Unlocks:** Daniel can write his voice in one explicit place. Synthesized defaults remain a fallback, not the primary path.

### Option B: Dedicated Brain settings page at `/settings/aion/voice`
- **What it is:** A new route with the full voice form plus an inline draft preview that calls `/api/aion/draft-follow-up` against the top active deal after save. `CadenceLearningToggle` also moves here.
- **Effort:** Medium. New page route, `getDealContext` wiring from settings context, inline draft rendering.
- **Main risk:** A second Aion settings page splits the surface. Navigation discovery requires the settings nav to add an entry.
- **Unlocks:** Clean separation between "configure Aion" and "use Aion." Matches the "Brain tab" framing exactly.

### Option C: In-chat voice discovery prompt
- **What it is:** When `voice_default_derived === true`, surface a non-blocking notice in the Aion empty-state below the landing starters — "Aion is using a default voice. Personalize it." — that links to `/settings/aion/`. No new route. The conversational 4-step flow remains as an alternative path.
- **Effort:** Small. One conditional block in `ChatInterface.tsx`'s empty state, one `AionLandingStarters.tsx` addition.
- **Main risk:** Still no form. Daniel clicks through to `/settings/aion/` and finds no voice editing there (under Option C alone). This only works if combined with Option A.

## Recommendation

**Ship Option A first.** It is the minimum viable Brain tab: a voice form with save + route-to-test, contained in the existing `/settings/aion/` page, requiring zero new routes or data plumbing. Then add Option C's discovery notice so Daniel actually finds it.

The test-draft handoff should work like this: after saving voice config, show a "See how it sounds" button that navigates to `/aion` with a pre-populated message (`?prompt=Draft+a+test+follow-up+for+my+top+priority+deal`). The chat route handles model selection, deal context lookup, and streaming — no new wiring needed.

Option B is the right long-term destination but not the unblocking step. The goal of Phase A is one successful pass through the loop: write voice → see draft that sounds like you. Option A achieves that in a day of UI work.

## Next steps for Daniel

1. Add `VoiceSetupSection.tsx` to `src/app/(dashboard)/settings/aion/` — three `<textarea>` fields loading from `getAionConfig()` server-side, saving via `saveAionVoiceConfig()`.
2. Wire the section into `AionSettingsView.tsx` (render above cadence learning, below the beta consent block).
3. Add a "See how it sounds" `<a>` after save that links to `/aion?prompt=Draft+a+test+follow-up+for+my+top+priority+deal`. Handle the `?prompt` param in `AionPageClient.tsx` the same way `?openPin` is handled today (`src/app/(dashboard)/aion/AionPageClient.tsx:17`).
4. In `ChatInterface.tsx` empty state, conditionally render a one-line notice when `voice_default_derived` is true: "Aion is using a default voice." with a link to `/settings/aion`. Gate the data fetch server-side in `AionPageClient`.
5. Manually test: open `/settings/aion/`, write three sentences, save, click "See how it sounds," confirm the Aion draft sounds different from the generic default.
6. Consider clearing `voice_default_derived` from `synthesizeDefaultVoice()` after step 1 ships — once a real form exists, the silent default is more confusing than helpful.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-state machine
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — live follow-up draft endpoint
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings surface to extend
- `src/app/(dashboard)/aion/AionPageClient.tsx` — `?openPin` deep-link pattern to reuse
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding state injection into system prompt
