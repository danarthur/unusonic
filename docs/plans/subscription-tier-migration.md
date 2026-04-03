# Subscription Tier Migration: 4-Tier to 3-Tier with Seat/Show Limits

**Status:** Planning  
**Created:** 2026-04-02  
**Scope:** DB migration, Stripe billing, seat/show enforcement, plan page redesign, Aion tier gating

---

## 1. Summary

Migrate Unusonic from a 4-tier model (foundation/growth/venue_os/autonomous) to a 3-tier model (foundation/growth/studio) with per-seat billing, active show limits, and Stripe subscription lifecycle management. Portal users (employees, freelancers, clients) remain free and unlimited.

### Current State → Target State

| Dimension | Current | Target |
|---|---|---|
| Tiers | foundation, growth, venue_os, autonomous | foundation, growth, studio |
| Seat limits | None | Foundation=2, Growth=5, Studio=15 included |
| Show limits | None | Foundation=5, Growth=25, Studio=unlimited |
| Extra seats | N/A | $15/$15/$12 per seat per tier |
| Billing | `updateWorkspacePlan` does bare DB update | Full Stripe subscription lifecycle |
| Aion gating | None | Passive/Active/Autonomous per tier |
| Portal users | Free (employee role) | Free (unchanged) |
| Freelancers | Free (Ghost Protocol) | Free (unchanged) |
| Clients | Free (public token links) | Free (unchanged) |

### Tier Details

| | Foundation ($39/mo) | Growth ($99/mo) | Studio ($249/mo) |
|---|---|---|---|
| Team seats included | 2 | 5 | 15 |
| Active shows | 5 | 25 | Unlimited |
| Extra seat price | $15/mo | $15/mo | $12/mo |
| Crew / freelancers / clients | Unlimited free | Unlimited free | Unlimited free |
| CRM, proposals, invoices, catalog, RoS | Yes | Yes | Yes |
| Custom roles (Role Builder) | No (system roles only) | Yes | Yes |
| Crew dispatch | Manual | Full (bulk, templates) | Full |
| Aion | Passive (suggestions, alerts) | Active (drafts, recommendations) | Autonomous (actions without approval) |
| Advanced reporting | No | Yes | Yes |
| Multi-venue / geofencing | No | No | Yes |

### Access Types (Not "Seats")

| Type | Who | Pays? | Mechanism | Access |
|---|---|---|---|---|
| **Team member** | Owners, PMs, ops leads, dept heads | Yes (counted seat) | `workspace_members` with dashboard-capable role | Full dashboard `/(dashboard)/` |
| **Crew** | Employees, staff | No (free, unlimited) | `workspace_members` with `employee` role | Portal `/(portal)/` |
| **Freelancer** | External preferred individuals | No (free, unlimited) | `directory.entities` + PARTNER edge | Gig confirmations, cross-workspace schedule |
| **Client** | Buyers | No (no account) | Public token routes | Proposals, invoices |

**The bright line:** If you can *create, edit, or send* (deals, proposals, invoices, dispatch), you are a team member. If you can only *view your own data and respond*, you are crew.

**Seat counting query:** `workspace_members WHERE role slug != 'employee'`. Portal users never count.

---

## 2. Architecture Decisions

### Two-Gate Access System

Every protected action passes two independent gates:

1. **Role gate** (existing): Does the user's role have this capability? Checked by `member_has_capability(workspace_id, capability_key)`.
2. **Tier gate** (new): Does the workspace's tier include this feature? Checked by `workspaceHasTierCapability(workspaceId, tierCapKey)`.

Both must pass. These are orthogonal — role capabilities like `deals:edit:global` are not tier-gated (every tier can create deals). Tier gating is only for tier-locked features (Aion levels, custom roles, multi-venue, etc.).

Seat and show limits are quantity-based, not capability-based. They use separate enforcement functions.

### Stripe Billing Model

- Each tier maps to a Stripe Product with a monthly Price (base fee)
- Extra seats are a separate metered Price line item on the subscription
- Aion autonomous actions (Studio only) are a separate metered Price
- `workspaces.stripe_customer_id` and `stripe_subscription_id` already exist
- Feature flag: `ENABLE_STRIPE_BILLING=true` env var so tier structure can ship before billing enforcement

### Downgrade Behavior

When a workspace downgrades (e.g., Growth → Foundation while having 4 team members):
- Existing members are NOT removed
- New member additions are blocked
- A warning banner shows: "You have 4 team members but your plan includes 2. Remove members or upgrade to continue adding."
- Active shows over the new limit continue to function but new deal creation is blocked

---

