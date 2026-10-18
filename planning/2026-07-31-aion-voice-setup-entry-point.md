# Aion Phase A: Voice setup entry point and first real draft

_Researched: 2026-07-31 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of
`docs/reference/follow-up-engine-design.md`). Specifically: given the Brain
tab is currently paused and `public.workspaces.aion_config` doesn't exist,
what's the minimum path to unblock voice setup + first real draft? Context:
the goal is to have Daniel open the Brain tab, write 3 paragraphs about how
he talks to clients, and immediately see an Aion-generated follow-up draft
that respects that voice.

**Note on stale premise.** The primer (dated 2026-04-10) is significantly
behind the code. Most Phase A infrastructure is built. The research below
documents actual state.

## Current state

**`aion_config` exists and is wired end-to-end.** `public.workspaces.aion_config`
is a live `Json` column (`src/types/supabase.ts:7782`). The `AionConfig` type
(`aion-config-actions.ts:50`) includes `voice: AionVoiceConfig` with three
string fields: `description`, `example_message`, `guardrails`.

**The draft pipeline is complete.** `POST /api/aion/draft-follow-up`
(`src/app/api/aion/draft-follow-up/route.ts:21`) reads
`aionConfig.voice` and passes it to `generateFollowUpDraft()`
(`src/app/api/aion/lib/generate-draft.ts:25`). `buildFollowUpPrompt()`
(`generate-draft.ts:52`) injects all three voice fields into the system
prompt. The "Draft with Aion" button in `follow-up-card.tsx:338` already
hits this API.

**The onboarding state machine is built but bypassed.** `getOnboardingState()`
(`aion-chat-types.ts:247`) defines five states:
`no_voice → no_example → no_guardrails → needs_test_draft → configured`.
However, `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35`) runs on
every config read and synthesizes a generic voice from the workspace name,
then sets `voice_default_derived: true`. Because `getOnboardingState()` returns
`'configured'` immediately when that flag is set (`aion-chat-types.ts:248`),
new workspaces are silently routed past the 4-step flow and drafted against
a generic placeholder.

**Voice write path exists but has no direct UI entry.** `saveAionVoiceConfig()`
(`aion-config-actions.ts:178`) is a fully-implemented server action. The
only surface that calls it is the chat-driven onboarding flow, which is
blocked as described above. `resetAionVoiceConfig()` (`aion-config-actions.ts:214`)
exists and is surfaced in the Aion sidebar overflow as "Tune Aion's voice,"
but only discoverable by users who already know to look there.

**`/settings/aion` has no voice section.** `AionSettingsView.tsx` covers the
deal-card beta consent toggle, cadence learning opt-in, pending requests, and
memory backfill — nothing about voice config.

## Intended state

Daniel opens the Aion settings (or a clear in-app prompt), writes a short
description of how he talks to clients, an example message, and guardrails.
He saves. He then opens any deal's Follow-Up card, clicks "Draft with Aion,"
and sees a draft that sounds like him, not like a generic SaaS template. The
synthesized-default bypass should only activate when no UX entry point has
ever been visited — not as a permanent skip.

## The gap

- No dedicated UI for writing voice config. `saveAionVoiceConfig()` has no form caller.
- New workspaces get a synthesized generic default that bypasses the onboarding state machine entirely.
- The "Tune Aion's voice" reset trigger is buried in the sidebar overflow — not discoverable.
- The 4-step chat-driven onboarding flow is unreachable without first calling `resetAionVoiceConfig()`.

## Options

### Option A: Voice section in `/settings/aion`

- **What it is:** Add a `VoiceConfigForm` component to `AionSettingsView.tsx`
  with three labeled textareas (`description`, `example_message`, `guardrails`)
  that calls `saveAionVoiceConfig()` on submit. Show current values if already
  set. Detect `voice_default_derived: true` and display a "This is a generated
  placeholder — edit it to match your style" banner.
- **Effort:** Small (new component, existing server action, no schema work)
- **Main risk:** Settings is not where Daniel is going when he wants to draft.
  He still has to bounce between settings and the follow-up card to see the effect.
