# Aion Phase A: voice setup and first follow-up draft

_Researched: 2026-06-08 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Important caveat:** The queue item's premises are outdated. The research found both pre-conditions to be resolved already.

`public.workspaces.aion_config` **exists.** It was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` as a `jsonb NOT NULL DEFAULT '{}'` column. The TypeScript type is at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` and includes `voice` (`AionVoiceConfig`), `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived` flags.

`AionVoiceConfig` (`aion-config-actions.ts:12–16`) has three fields: `description` (writing style), `example_message` (sample draft), and `guardrails` (constraints like "never invent prices").

The **voice setup flow exists.** It runs as a 4-step conversational onboarding inside `ChatInterface.tsx`. It is no longer forced on first chat; instead, `AionSidebar.tsx:973–979` renders a "Tune Aion's voice" option in the sidebar settings menu, which calls `resetAionVoiceConfig()` and instructs the user to start a new chat to re-enter the flow. A synthesized default is generated at first use by `synthesizeDefaultVoice(workspaceName)` in `aion-config-helpers.ts:20–27`.

The **draft-follow-up API exists.** `src/app/api/aion/draft-follow-up/route.ts:62` reads `aionConfig.voice` and injects it into `generateFollowUpDraft()`. `getDealContextForAion()` is fully implemented in `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545–611` and assembles deal + client + proposal context for each draft request.

The **Brain tab components are built.** `ChatInterface.tsx` (808 lines), `AionInput.tsx` (227 lines), and `AionVoice.tsx` (140 lines) all exist and appear fully wired. The primer's note that the Brain tab was "paused" predates the current codebase state by roughly two months.

One genuine legacy item remains: `src/features/ai/tools/package-generator.ts:22–34` still uses `ION_SYSTEM` and `ION_FULL_SYSTEM` constant names. Low risk but the brand rule flags it.

## Intended state

Daniel opens the Brain tab for the first time, sees a visible prompt that invites him to describe how he communicates with clients (not buried in a sidebar menu), fills it in, and the next follow-up draft generated for any deal reflects that voice. The loop should be completable in under 3 minutes with no navigation away from the Brain tab.

## The gap

- Voice setup is **discoverable only via a sidebar settings menu** ("Tune Aion's voice"), not surfaced as a first-run prompt when the Brain tab is empty.
- New workspaces get a synthesized default voice (`voice_default_derived: true`) so they appear configured — drafts work but the voice is generic, not Daniel's actual voice.
- No in-tab confirmation that voice was saved or that the next draft will use it.
- `ION_SYSTEM` / `ION_FULL_SYSTEM` in `package-generator.ts:22–34` violates brand rules (minor, separate fix).

## Options

### Option A: Do nothing — treat the core ask as shipped

- **What it is:** The infrastructure is complete. Voice works once you find it. Accept that "Tune Aion's voice" in the sidebar is sufficient discoverability for a sophisticated user like the founder.
- **Effort:** Small (zero)
- **Main risk:** The value of the voice config never gets realized because real users (production company owners) don't discover it until they notice drafts feel off.
- **Unlocks:** Nothing new; existing flow remains as-is.

### Option B: First-run voice prompt inside the Brain tab

- **What it is:** When the Brain tab loads and `voice_default_derived === true` (or no voice config at all), render a small setup card above the chat input — "Aion doesn't know your voice yet. Describe how you communicate with clients." with a textarea and a "Save voice" button. On submit, write directly to `aion_config.voice` via the existing `updateAionVoiceConfig()` server action (`aion-config-actions.ts`). On save, immediately generate a sample draft for the most recent deal so Daniel sees it working.
- **Effort:** Small (1–2 days: UI card, hook into existing save action, trigger sample draft)
- **Main risk:** The textarea approach (3 paragraphs of freeform prose) diverges from the structured `AionVoiceConfig` schema (`description` / `example_message` / `guardrails`). Needs a parse or mapping step.
- **Unlocks:** Voice setup becomes impossible to miss; first-use activation rate goes to near 100%.

### Option C: Conversational voice onboarding on first chat (re-force the 4-step flow)

- **What it is:** Restore the forced 4-step conversational flow (`onboarding_state` gating in `chat/route.ts:122–174`) for all workspaces where `voice_default_derived` is still true. The chat thread walks Daniel through the three `AionVoiceConfig` fields conversationally before responding to any other message.
- **Effort:** Small–medium (re-enable the gate that was explicitly turned off, verify state transitions still work)
- **Main risk:** The forced flow was deliberately disabled (`AionSidebar.tsx:973–979` comment explains the decision). Re-forcing it creates friction for repeat users who just want to chat. Needs a "skip" path.
- **Unlocks:** Structured voice data collected via conversation rather than a form; pairs naturally with the `learned` config that accumulates over time.

## Recommendation

**Option B, scoped tight.** The infrastructure is done — this is purely a discoverability and activation problem. A small first-run card in the Brain tab is the fastest path to the outcome described in the queue item (open tab → configure voice → see a draft that reflects it). It does not require changing the existing save action or the draft API.

The one complication: Daniel's intent is to "write 3 paragraphs" of freeform prose, but `AionVoiceConfig` wants three distinct fields. The right move is to accept the freeform prose as the `description` field and leave `example_message` and `guardrails` either blank (filled later) or auto-generated from the prose via a single `generateText` call on save — one extra step that keeps the schema intact.

Defer Option C. The conversational flow was turned off for a reason. If the textarea card proves insufficient, the 4-step flow is still there to resurrect; don't add the forced gate back without user testing evidence.

The `ION_SYSTEM` rename in `package-generator.ts` is a 2-minute fix; handle it in the same PR or separately, but don't let it block this.

## Next steps for Daniel

1. Check `src/app/(dashboard)/(features)/aion/page.tsx` (or equivalent Brain tab page) to confirm what's currently rendered when no voice is configured — this is the insertion point for the setup card.
2. Add a `VoiceSetupCard` component (small, co-located) that reads `aion_config.voice_default_derived` and renders the freeform textarea when true.
3. On submit, call `updateAionVoiceConfig()` from `aion-config-actions.ts` with `{ description: prose, voice_default_derived: false }`.
4. After save, call `/api/aion/draft-follow-up` for the workspace's most recent deal (or prompt the user to navigate to a deal). Surface the draft inline so the feedback loop is immediate.
5. Rename `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts:22–34` to `AION_SYSTEM` / `AION_FULL_SYSTEM` while you're in that area.
6. Manual test: fresh workspace → Brain tab → fill textarea → confirm draft uses the provided voice style.

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — `AionConfig` / `AionVoiceConfig` types
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20–45` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–1007` — "Tune Aion's voice" settings entry
- `src/app/api/aion/draft-follow-up/route.ts:62` — voice injection into draft generation
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545–611` — `getDealContextForAion`
- `src/app/api/aion/chat/route.ts:122–174` — onboarding gating (4-step flow, currently non-forced)
- `src/features/ai/tools/package-generator.ts:22–34` — `ION_SYSTEM` legacy rename
