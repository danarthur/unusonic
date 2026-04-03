# Unusonic Onboarding & Subscription Architecture

## 1. Overview

This document describes the multi-step onboarding flow and database schema for tiered user profiles, subscription plans, and agentic AI configuration. It follows **Progressive Disclosure** to identify the user's professional persona and configure their workspace accordingly.

---

## 2. User Personas (Progressive Disclosure)

| Persona | Profile | Feature Emphasis |
|---------|---------|------------------|
| **Solo Professional** | Independent planners | 1:1 personalization, basic automation, Foundation tier default |
| **Agency / Team** | High-volume planners | Team collaboration, SMS triggers, standard reports, Growth tier default |
| **Venue / Brand** | Multi-location entities | PMS integration, geofenced scheduling, BEO, Studio tier default |

**Pathfinding logic:** During signup → onboarding, the user selects their persona before or alongside workspace creation. This drives:
- Default tier suggestion
- Agent config modules enabled
- UI mode (e.g. "On-Site Mode" for venues during events)

---

## 3. Subscription Tiers

*Updated 2026-04-02. Migrated from 4-tier (foundation/growth/venue_os/autonomous) to 3-tier per-seat model.*

| Tier | Base Price | Included Seats | Extra Seat | Active Shows | Aion Mode | Target |
|------|-----------|----------------|------------|-------------|-----------|--------|
| **Foundation** | $39/mo | 2 | $15/seat/mo | 5 | Passive (summaries, read-only insights) | Solo Pros |
| **Growth** | $99/mo | 5 | $15/seat/mo | 25 | Active (suggestions, triggered actions) | Agencies / Teams |
| **Studio** | $249/mo | 15 | $12/seat/mo | Unlimited | Autonomous (50 actions/mo, add-on for more) | Venues / Brands / High-volume |

**Per-seat billing:** Each tier includes a fixed number of seats. Additional team members beyond the included count are billed at the extra seat rate. Employee, freelancer, and client portal access is free and unlimited (seats only count workspace team members with owner/admin/member roles).

**Active show limits:** Foundation and Growth tiers cap the number of concurrent active shows (deals with status in the active pipeline). Studio is unlimited.

**Aion tiers:**
- **Passive** (Foundation) — Aion can summarize and surface insights but cannot take actions.
- **Active** (Growth) — Aion can suggest and execute triggered actions (e.g. follow-up reminders, crew dispatch).
- **Autonomous** (Studio) — Aion can operate independently within configured boundaries. 50 actions/month included; autonomous add-on available for additional capacity.

---

## 4. Onboarding Flow (Logic)

```
SignUp → /onboarding
         │
         ├─ Step 1: Identity (name, avatar)
         │
         ├─ Step 2: Persona (Progressive Disclosure)
         │           • Solo Professional | Agency/Team | Venue/Brand
         │           • Saves to profiles.persona
         │
         ├─ Step 3: Workspace (create or join)
         │           • Workspace name availability check inline
         │           • Arrow is the single CTA (no separate Create button)
         │
         └─ completeOnboarding → /lobby
                     • workspaces.subscription_tier defaults to 'foundation'
                     • Tier selection happens post-onboarding at /settings/plan
```

**Note (as of 2026-03-21):** Tier selection was removed from the onboarding wizard. The workspace is created with `subscription_tier = 'foundation'`. Users choose or upgrade their plan at `/settings/plan` after onboarding. A `PlanPromptBanner` on the lobby nudges first-time users to review their plan; it is dismissible and persisted via `localStorage` (`unusonic_plan_prompt_dismissed`).

**Event-driven triggers (post-login):**
- Login → parallel microservices: Data Mesh, Agent Orchestration, Vector DB (long-term memory)
- Workspace creation → agent_configs row with persona + tier
- Tier = studio → prompt Unusonic Pay (now configured at /settings/plan, not onboarding)

---

## 5. Database Schema

### Enums

```sql
subscription_tier: foundation | growth | studio
user_persona: solo_professional | agency_team | venue_brand
```

*Note: `venue_os` and `autonomous` were removed in migration `20260402120000`. Existing rows were remapped: `venue_os` → `studio`, `autonomous` → `studio`.*

### Tables Extended

**profiles**
- `persona` (user_persona)
- `onboarding_persona_completed` (boolean)
- `onboarding_tier_selected` (boolean)
- `onboarding_unusonicpay_prompted` (boolean)

