# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-11-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

> **Important:** The planning primer is severely outdated. It describes the system as of 2026-04-10. As of November 2026, Phase A is complete. Everything the question asked to build has shipped.

The codebase has advanced significantly beyond the primer's description:

- **`aion_config` exists** on `public.workspaces`. Full type system: `voice` (`description`, `example_message`, `guardrails`), `learned` (vocab swaps, patterns), `follow_up_playbook`, `kill_switch`, `voice_default_derived`. `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–74`.

- **Chat route is fully built.** `src/app/api/aion/chat/route.ts` — 464 lines. Auth-gated, tier-gated, model-routed (fast/standard/thinking tiers), streaming, tool-calling loop (up to 10 steps), session summarization.

- **Voice setup onboarding is wired.** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) drives the chat greeting and system prompt at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` and `src/app/api/aion/chat/route/prompts.ts:284–295`. Each state has distinct greetings and chip options.

- **`draft_follow_up` tool exists** in `src/app/api/aion/chat/tools/core.ts:318` and is called from the chat in the `needs_test_draft` onboarding state. The underlying `generateFollowUpDraft` lib at `src/app/api/aion/lib/generate-draft.ts` is voice-aware — it injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt.

- **`/api/aion/draft-follow-up` route** is auth-gated, tier-gated, and voice-aware.

- **Learn-from-edit route** (`src/app/api/aion/learn-from-edit/route.ts`) is fully built — extracts vocabulary swaps and patterns from draft edits and writes them back to `aion_config.learned`.

- **Tone anchoring** (`src/app/api/aion/lib/tone-anchoring.ts`) is built — three-tier fallback (recipient-specific → workspace-wide → default) from `ops.messages` outbound history.

The one open thread: `voice_default_derived: true` is set for workspaces whose stored voice was empty. `getOnboardingState()` returns `'configured'` for these, so the 4-step onboarding never fires for them. The workspace gets a synthesized voice from its name, not Daniel's own words.

## Intended state

The queue item described: Daniel writes his voice → Aion drafts a follow-up that reflects it. That is fully implemented for workspaces that go through the explicit onboarding flow. The gap is that **new workspaces skip it entirely** via auto-synthesis. The "Tune Aion's voice" affordance in the Aion sidebar's overflow menu exists (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31`) but it is buried — the only reset path.

## The gap

- New workspaces get `voice_default_derived: true` and go straight to `configured`. Daniel may never know the explicit voice setup flow exists.
- The `/settings/aion` page (`AionSettingsView.tsx`) covers only the card beta consent and cadence opt-in. There is no dedicated voice configuration UI.
- No prominent in-product affordance invites Daniel to write his own voice paragraphs; the entry point is a small overflow menu item.
- The primer in `planning-primer.md` is out of date by ~7 months and will mislead future research runs.

## Options

### Option A: Update the primer and add a real next question

- **What it is:** Update `planning-primer.md` to reflect the Nov 2026 system state (Aion chat fully built, voice onboarding complete, `aion_config` live). Then add a targeted follow-up question to the queue (e.g. "What is the next meaningful unbuilt Aion capability?").
- **Effort:** Small (1–2 hours).
- **Main risk:** Still doesn't address the discoverability gap.
- **Unlocks:** Future research runs work from accurate context instead of a stale baseline.

### Option B: Add an explicit voice-setup surface to settings

- **What it is:** Add a "Voice" section to `/settings/aion` with a form for `description`, `example_message`, and `guardrails`. Pre-fills from stored config (or synthesized default). Save calls `saveAionVoiceConfig`. This gives Daniel a direct, non-chat path to write his 3 paragraphs and see the config saved.
- **Effort:** Medium (3–5 hours: form UI, save action wiring, test).
- **Main risk:** Duplicates the in-chat onboarding flow. Two surfaces for the same config can diverge.
- **Unlocks:** Voice config becomes a first-class settings item, not a hidden chat ritual. Makes the primer's original goal achievable without navigating the sidebar overflow.

### Option C: Surface a voice-setup prompt on the Aion page for derived-default workspaces

- **What it is:** When `voice_default_derived === true`, render a soft banner or empty-state affordance on `/aion` ("Aion is using a default voice — tell me how you actually write") that routes into the existing in-chat onboarding flow via `resetAionVoiceConfig`. No new form; reuses the built 4-step flow.
- **Effort:** Small (1–2 hours: banner/chip on the Aion page, one RPC call).
- **Main risk:** Still relies on the chat-driven onboarding flow, which requires 4 turns and a live deal to draft against.
- **Unlocks:** The explicit voice-setup flow becomes discoverable without duplicating the form.

## Recommendation

**Option A first, then Option C.** The primer must be updated — if it stays stale, every future research run will burn tokens re-discovering what already exists. That is a quick, high-leverage fix.

Then Option C: add a soft prompt on the `/aion` page for `voice_default_derived === true` workspaces. It reuses the existing 4-step onboarding and `draft_follow_up` tool — no new UI surface, no duplication risk. The discoverability gap closes with a one-screen addition.

Option B adds a standalone settings form, which is a valid long-term home for voice config, but duplicating the config surface before the in-chat flow is exercised enough to know its rough edges is premature. Build Option C first; promote to a settings form once the chat-based version has been used for a few weeks.

## Next steps for Daniel

1. **Check the primer:** `planning-primer.md` — the "current notable state" block is from April 2026. Update it to reflect what actually exists (Aion chat live, `aion_config` wired, voice onboarding complete, `learn-from-edit` and tone anchoring shipped).
2. **Try the existing voice setup:** In the Aion sidebar overflow menu, tap "Tune Aion's voice" → this resets `voice_default_derived` and opens the 4-step chat flow. Send the 3 paragraphs in response to the prompts; at step 4 say "Yes, try one" to get a test draft.
3. **Ship the discoverability fix (Option C):** When `voice_default_derived === true`, show a one-line prompt on the `/aion` page (e.g. `AionLandingStarters.tsx` or a banner above the input). Clicking it calls `resetAionVoiceConfig` and sends a synthetic `no_voice` greeting.
4. **Add the next real Aion question to the queue** — Phase A is done. What's next? Candidates: improving the `needs_test_draft` to auto-pick a deal instead of asking, wiring the `learn-from-edit` callback from the Follow-Up Card's edit textarea, or surfacing the follow-up playbook.
5. **Replace the primer's "current notable state" block** so future research runs have an accurate baseline.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` and the 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding forcing block per state
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection
- `src/app/api/aion/learn-from-edit/route.ts` — pattern extraction from draft edits
- `src/app/api/aion/lib/tone-anchoring.ts` — observed-tone preamble (separate from `voice_config`)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the bypass)
