# Aion Phase A: voice setup + first draft — current state

_Researched: 2026-10-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How this was understood:** The planning primer pre-dates this work by ~6 months. The premise has been superseded. This doc maps what was actually built, where the original goal lands today, and what the real next step is.

## Current state

The entire Phase A infrastructure is live. The "paused Brain tab" and "missing aion_config" framing in the primer is from April 2026; it no longer reflects the codebase.

**Schema:** `public.workspaces.aion_config` exists as a JSONB column. It is read and written by `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` (`getAionConfig`) and `aion-config-actions.ts:178` (`saveAionVoiceConfig`). The `AionConfig` type covers `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, and `voice_default_derived`.

**Chat route:** `/api/aion/chat/route.ts` is a 200+ line production handler with auth (`route.ts:59`), per-user rate limiting (`route.ts:70`), tier gating (`route.ts:99`), model routing, tool-calling via Vercel AI SDK `streamText`, session scoping, and vocabulary injection.

**Onboarding state machine:** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` defines a 5-state machine (`no_voice` → `no_example` → `no_guardrails` → `needs_test_draft` → `configured`). `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts:301` returns a different cold-open per state — the `no_voice` greeting asks about communication style with three chips; `needs_test_draft` offers a test draft.

**Chat tools:** `save_voice_config` (`tools/core.ts:118`) and `draft_follow_up` (`tools/core.ts:318`) are both live in the chat toolset. `save_voice_config` persists description/example/guardrails and can mark onboarding complete; `draft_follow_up` fetches the top follow-up queue item and calls `generateFollowUpDraft`.

**Draft generation:** `/api/aion/draft-follow-up/route.ts` and `src/app/api/aion/lib/generate-draft.ts` are both live. Voice config is injected into the system prompt at `generate-draft.ts:35`. Tone anchoring from actual sent messages runs in parallel (`tone-anchoring.ts`).

**The bypass:** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` (`applyVoiceDefaultIfEmpty`) synthesizes a voice from the workspace name for any workspace with no stored voice, and marks `voice_default_derived: true`. `getOnboardingState` (`aion-chat-types.ts:247`) returns `'configured'` immediately when that flag is set. This was a deliberate Wk 11 §3.8 decision to avoid forcing new users through a 4-step block before they can use Aion.

## Intended state

From the queue item: Daniel opens the Brain tab, writes 3 paragraphs describing how he talks to clients, and immediately sees a draft follow-up message that sounds like him.

The onboarding state machine was built exactly for this — it is a conversational 3-step setup (style → example → guardrails → test draft). The infrastructure to produce a voice-informed draft at step 4 is complete and wired.

The design intent from Wk 11 is that explicit tuning is opt-in: new workspaces get a synthesized default and can start chatting. Owners who want to tune their voice go through the sidebar overflow → "Tune Aion's voice" → `resetAionVoiceConfig` → next open triggers `no_voice`.

## The gap

- The 3-paragraph voice setup flow exists and works, but a new user never encounters it by default. The synthesized-default bypass routes every new workspace straight to `configured`. The tuning path lives in the sidebar overflow.
- The `needs_test_draft` step calls `draft_follow_up`, which requires at least one deal in `ops.follow_up_queue`. An owner with zero deals gets a graceful "No deals in the follow-up queue" error instead of a real draft — an anticlimactic end to onboarding.
- The planning primer is 6 months stale. Every entry in the "current notable state" block is wrong, causing research agents (and potentially Daniel) to plan for work that is already done.

## Options

### Option A: Validate and surface the existing flow
- **What it is:** Reset `aion_config` for a test workspace to empty, walk through the onboarding flow manually, confirm the test draft renders and sounds correct. Then add a single entry-point card on `/aion` (or in settings) that says "Teach Aion your voice" for workspaces where `voice_default_derived === true`.
- **Effort:** Small (half a day of testing + a UI nudge)
- **Main risk:** If the `needs_test_draft` empty-queue case is hit during validation, the flow feels broken even though the infra is correct.
- **Unlocks:** Confidence that Phase A actually works end-to-end; discoverable path for Daniel to teach Aion his voice without hunting through sidebar overflows.

### Option B: Seed a test deal before the onboarding draft step
- **What it is:** When `needs_test_draft` fires and the queue is empty, synthesize a fictional deal stub for the draft (no DB write) and use it as the draft context. Returns a demo draft using the owner's voice even with zero real data.
- **Effort:** Medium (modify `draft_follow_up` tool in `tools/core.ts:318` + add fallback context builder)
- **Main risk:** A fictional draft may set false expectations. Owners might confuse it for a real action item.
- **Unlocks:** Clean onboarding all the way through even for day-0 workspaces; the voice becomes testable immediately.

### Option C: Update the planning primer
- **What it is:** Rewrite `planning-primer.md` to reflect October 2026 state — remove the "Brain tab paused / aion_config missing" entry, replace with an accurate summary of what Phase A built and where the live gaps actually are.
- **Effort:** Small (30 minutes)
- **Main risk:** None — pure information update.
- **Unlocks:** Every future research-agent run starts from correct context. Prevents more wasted cycles researching already-shipped work.

## Recommendation

Do Option C first (30 minutes), then Option A (half a day). Option B is worth doing eventually but is blocked by a product judgment Daniel needs to make — does a fictional draft feel helpful or misleading?

The primer update is the highest-leverage immediate action: every future run that starts with wrong context wastes research cycles. After that, validate the onboarding flow end-to-end by manually resetting voice config on a test workspace and walking through all 5 states. The one concrete gap to fix during validation is the `needs_test_draft` empty-queue edge case — add a fallback that surfaces at least the empty-state message clearly, with a CTA to "Add your first deal to the CRM" so the flow doesn't just error out.

Option B (fictional draft) is worth doing only after Daniel decides he wants the voice-setup path to work independently of deal data. If Unusonic always requires deals first, Option A's empty-state CTA is sufficient.

## Next steps for Daniel

1. **Update `planning-primer.md`**: Remove the "current notable state" block's three wrong entries about the Brain tab, aion_config, and the API route stub. Replace with: "Phase A complete as of Wk 11. Brain tab at `/aion` is live. `aion_config` exists on `public.workspaces`. Voice onboarding state machine (5 states) is active but bypassed for new workspaces by default via `synthesizeDefaultVoice`."
2. **Manually test the onboarding flow**: In the Supabase dashboard, set `aion_config = NULL` (or `{}`) on your workspace row and clear `voice_default_derived`. Open `/aion` — you should see the `no_voice` greeting.
3. **Walk through all 5 states**: Describe your style → provide example message → state guardrails → confirm test draft. Note any friction or bugs.
4. **Fix the empty-queue case in `needs_test_draft`**: If your queue is empty, `draft_follow_up` returns an error. Either seed one deal into the queue for testing, or add a UI fallback message in the `needs_test_draft` greeting at `route/prompts.ts:338`.
5. **Add a "Teach Aion your voice" nudge**: Add a surface entry-point (a card or a chip in the lobby greeting) for workspaces where `aion_config.voice_default_derived === true`, pointing toward the Sidebar overflow "Tune Aion's voice" action or a direct route to reset. This closes the discoverability gap.
6. **Decide on fictional draft (Option B)**: After testing, decide whether `needs_test_draft` should work with zero deal data. If yes, spec the fictional deal stub and build it.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config read/write, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` type, `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting` (per-state cold-opens)
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config`, `draft_follow_up` tools
- `src/app/api/aion/lib/generate-draft.ts` — voice injection into draft prompt
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft API route