**workspaces**
- `subscription_tier` (subscription_tier, default: foundation)
- `stripe_subscription_id` (text)
- `stripe_customer_id` (text)
- `extra_seats` (integer, default: 0) — seats purchased beyond tier's included count
- `billing_status` (text, default: 'active') — Stripe subscription status mirror
- `aion_actions_used` (integer, default: 0) — monthly Aion autonomous action counter
- `aion_actions_reset_at` (timestamptz) — next monthly reset timestamp
- `autonomous_addon_enabled` (boolean, default: false) — opt-in for additional Aion autonomous actions beyond tier limit
- `unusonicpay_enabled` (boolean)
- `autonomous_resolution_count` (integer) — legacy; retained for backward compat

### New Tables

**public.tier_config** *(read-only reference table)*
- `tier` (subscription_tier, PK)
- `label`, `base_price_cents`, `billing_interval`, `included_seats`
- `max_active_shows` (nullable — NULL = unlimited)
- `extra_seat_price_cents`, `aion_mode`, `aion_monthly_actions`
- Mirrors `TIER_CONFIG` in `src/shared/lib/tier-config.ts`. DB table is the authoritative source for billing enforcement; app-code constant is used for client-side display.

**agent_configs**
- `workspace_id` (FK → workspaces)
- `persona`, `tier`
- `xai_reasoning_enabled` (boolean) -- Explainable AI
- `agent_mode` (assist | autonomous | on_site) -- Usage-based UI
- `modules_enabled` (text[])

**autonomous_resolutions**
- `workspace_id`, `agent_name`, `task_type`
- `reasoning_chain` (jsonb) -- XAI trace
- `cost_cents` (100 = $1)
- `resolved_at`

### New RPCs (2026-04-02)

| Function | Purpose |
|---|---|
| `count_team_seats(p_workspace_id)` | Returns the number of workspace_members with role slug in (`owner`, `admin`, `member`). Used for seat limit enforcement. |
| `get_workspace_seat_limit(p_workspace_id)` | Returns `tier_config.included_seats + workspaces.extra_seats` for the workspace. |
| `count_active_shows(p_workspace_id)` | Returns the number of active deals (status not in `won`, `lost`, `archived`). Used for show limit enforcement. |

---

## 6. Agentic AI & UI Requirements

### Explainable AI (XAI)
- When AI performs an action (e.g. qualifying a lead), the UI must show **Reasoning Chains**
- Stored in `autonomous_resolutions.reasoning_chain`
- Onboarding should demonstrate a sample reasoning chain

### Agentic UX
- Interfaces are **Usage-Based**: adapt to user intent
- `agent_mode`: `assist` | `autonomous` | `on_site`
- "On-Site Mode" during events: geofenced, simplified UI

### Fintech (Unusonic Pay)
- 2.9% + 30¢
- Enables Autonomous tier
- Prompt during onboarding when tier = studio

---

## 7. Micro-Kernel Modality

The core platform is lightweight. Modules plug in based on subscription:

| Tier | Modules |
|------|---------|
| Foundation | CRM, Calendar, Proposals, basic Aion (passive) |
| Growth | + Team (5 seats), SMS, Reports, Aion active, custom roles, bulk dispatch |
| Studio | + Aion autonomous, multi-venue, geofencing, unlimited shows |

---

## 8. Plan Management — /settings/plan

The canonical location for tier selection and plan changes after onboarding.

**Files:**
- `src/app/(dashboard)/settings/plan/page.tsx` — server component; fetches workspace tier, persona, slug, seat/show usage.
- `src/app/(dashboard)/settings/plan/actions.ts` — `updateWorkspacePlan(tier)` server action (owner/admin only, revalidates path).
- `src/app/(dashboard)/settings/plan/components/PlanPageClient.tsx` — tier cards, Aion recommendation banner, Studio URL section, Autonomous add-on toggle.
- `src/app/(dashboard)/settings/plan/components/UsageBar.tsx` — seat and show usage progress bars with limit indicators.

**Billing integration files:**
- `src/shared/lib/tier-config.ts` — canonical tier constants (prices, seats, show limits, Aion modes). Mirrors `public.tier_config` DB table.
- `src/shared/lib/seat-limits.ts` — seat limit enforcement utilities. Queries `count_team_seats` and `get_workspace_seat_limit` RPCs.
- `src/shared/lib/show-limits.ts` — show limit enforcement utilities. Queries `count_active_shows` RPC against `getMaxActiveShows()`.
- `src/shared/lib/tier-gate.ts` — tier-to-capability gating. Maps each tier to a set of `TierCapabilityKey` strings. Provides `workspaceHasTierCapability()`, `requireTierCapability()`, and `getMinimumTierForCapability()`.
- `src/shared/lib/access-check.ts` — combined access check helper. Runs the role gate (capability-based permissions) and the tier gate in sequence. Single call to verify a user can perform a tier-gated action.
- `src/shared/api/stripe/subscription.ts` — Stripe subscription lifecycle (create, update, cancel). Wraps `stripe.subscriptions.*` with tier-aware price resolution.
- `src/features/intelligence/lib/aion-gate.ts` — Aion action gating. Checks workspace tier's Aion mode and monthly action budget before executing an Aion action.

