# Minimum path to Aion voice setup + first real draft

_Researched: 2026-05-06 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premises:** The primer (dated 2026-04-10) is out of date on two key points. `aion_config` already exists. The main Aion API is already a full orchestrator. Details below.

## Current state

`public.workspaces.aion_config` already exists as a `Json` column (`src/types/supabase.ts:7689`). The full type is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` and includes `voice: AionVoiceConfig` (`{ description, example_message, guardrails }`), learned vocabulary, playbook rules, and onboarding flags.

The voice config layer is complete:
- `saveAionVoiceConfig(voice)` — `aion-config-actions.ts:178`
- `resetAionVoiceConfig()` — `aion-config-actions.ts:214` (called from sidebar "Tune Aion's voice")
- `synthesizeDefaultVoice(workspaceName)` — `aion-config-helpers.ts` (auto-runs on first visit)
- `save_voice_config` chat tool — `chat/tools/core.ts:53` (Aion can update voice mid-conversation)
- `config` intent — `lib/models.ts:95` ("Voice setup, teach me, remember this")

The Aion API is not a stub. `/src/app/api/aion/chat/route.ts` (451 lines) is a fully authenticated streaming orchestrator with intent classification, model routing (`fast`/`standard`/`heavy`), tool calling, rolling summarization, and Aion-event logging. `/src/app/api/aion/draft-follow-up/route.ts` (74 lines) already exists and returns `{ draft, channel }`.

What is missing: a UI surface for the "write 3 paragraphs → get structured voice config → see draft" flow. The current voice entry points are: (a) first-visit synthesis from workspace name, and (b) `resetAionVoiceConfig()` in the sidebar settings menu — which clears and re-synthesizes but opens no form. `AionSettingsView.tsx` exists (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) but has no voice setup section.

## Intended state

Daniel opens a voice setup surface, pastes or types free-form prose describing how he communicates with clients (tone, vocabulary, what to avoid), submits, and immediately sees a real follow-up draft rendered in that voice against an actual open deal. The underlying fields are `description` (style summary), `example_message` (one message in his voice), and `guardrails` (what Aion must never do). The extraction from prose → these three fields is a one-shot LLM call, not a guided multi-turn conversation.

## The gap

- No UI for free-text voice description → `AionVoiceConfig` extraction
- No server action to do the one-shot extraction (prose → `{ description, example_message, guardrails }`)
- No draft preview shown after voice save
- Sidebar "Tune Aion's voice" calls `resetAionVoiceConfig()` directly with no form — users can't actually write their own config today

## Options

### Option A: Conversational setup via existing chat
- **What it is:** User opens Aion, types "Set up my communication style." The `config` intent routes it. Aion asks 2–3 questions, then calls `save_voice_config` tool. No new UI surfaces.
- **Effort:** Small — mostly prompt work in the config intent handler, ~50 lines
- **Main risk:** Discovery problem and experience mismatch — multi-turn conversation delays the "write once, see draft" payoff; the sidebar affordance would still need to change
- **Unlocks:** Voice config writeable via chat for power users who find it

### Option B: Voice setup section in Settings > Aion with prose extraction
- **What it is:** Add a "Your communication style" section to `AionSettingsView.tsx` with a textarea and "Save and preview" button. On submit, a server action calls Claude one-shot to extract `AionVoiceConfig` from the prose, saves it via `saveAionVoiceConfig()`, then calls `draft-follow-up` for the workspace's most recent open deal. Render the result with the existing `DraftPreviewCard.tsx`.
- **Effort:** Medium — new settings section, one extraction server action (~30 lines + prompt), draft preview wiring
- **Main risk:** Graceful fallback when no open deal exists (generate a synthetic preview instead)
- **Unlocks:** Self-contained voice setup with immediate proof it's working; retune path lives in the same place

### Option C: First-visit onboarding step in AionOnboardingShell
- **What it is:** Add a voice setup step inside `src/features/onboarding/ui/aion-onboarding-shell.tsx` for workspaces that haven't set `aion_config.voice` explicitly. Same prose → extract → preview flow.
- **Effort:** Medium — step wiring inside existing onboarding state machine
- **Main risk:** Only catches new workspaces; existing workspaces or anyone wanting to retune still needs a settings path, so you'd need to build Option B anyway
- **Unlocks:** New workspace onboarding includes voice setup natively

## Recommendation

Option B. Settings is already the designated retune entry point (sidebar "Tune Aion's voice" can navigate to `/settings/aion#voice` instead of blindly resetting). The extraction server action is the only genuinely new piece of infrastructure — a ~30-line function that calls Claude with a structured prompt asking it to output `description`, `example_message`, and `guardrails` from free-text prose. The draft preview is a thin layer over the already-built `/api/aion/draft-follow-up` route and the already-built `DraftPreviewCard` component. No schema changes needed.

Option A (conversational) breaks the stated UX goal — five turns of back-and-forth before seeing a draft isn't the same as "write 3 paragraphs, see result." Option C is a good eventual addition but not the starting point, since it leaves the retune path unsolved.

## Next steps for Daniel

1. Add a "Your communication style" section to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` with a `<textarea>` and a "Save and preview" button.
2. Create a server action `extractVoiceConfig(prose: string): Promise<AionVoiceConfig>` using the Anthropic SDK — single call, structured output: `{ description, example_message, guardrails }`.
3. Chain to `saveAionVoiceConfig(extracted)` on submit (`aion-config-actions.ts:178`).
4. After save, call `/api/aion/draft-follow-up` for the workspace's most recent open deal. If no open deal exists, construct a minimal synthetic context and call it anyway.
5. Render the returned draft using `DraftPreviewCard.tsx` inline in the settings section.
6. Update `AionSidebar.tsx:1043` so "Tune Aion's voice" navigates to `/settings/aion#voice` rather than calling `resetAionVoiceConfig()` directly (or adds a retune confirmation before reset).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config types and all config actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — synthesis helpers
- `src/app/api/aion/draft-follow-up/route.ts` — existing draft generation route
- `src/app/api/aion/chat/route.ts` — main chat orchestrator (tools, intent routing)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page to extend
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982–1051` — "Tune voice" sidebar entry
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — reusable draft preview
- `src/types/supabase.ts:7685–7813` — workspaces table, aion_config column