## 3. Codebase Inventory (Files That Change)

### Database / Migrations

| File | Current State | Change Needed |
|---|---|---|
| `subscription_tier` enum | `foundation \| growth \| venue_os \| autonomous` | Rename `venue_os` → `studio`, handle `autonomous` → `studio` + addon flag |
| `workspaces` table | Has `stripe_customer_id`, `stripe_subscription_id`, `subscription_tier` | Add `extra_seats`, `autonomous_addon_enabled`, `aion_actions_used`, `aion_actions_reset_at`, `billing_status` |
| `agent_configs` table | Uses same `subscription_tier` enum | Automatically updates with enum change |
| New: `tier_config` table | Does not exist | Create with seat limits, show limits, prices, Stripe price IDs |
| New: `count_team_seats` RPC | Does not exist | Count workspace_members excluding employee role |
| New: `get_workspace_seat_limit` RPC | Does not exist | Return included_seats + extra_seats for workspace |
| New: `count_active_shows` RPC | Does not exist | Count non-lost, non-archived deals |
| New: seat limit trigger | Does not exist | BEFORE INSERT on workspace_members, enforce limit (safety net) |

### TypeScript — Types and Config

| File | Change |
|---|---|
| `src/features/onboarding/model/subscription-types.ts` | Rewrite: 3-tier union, update `SUBSCRIPTION_TIERS` object, new prices/highlights |
| `src/types/supabase.ts` | Regenerate after migration (`npm run db:types`) |
| New: `src/shared/lib/tier-config.ts` | Tier config constants, helper functions |
| New: `src/shared/lib/seat-limits.ts` | `canAddSeat()`, `getWorkspaceSeatUsage()`, `getWorkspaceSeatLimit()` |
| New: `src/shared/lib/show-limits.ts` | `canCreateShow()`, `getActiveShowCount()`, `getShowLimit()` |
| New: `src/shared/lib/tier-gate.ts` | `TIER_CAPABILITIES` map, `workspaceHasTierCapability()` |
| New: `src/shared/lib/access-check.ts` | Combined `checkAccess()` helper |

### Server Actions (Enforcement Points)

| File | Current Behavior | Change |
|---|---|---|
| `src/app/(dashboard)/settings/plan/actions.ts` | Bare DB update | Integrate Stripe subscription create/update, validate downgrade |
| `src/features/team-invite/api/actions.ts` | No seat check | Add `canAddSeat()` gate before non-employee member addition |
| `src/app/(dashboard)/(features)/crm/actions/deal-actions.ts` | No show check | Add `canCreateShow()` gate in `createDeal()` |
| `src/app/api/stripe-webhook/route.ts` | Handles checkout + payment_intent only | Add subscription lifecycle events (created, updated, deleted, invoice.paid, payment_failed) |

### Stripe Integration

| File | Current State | Change |
|---|---|---|
| `src/shared/api/stripe/server.ts` | Singleton Stripe instance | No change needed |
| `src/shared/api/stripe/client.ts` | Lazy-loaded browser Stripe | No change needed |
| New: `src/shared/api/stripe/subscription.ts` | Does not exist | `createSubscription()`, `updateSubscriptionTier()`, `updateSeatQuantity()`, `cancelSubscription()` |
| New: `docs/stripe-billing-setup.md` | Does not exist | Stripe Dashboard setup instructions (Products, Prices, webhook endpoint) |
| `package.json` | stripe v20.4.1, @stripe/react-stripe-js v5.6.1, @stripe/stripe-js v8.9.0 | No change needed |

### UI Components

| File | Change |
|---|---|
| `src/app/(dashboard)/settings/plan/components/PlanPageClient.tsx` | Full rewrite: 3 tiers, usage bars, Stripe checkout integration |
| `src/app/(dashboard)/settings/plan/page.tsx` | Fetch additional data: seat count, show count, billing status |
| New: `src/shared/ui/upgrade-prompt/UpgradeBanner.tsx` | Full-width upgrade banner for limit hits |
| New: `src/shared/ui/upgrade-prompt/UpgradeInline.tsx` | Inline prompt for modals/forms |
| New: `src/shared/ui/upgrade-prompt/useUpgradePrompt.ts` | Hook that checks limits and returns prompt state |
| `src/app/(dashboard)/(features)/crm/components/create-gig-modal.tsx` | Show UpgradeInline when at show limit |
| `src/app/(dashboard)/lobby/PlanPromptBanner.tsx` | Enhance to show billing warnings (past_due) |

### Portal (No Changes)