**Upgrade prompt components:**
- `src/shared/ui/upgrade-prompt/` — `UpgradeBanner` (full-width bar), `UpgradeInline` (inline chip), `useUpgradePrompt` hook. Wired into `create-gig-modal` (show limit), team invite flow (seat limit), and lobby (`PlanPromptBanner`).

**PlanPromptBanner:** `src/app/(dashboard)/lobby/PlanPromptBanner.tsx` — shown above `LobbyBentoGrid` on the lobby page for users who have not dismissed it. Also surfaces billing warnings (approaching seat/show limits, billing status issues). Uses `localStorage` key `unusonic_plan_prompt_dismissed`. Dismissal is permanent (no expiry) — once dismissed, the banner does not reappear.

**Feature flag:** `ENABLE_STRIPE_BILLING` environment variable. When `false` (or unset), tier changes are saved to the DB but Stripe is not called. This allows development and testing of the tier system without a live Stripe integration. When `true`, all tier changes route through Stripe and webhook handlers manage subscription lifecycle events.

---

## 9. Two-Gate Access System

Access to any feature in Unusonic passes through two independent gates:

1. **Role gate** — Does the user's workspace role grant the required capability? Checked via `member_has_capability()` / `hasCapability()`. This is the existing capabilities-based permission system.
2. **Tier gate** — Does the workspace's subscription tier include the required tier capability? Checked via `workspaceHasTierCapability()` / `requireTierCapability()`.

Both gates must pass. A user with `admin` role on a Foundation workspace still cannot use custom roles (tier-gated to Growth+). A user on a Studio workspace without the `finance:view` capability still cannot see financials (role-gated).

**Tier capability keys** (registered in `permission-registry.ts`):
- `tier:aion:active` — Growth, Studio
- `tier:aion:autonomous` — Studio only
- `tier:custom_roles` — Growth, Studio
- `tier:advanced_reporting` — Growth, Studio
- `tier:bulk_dispatch` — Growth, Studio
- `tier:multi_venue` — Studio only
- `tier:geofencing` — Studio only

**Combined check:** `src/shared/lib/access-check.ts` runs both gates in a single call for server actions that need both.

---

## 10. Seat and Show Enforcement

**Seat enforcement** is checked at invite time (`inviteTeamMember` in `src/app/actions/workspace.ts`). The flow:
1. Call `count_team_seats` RPC to get current count (owner/admin/member roles only — employees, freelancers, clients are free).
2. Call `get_workspace_seat_limit` RPC to get `tier_config.included_seats + workspaces.extra_seats`.
3. If `current >= limit`, block the invite and return an upgrade prompt with the seat count and tier info.

**Show enforcement** is checked at deal creation (`createDeal` in `src/app/(dashboard)/(features)/crm/actions/deal-actions.ts`). The flow:
1. Call `count_active_shows` RPC to get current active deal count.
2. Look up `maxActiveShows` from tier config (null = unlimited for Studio).
3. If `current >= limit`, block creation and return an upgrade prompt.

**Stripe webhook handlers** (`src/app/api/stripe-webhook/route.ts`) handle 5 subscription lifecycle events:
- `customer.subscription.created` — sets initial tier and billing status
- `customer.subscription.updated` — syncs tier/seat changes from Stripe
- `customer.subscription.deleted` — downgrades to foundation, clears billing fields
- `invoice.payment_succeeded` — confirms billing status active
- `invoice.payment_failed` — marks billing status as past_due

---

## 11. Why This Structure Works

1. **Disruptive Pricing:** Growth tier ($99) targets HubSpot "Professional" jump (~$15 → ~$800)
2. **Per-seat economics:** Free access for employees, freelancers, and clients removes friction at the edges of the workspace. Only core team members (owner/admin/member) consume seats.
3. **Vertical Specialization:** PMS + geofencing + unlimited shows on Studio = "System of Action" for venues and high-volume production companies
4. **Aion progression:** Passive → Active → Autonomous maps to user trust building. Users upgrade Aion capability as they see value, not as a prerequisite.
5. **User Trust:** XAI reasoning chains during onboarding reduce anxiety around autonomous systems