- **Unlocks:** Immediately usable. Explicit. The draft button works with real
  voice from the next click. The onboarding state machine can stay as-is.

### Option B: In-chat setup on first open (stop bypassing the state machine)

- **What it is:** Change `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35`)
  to not set `voice_default_derived: true` for workspaces whose config has never
  been explicitly touched. The chat route's onboarding forcing block then runs
  naturally — Aion asks the three questions in sequence and calls
  `saveAionVoiceConfig()` via a tool. Add a fallback: if the user ignores the
  questions for >3 turns, synthesize and set `voice_default_derived`.
- **Effort:** Small-medium (change to `applyVoiceDefaultIfEmpty`, verify the
  chat route's forcing-block tool wiring, write test for the 5-state machine)
- **Main risk:** The forcing block in the chat route needs to actually call a
  tool to persist the voice — that wiring may not be complete. Risky to ship
  without verifying the full loop.
- **Unlocks:** Organic onboarding that matches the design intent. No separate
  settings form needed. Personalization happens in the same surface where drafts
  are requested.

### Option C: Inline voice prompt in the follow-up card

- **What it is:** When `voice_default_derived: true` (or voice is empty), show
  a one-line prompt in `follow-up-card.tsx` above the "Draft with Aion" button:
  "Using a generic voice — [set your style]" linking to `/settings/aion#voice`.
  Pair with Option A for the form destination.
- **Effort:** Tiny (4–6 lines added to the card component)
- **Main risk:** Adds a permanent nudge that could feel noisy once voice is set.
  Needs conditional rendering on `voice_default_derived`.
- **Unlocks:** Discovery at the exact moment of use. Works as an enhancement
  to Option A, not a replacement.

## Recommendation

**Option A + Option C together.** Option A solves the missing form in under
half a day. Option C adds the discovery hook where it matters — at the draft
button, not in a settings page the user has to think to visit. Together they
create a complete path: Daniel sees the nudge on the follow-up card, clicks
it, lands on the settings voice form, writes his style, saves, comes back, and
the next draft reflects his actual voice.

Option B is the right long-term shape but carries unknown risk (the 4-step
chat-route forcing block needs verification before shipping). Save it for the
next iteration once the form-based path proves out what users actually write in
`description`.

The tradeoff accepted: two surfaces (settings + card nudge) instead of one
(in-chat). The payoff is certainty — the server action is proven, the form is
simple, and the effect is immediate and testable in one session.

## Next steps for Daniel

1. Read `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` to understand
   the current settings page layout. The voice form goes below the consent block.
2. Build `VoiceConfigForm` component in
   `src/app/(dashboard)/settings/aion/VoiceConfigForm.tsx` — three textareas
   (description / example message / guardrails), call `saveAionVoiceConfig()` on
   submit, read current values from a `getAionConfig()` call in the parent page.
3. Wire the form into `AionSettingsView.tsx` (import + render after the cadence
   learning section). Detect `voice_default_derived` from `AionConfig` to show
   the "generated placeholder" banner.
4. In `follow-up-card.tsx` around line 338, add a conditional inline prompt
   above the "Draft with Aion" button when `voice_default_derived === true`:
   link to `/settings/aion#voice`.
5. Add `id="voice"` anchor to the voice form section in `AionSettingsView.tsx`
   so the deep-link from the card lands in the right spot.
6. Manually test: clear `aion_config` for your workspace in the Supabase SQL
   editor, reload, open a deal's follow-up card, follow the nudge, fill in the
   form, return, click "Draft with Aion," verify the draft sounds like your input.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig` type (line 12), `saveAionVoiceConfig` (line 178), `resetAionVoiceConfig` (line 214)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice` (line 20), `applyVoiceDefaultIfEmpty` (line 35)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState` (line 247), `OnboardingState` (line 225)
- `src/app/api/aion/draft-follow-up/route.ts` — full route, voice injection (line 62)
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` voice injection (lines 63–75)
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx` — "Draft with Aion" button (line 338)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page (no voice form)
