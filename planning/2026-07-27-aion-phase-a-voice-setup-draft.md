# Aion Phase A: Minimum Path to Voice Setup + First Real Draft

_Researched: 2026-07-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premises in the queue item are outdated.** Phase A infrastructure is substantially shipped.

`aion_config` EXISTS. Column defined at `supabase/migrations/20260101000000_baseline_schema.sql:15058` (`jsonb DEFAULT '{}'`), typed at `src/types/supabase.ts:7782`. The `AionVoiceConfig` type (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`) has exactly three fields: `description`, `example_message`, `guardrails` — which maps cleanly to "3 paragraphs about how I talk to clients."

`/api/aion/draft-follow-up` EXISTS. Full authenticated route at `src/app/api/aion/draft-follow-up/route.ts`. Auth → tier gate → loads `aion_config.voice` → calls `generateFollowUpDraft` → returns `{ draft, channel }`. The Follow-Up Card at `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348` already calls this endpoint in production.

The 4-step chat-native onboarding EXISTS. When `getOnboardingState` returns `no_voice`, the chat route system prompt (`src/app/api/aion/chat/route/prompts.ts:275–282`) guides the user through description → example → guardrails → test draft, then calls `save_voice_config` with `onboarding_complete: true`. The full `draft_follow_up` tool is wired at `src/app/api/aion/chat/tools/core.ts:318`.

`saveAionVoiceConfig` and `resetAionVoiceConfig` server actions exist at `aion-config-actions.ts:178` and `214`. "Tune Aion's voice" appears in the sidebar overflow menu at `AionSidebar.tsx:1043` — it calls `resetAionVoiceConfig` to re-enter the chat-native 4-step flow.

**What does NOT exist:** a standalone Brain tab route or page. The `Brain` icon at `ChatInterface.tsx:4` is used only for the "Thinking" model mode button — not a Brain tab. `CadenceLearningToggle.tsx:14` mentions the Brain tab in a comment as a future home, confirming it was planned but never implemented.

The "Brain Mode is paused — waiting for timeline engine" message in the primer does not appear as a literal string anywhere in the current codebase — it was accurate at the time the primer was written (April 2026) and has since been superseded.

## Intended state

Daniel opens a dedicated Brain page, fills in three labeled text fields (communication style, example message, guardrails), saves, and immediately sees a generated follow-up draft using the most recent deal context. The experience feels deliberate — a configuration surface, not a chatbot conversation. The follow-up cron and the chat interface both pick up the saved `aion_config.voice` and adjust their output accordingly.

## The gap

- No `/aion/brain` (or equivalent) route or page exists.
- Voice setup is buried in the sidebar overflow menu ("Tune Aion's voice"), re-entering via chat. Low discoverability; chat-as-input-form is awkward for 3 structured paragraphs.
- No dedicated "Generate sample draft" affordance outside of the chat conversation itself.
- "Brain" does not appear in sidebar navigation.

## Options

### Option A: Ship the Brain page (thin wrapper over existing infrastructure)

- **What it is:** New route `/aion/brain` or `/settings/aion/voice`. Three labeled textareas (communication style, example message, guardrails). Save button calls `saveAionVoiceConfig`. "Preview draft" button calls `POST /api/aion/draft-follow-up` with the workspace's most recent deal context and renders the returned `{ draft, channel }` inline. All data infrastructure already exists.
- **Effort:** Small (1 day: page + form + preview fetch + nav item)
- **Main risk:** Need to surface a recent deal to make the preview meaningful; if the workspace has no deals, the draft preview is generic.
- **Unlocks:** Exactly the experience described in the queue item. Future Brain settings (cadence learning toggle, memory controls) have a natural home.

### Option B: Improve discoverability of the existing chat-native flow

- **What it is:** Don't build a new page. Surface "Set up Aion's voice" as a prominent card on the chat empty state / landing starters (replacing the hidden sidebar overflow menu item). The 4-step flow already works; this just makes it easier to find.
- **Effort:** Small (half day: landing card + tweak sidebar)
- **Main risk:** Writing 3 structured paragraphs through a chatbot conversation still feels less deliberate than a form. The "aha moment" is weaker. Harder to revisit and edit individual fields later.
- **Unlocks:** Better discovery with no new routes. Lower surface area.

### Option C: Verify + fix the existing chat flow first, defer the page

- **What it is:** Before building anything, run the actual `no_voice` → draft flow end-to-end in the real app. Reset your own workspace via "Tune Aion's voice," enter the 4-step onboarding in chat, and confirm the draft generates correctly. Build the Brain page only if the chat flow has a bug or the UX is genuinely insufficient.
- **Effort:** Near zero (30-minute test) + Option A or B afterward if gaps found
- **Main risk:** Costs a test cycle before any user-facing improvement ships.
- **Unlocks:** Ground truth on what's actually broken vs. just undiscoverable.

## Recommendation

Build the Brain page (Option A). The infrastructure investment has already been made — `aion_config.voice`, `saveAionVoiceConfig`, and `/api/aion/draft-follow-up` are all production-ready. The only missing piece is the form surface. A day of work delivers the exact "open Brain tab → write 3 paragraphs → see a draft" experience the queue item describes, and it gives every future brain-layer feature (`CadenceLearningToggle`, memory controls, playbook tuning) a permanent home.

The chat-native flow (Option B) is good for ongoing re-tuning — users can say "update my tone" in chat — but it's a poor onboarding surface. Filling in three specific fields through a back-and-forth conversation buries the intent behind the UX.

The tradeoff being accepted: a modest amount of new UI code that duplicates what the chat can already do. Worth it for the discoverability and the clean "this is where Aion gets configured" mental model.

## Next steps for Daniel

1. Read `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–15` to confirm the three `AionVoiceConfig` field names before building the form (`description`, `example_message`, `guardrails`).
2. Create `src/app/(dashboard)/(features)/aion/brain/page.tsx` — three labeled `<textarea>` elements, one per field. Load current config via `getAionConfig()` server action on page load so existing values pre-fill.
3. Wire the save button to `saveAionVoiceConfig(voice)` — it already exists, just call it.
4. Add "Generate preview" button: fetch `POST /api/aion/draft-follow-up` with `{ workspaceId, context: <most recent deal context> }`. The Follow-Up Card at `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348` shows the pattern for building `AionDealContext`.
5. Render the returned `{ draft, channel }` in a read-only panel below the form. An empty-state message if no deals exist: "Add a deal to see a personalized draft."
6. Add "Brain" nav item to the Aion sidebar (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx`).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12` — `AionVoiceConfig` shape
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/api/aion/draft-follow-up/route.ts` — ready to call
- `src/app/api/aion/chat/route/prompts.ts:275` — how the chat-native flow handles `no_voice`
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348` — existing caller of draft-follow-up; pattern for `AionDealContext`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:979` — 4-step onboarding note; `1043` — "Tune Aion's voice" menu item
- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column