| File | Status |
|---|---|
| `src/app/(portal)/layout.tsx` | Unchanged — employee role gating already works |
| `src/app/(portal)/schedule/` | Unchanged |
| `src/app/(portal)/profile/` | Unchanged |
| `src/app/(portal)/pay/` | Unchanged |

### Permission System (Minor Extensions)

| File | Change |
|---|---|
| `src/shared/lib/permission-registry.ts` | Add tier-gated capability keys: `tier:aion:active`, `tier:aion:autonomous`, `tier:custom_roles`, `tier:multi_venue`, `tier:advanced_reporting` |
| `src/shared/lib/permissions.ts` | No change (role-level checks unchanged) |
| `src/features/role-builder/model/permission-metadata.ts` | No change for now (Role Builder UI is Phase 2 post-launch) |

### Aion Integration

| File | Change |
|---|---|
| New: `src/features/intelligence/lib/aion-gate.ts` | `getAionCapabilityLevel()`, `canExecuteAionAction()`, `recordAionAction()` |
| Aion server actions (various) | Check `canExecuteAionAction()` before executing |

---

## 4. Implementation Phases

### Phase 1: Data Layer (Sequential — must complete before all else)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 1.1 | DB migration: rename enum values | Medium | None |
| 1.2 | DB migration: `tier_config` table + new workspace columns | Medium | 1.1 |
| 1.3 | TS tier config constants (`src/shared/lib/tier-config.ts`) | Small | 1.1 |
| 1.4 | Update `subscription-types.ts` (3-tier union, new prices) | Small | 1.1 |
| 1.5 | Regenerate Supabase types (`npm run db:types`) | Small | 1.1 + 1.2 |

**Migration 1.1 SQL approach** (Postgres cannot rename/remove enum values safely):
```sql
-- Convert column to text, update values, recreate enum
ALTER TABLE workspaces ALTER COLUMN subscription_tier TYPE text;
ALTER TABLE agent_configs ALTER COLUMN tier TYPE text;
UPDATE workspaces SET subscription_tier = 'studio' WHERE subscription_tier IN ('venue_os', 'autonomous');
UPDATE agent_configs SET tier = 'studio' WHERE tier IN ('venue_os', 'autonomous');
DROP TYPE subscription_tier;
CREATE TYPE subscription_tier AS ENUM ('foundation', 'growth', 'studio');
ALTER TABLE workspaces ALTER COLUMN subscription_tier TYPE subscription_tier USING subscription_tier::subscription_tier;
ALTER TABLE agent_configs ALTER COLUMN tier TYPE subscription_tier USING tier::subscription_tier;
```

**Migration 1.2 — `tier_config` seed data:**
```sql
INSERT INTO public.tier_config (tier, label, base_price_cents, included_seats, max_active_shows, extra_seat_price_cents, aion_mode, aion_monthly_actions) VALUES
  ('foundation', 'Foundation', 3900, 2, 5, 1500, 'passive', NULL),
  ('growth', 'Growth', 9900, 5, 25, 1500, 'active', NULL),
  ('studio', 'Studio', 24900, 15, NULL, 1200, 'autonomous', 50);
```

### Phase 2: Seat and Show Enforcement (Parallelizable after Phase 1)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 2.1 | DB: `count_team_seats` + `get_workspace_seat_limit` RPCs | Medium | 1.2 |
| 2.2 | TS: `src/shared/lib/seat-limits.ts` | Small | 2.1 |
| 2.3 | Enforce seat limits in team invite flow | Medium | 2.2 |
| 2.4 | DB: `count_active_shows` RPC | Small | 1.2 |
| 2.5 | TS: `src/shared/lib/show-limits.ts` + enforce in `createDeal` | Medium | 2.4 |
| 2.6 | DB: BEFORE INSERT trigger on workspace_members (safety net) | Small | 2.1 |

**Seat count RPC:**
```sql
CREATE OR REPLACE FUNCTION count_team_seats(p_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT count(*)::integer
  FROM workspace_members wm
  LEFT JOIN ops.workspace_roles wr ON wr.id = wm.role_id
  WHERE wm.workspace_id = p_workspace_id
    AND (wr.slug IS NULL OR wr.slug <> 'employee')
$$;
```

**Active show count RPC:**
```sql
CREATE OR REPLACE FUNCTION count_active_shows(p_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT count(*)::integer
  FROM deals
  WHERE workspace_id = p_workspace_id
    AND archived_at IS NULL
    AND status NOT IN ('lost')
$$;
```

**Enforcement in team invite (`actions.ts`):**
- Before inserting a non-employee workspace_members row, call `canAddSeat(workspaceId)`
- If at limit: return `{ success: false, error: 'seat_limit_reached', current, limit }`
- Employee role invites (portal users) are never gated

**Enforcement in deal creation (`deal-actions.ts`):**
- Before `createDeal`, call `canCreateShow(workspaceId)`
- Studio tier (null limit) always passes
- At 80% threshold: allow but return `{ warning: 'approaching_show_limit' }`
- At 100%: return `{ success: false, error: 'show_limit_reached', current, limit }`

**Race condition mitigation:** The DB trigger on workspace_members acts as the safety net:
```sql
CREATE OR REPLACE FUNCTION check_seat_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_current integer;
  v_limit integer;
  v_role_slug text;
BEGIN
  SELECT slug INTO v_role_slug FROM ops.workspace_roles WHERE id = NEW.role_id;
  IF v_role_slug = 'employee' THEN RETURN NEW; END IF;
  SELECT count_team_seats(NEW.workspace_id) INTO v_current;
  SELECT get_workspace_seat_limit(NEW.workspace_id) INTO v_limit;
  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Seat limit reached (% of %)', v_current, v_limit;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_seat_limit BEFORE INSERT ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION check_seat_limit();
```

### Phase 3: Tier-to-Capability Gating (Parallelizable after Phase 1)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 3.1 | Define tier-gated capability keys in permission registry | Small | 1.3 |
| 3.2 | Create `src/shared/lib/tier-gate.ts` | Medium | 1.3 |
| 3.3 | Create `src/shared/lib/access-check.ts` (combined helper) | Small | 3.2 |

**Tier capabilities map:**
```ts
export const TIER_CAPABILITIES: Record<TierSlug, string[]> = {
  foundation: [],
  growth: ['tier:aion:active', 'tier:custom_roles', 'tier:advanced_reporting', 'tier:bulk_dispatch'],
  studio: ['tier:aion:active', 'tier:aion:autonomous', 'tier:custom_roles', 'tier:advanced_reporting', 'tier:bulk_dispatch', 'tier:multi_venue', 'tier:geofencing'],
};
```

### Phase 4: Stripe Billing (Depends on Phases 1 + 3)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 4.1 | Create `docs/stripe-billing-setup.md` | Small | None |
| 4.2 | Create `src/shared/api/stripe/subscription.ts` | Large | 1.3, 1.5 |
| 4.3 | Extend `src/app/api/stripe-webhook/route.ts` | Large | 4.2 |
| 4.4 | Rewrite `src/app/(dashboard)/settings/plan/actions.ts` | Medium | 4.2 |
| 4.5 | Seat add/remove Stripe sync in invite flow | Medium | 2.3, 4.2 |
| 4.6 | DB: Add `billing_status` column to workspaces | Small | 1.2 |

**New Stripe webhook events to handle:**
- `customer.subscription.created` → Confirm workspace tier, store subscription ID
- `customer.subscription.updated` → Sync tier/seat changes from Stripe
- `customer.subscription.deleted` → Set `billing_status = 'canceled'`, downgrade behavior
- `invoice.paid` → Confirm payment, reset Aion action count if new billing period
- `invoice.payment_failed` → Set `billing_status = 'past_due'`, trigger banner

**Feature flag:** All Stripe billing behind `ENABLE_STRIPE_BILLING=true`. When false, `updateWorkspacePlan` continues to do the bare DB update (current behavior). This allows the tier structure and limits to ship before payment collection is live.

### Phase 5: Plan Page Redesign (Depends on Phases 2, 3, 4)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 5.1 | Rewrite `PlanPageClient.tsx` (3 tiers, usage bars, Stripe checkout) | Medium | 1.4, 2.2, 2.5, 4.2 |
| 5.2 | Update `plan/page.tsx` (fetch seat/show counts, billing status) | Small | 5.1 |
| 5.3 | Create `UsageBar`, `SeatUsageCard`, `ShowUsageCard` components | Small | Parallel with 5.1 |

### Phase 6: Contextual Upgrade Prompts (Depends on Phases 2, 3)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 6.1 | Create `UpgradeBanner`, `UpgradeInline`, `useUpgradePrompt` | Medium | 2.2, 2.5 |
| 6.2 | Wire into create-gig-modal (show limit) | Small | 6.1 |
| 6.3 | Wire into team invite (seat limit) | Small | 6.1 |
| 6.4 | Enhance `PlanPromptBanner` for billing warnings | Small | 4.6 |

### Phase 7: Aion Tier Gating (Depends on Phase 3)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 7.1 | Create `src/features/intelligence/lib/aion-gate.ts` | Medium | 3.2 |
| 7.2 | Gate Aion actions in intelligence server actions | Medium | 7.1 |
| 7.3 | Monthly action count reset via `invoice.paid` webhook | Small | 4.3 |

### Phase 8: Existing Workspace Migration (Run Last)

| Step | Task | Complexity | Dependencies |
|---|---|---|---|
| 8.1 | Data migration SQL (handled in 1.1 enum migration) | Already covered | 1.1 |
| 8.2 | Stripe subscription migration script | Medium | 4.2 |

---

## 5. Dependency Graph

```
Phase 1 (sequential):
  1.1 → 1.2 → 1.5
  1.1 → 1.3
  1.1 → 1.4

Phase 2 (after Phase 1):        Phase 3 (after Phase 1):
  2.1 → 2.2 → 2.3                 3.1 → 3.2 → 3.3
  2.4 → 2.5
  2.1 → 2.6

Phase 4 (after Phases 1 + 3):
  4.1 (anytime)
  4.2 → 4.3
  4.2 → 4.4
  2.3 + 4.2 → 4.5
  4.6 (parallel)

Phase 5 (after 2 + 3 + 4):      Phase 6 (after 2 + 3):
  5.1 + 5.3 → 5.2                 6.1 → 6.2, 6.3, 6.4

Phase 7 (after 3):               Phase 8 (last):
  7.1 → 7.2                        8.2
  4.3 → 7.3
```

**Maximum parallelism after Phase 1:** Phases 2, 3, and 4.1/4.6 can all run simultaneously.

---

## 6. Edge Cases and Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Postgres enum migration | DDL operation, brief lock on affected tables | Test on Supabase branch first; deploy during low-traffic window |
| Workspaces over new seat limit after migration | Users see "over limit" warning unexpectedly | Soft enforcement only (block new adds, not remove existing). Clear in-app messaging. |
| Stripe webhook ordering | Events arrive out of order | All handlers idempotent; use `stripe_subscription_id` as anchor |
| Seat count race condition | Two simultaneous invites both pass app check | DB BEFORE INSERT trigger as safety net |
| Type generation lag | TS types stale after migration | Run `npm run db:types` immediately after migration; re-append convenience aliases |
| Failed payments | Workspace loses access mid-show | Grace period (3-7 days via `billing_status = 'past_due'`); banner not lockout |
| Downgrade with active Aion tasks | Autonomous actions in progress when tier drops | Aion gate checks tier at execution time; in-flight actions complete, new ones blocked |

---

## 7. Environment Variables

### Existing (no change)
- `STRIPE_SECRET_KEY` — server-side Stripe instance
- `STRIPE_WEBHOOK_SECRET` — webhook signature verification
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — browser Stripe

### New
- `ENABLE_STRIPE_BILLING` — Feature flag for billing enforcement (default: false)
- Stripe Price IDs go in `tier_config` DB table, not env vars

---

## 8. Testing Priorities

If Test Writer is engaged, these are the highest-risk paths:

1. **Seat limit enforcement** — Verify non-employee member addition is blocked at limit; verify employee addition is never blocked; verify trigger catches race conditions
2. **Show limit enforcement** — Verify deal creation blocked at limit; verify Studio (null limit) is never blocked; verify archived/lost deals don't count
3. **Tier-to-capability gating** — Verify Foundation cannot access Growth features; verify downgrade blocks tier-locked features
4. **Stripe webhook idempotency** — Verify duplicate webhook delivery doesn't double-process
5. **Downgrade behavior** — Verify existing members/shows are not disrupted, only new additions blocked

---

## 9. Persona-to-Tier Mapping (Onboarding)

| Persona | Suggested Tier | Rationale |
|---|---|---|
| Solo Professional | Foundation | 1-2 person operation, low show volume |
| Agency / Team | Growth | 3-10 person team, moderate show volume |
| Venue / Brand | Studio | High volume, multi-venue, needs Aion autonomous |

This mapping drives the Aion recommendation banner on the plan page and the default tier suggestion during onboarding pathfinding.

---

## 10. User-Facing Language

| Internal | User-Facing | Context |
|---|---|---|
| Paid dashboard user | Team member | Plan page, invite flow |
| Portal user (employee) | Crew | Portal, invite emails |
| Freelancer | Freelancer | Network, gig offers |
| Client | Client | Proposals, invoices |
| Subscription plan | Plan | Settings, billing |
| Active show limit | Active shows | Plan page, limit warnings |
| Aion autonomous action | Aion action | Usage dashboard |
| seat_limit_reached | "Your plan includes N team members" | Upgrade prompt |
| show_limit_reached | "Your plan includes N active shows" | Upgrade prompt |
