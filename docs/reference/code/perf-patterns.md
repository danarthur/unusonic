# Performance Patterns

These are the canonical perf patterns established in the CRM perf work
(2026-04-27). Apply them to every detail page, every mutation handler,
every detail-fetch path. The patterns are deliberately small primitives —
each addresses one specific class of slowness.

> **Why these patterns?** The User Advocate research (2026-04-27) clarified
> that production owners value **confidence over speed**. They tolerate 500ms
> with a clean coordinated paint; they hate 200ms with three intermediate
> states. Most "feels slow" complaints in event-production CRM are actually
> "feels uncertain" complaints — the page visibly assembling itself, mid-flight
> states, status pills that wait 800ms before changing color. The patterns
> below target the perception, not the throughput.

---

## 1. Measure first, optimize second

Before changing anything for perf, **measure**. The dev mode adds
400-600ms of noise on top of real timings; "slightly better" is not a
useful signal.

**Tools provided:**

- **`<PerfOverlay>`** — dev-only floating overlay (toggle with `Cmd+Shift+P`).
  Shows live Web Vitals (LCP, INP, CLS, FCP, TTFB) plus the last 10
  custom marks with duration colors. Wired into the root layout.
- **`markStart(name)` / `markEnd(name)`** from `@/shared/lib/perf/measure` —
  wrap any transition you care about. Naming convention: `area:transition`
  (e.g. `crm:deal-switch`, `aion:chat-send`, `proposal:builder-open`).
  Shows up in the overlay grouped by area.
- **`measureAsync(name, fn)`** — one-shot wrapper for awaitable work.
- **Sentry forwarding** — Web Vitals are sent to Sentry as transaction
  measurements when `window.Sentry` is available, so production has a
  baseline.

**Always test in production build before declaring victory:**
```bash
npm run build && npm run start
```
Dev-mode timings are not real perf signal.

---

## 2. Sibling-switch transitions (list-on-left, detail-on-right)

> "The header changing first is not a small bug — it's an active
> misinformation event." — User Advocate, 2026-04-28

The single biggest perception fix on detail panels. When the user switches
between siblings (deal → deal, event → event, entity → entity), the naive
implementation has two failure modes:

1. **Wave-y skeleton** — the body flashes a skeleton between every click.
2. **Fresh header + stale body** — the header updates instantly from list
   memory, but the body still shows the previous item's data because the
   server fetch hasn't returned. This looks coherent but lies — users
   read it as the new item's data and make decisions on it. Worse than a
   skeleton.

The fix has two layers.

### Layer 1 — make most switches not need a transition

Cache + prefetch turn 90%+ of switches into cache hits, so the visual
transition only matters for cold misses.

- **TanStack Query** with `staleTime: 30_000` and `gcTime: 5 * 60_000`.
- **`placeholderData: keepPreviousData`** on the bundle query — the previous
  item's bundle stays rendered while the new fetch is in flight. This is
  what makes the dim-and-hold real.
- **Hover prefetch** on list items, debounced 150ms, hover-capable pointers
  only. By the time the click lands, the bundle is warm.
- **Neighbor prefetch** — when a selection lands, prefetch ±1 neighbors in
  the sorted/filtered view. Covers keyboard arrow-nav and the natural
  scan-and-click rhythm with bounded server cost (max 2 fetches per nav).
- **Mutation invalidation** — every mutation that changes the bundle must
  call `queryClient.invalidateQueries({ queryKey })` or `setQueryData` for
  the optimistic patch. Cached stale data on revisit is the exact
  "confidently wrong" failure mode that erodes trust.

### Layer 2 — what to show during the rare cold miss

Use **`<DetailPaneTransition>`** from `@/shared/ui/detail-pane-transition`:

```tsx
<DetailPaneTransition
  bundleKey={selectedId}
  isFirstLoad={query.isPending && !query.data}
  isFetching={query.isFetching}
  skeleton={<DetailSkeleton />}
  scrollContainerRef={scrollRef}
>
  <DetailHeader title={bundle.title} status={bundle.status} />
  <DetailBody {...bundle} />
</DetailPaneTransition>
```

Behavior:

1. **On click** — the rail row updates `selected` state instantly (the click
   is acknowledged at the source, the click-feedback contract is preserved).
   The detail pane dims to 70% opacity over 80ms and keeps rendering the
   previous bundle.
2. **If fetch <250ms** — pane snaps to full opacity with new content. No
   skeleton ever shown. Dominant case for warm and ±1-neighbor prefetched
   switches.
3. **If fetch ≥250ms** — dimmed pane crossfades to a true skeleton. Honest
   "I am loading." When data arrives, skeleton snaps to content atomically.
4. **First-ever load** — skeleton from the start (no dim phase, nothing to
   hold).
5. **Scroll resets** to top when a new bundle resolves.

### Caller contract

The `children` you pass to `<DetailPaneTransition>` must derive every
displayed value (header AND body) from the BUNDLE data, not from the list-
row memory. The bundle is held by `keepPreviousData` until the new fetch
arrives, so referencing `bundle.title` keeps the title held back; referencing
`selectedItem.title` (from the list) flips the title instantly and breaks
the atomic-swap contract.

```tsx
// WRONG — header sourced from list memory, flips before body resolves
const title = selectedItem.title;

// RIGHT — header sourced from the bundle, held during fetch
const title = bundle?.deal?.title ?? bundle?.eventSummary?.title;
```

### Reference implementation

`src/app/(dashboard)/(features)/crm/components/prism.tsx` — the full pattern:
TanStack `useQuery` with `keepPreviousData`, optimistic mutations via
`setQueryData`, neighbor prefetch in `production-grid-shell.tsx`, hover
prefetch in `stream-card.tsx`, `<DetailPaneTransition>` wrapping the pane,
`<PrismSkeleton>` as the cold-miss fallback.

### Adoption checklist (per surface)

Apply this pattern to any list-on-left + detail-on-right surface:

- [ ] CRM Prism (deal/event) — **shipped 2026-04-28**, reference impl
- [ ] Network Detail Sheet (contact → contact)
- [ ] Aion deal-card thread switcher
- [ ] Aion `/aion` sidebar (cross-deal threads)
- [ ] Plan tab inner cards on event swap

Each surface needs (1) a bundled server action, (2) a TanStack query factory
in the feature's `queries.ts`, (3) prefetch wiring on hover + neighbors,
(4) `<DetailPaneTransition>` wrapping the pane, (5) header sourced from
bundle data.

### What this replaces

The earlier "stale-while-revalidate" guidance (keep showing prior content,
don't blank to skeleton) was right for **first loads with multiple data
sources**, where the wave-y skeleton was the failure mode. It generalized
incorrectly to sibling-switches, where the dominant failure mode is
**desync between header (instant) and body (slow)**. The new pattern
preserves the atomic-swap intuition by holding ALL data — header included
— until the bundle resolves, while the prefetch substrate keeps the
dominant case under the 250ms threshold so the dim is invisible.

---

## 3. Synchronized reveal — primary vs ambient sections

For first loads, separate the page into **primary** (paint together) and
**ambient** (fade in silently afterward). The primary block should land
fully formed in one beat; ambient panels appear without skeletons.

**Use `<SynchronizedReveal>` from `@/shared/ui/synchronized-reveal`:**

```tsx
<SynchronizedReveal
  primary={
    <>
      <DealHeaderStrip ... />
      <DealKeyFacts ... />
      <DealStatusPill ... />
    </>
  }
  ambient={
    <>
      <ConflictsPanel ... />
      <AionDealCard ... />
      <Timeline ... />
    </>
  }
/>
```

**For state-driven sections** (not Suspense-eligible), achieve the same
effect by:
- Returning `null` instead of "Loading…" text while data is null
- Not setting state to null on prop change (let stale data linger)
- Avoiding skeleton chrome for ambient panels

The "wave" comes from skeletons popping in over time. Removing them is
often better than coordinating them.

---

## 4. Optimistic UI on mutations

> "Linear's quiet superpower." — Field Expert

Every user-triggered write should commit locally **before** the server
action completes. Pattern:

1. Snapshot the previous value.
2. Update local state to the optimistic next value.
3. Fire the server action.
4. On error, revert + toast.

**Use the helper hooks** from `@/shared/lib/perf/use-optimistic-mutation`:

```tsx
// Toggle (status pill, primary host star, mute):
const [active, toggle, pending] = useOptimisticToggle(deal.is_active, async (next) => {
  const r = await setDealActive(deal.id, next);
  if (!r.success) throw new Error(r.error);
});

// Field with debounce (inline title, date, amount):
const [title, setTitle, saving] = useOptimisticField(
  deal.title ?? '',
  async (next) => {
    const r = await updateDealScalars(deal.id, { title: next || null });
    if (!r.success) throw new Error(r.error);
  },
  { debounceMs: 800 },
);

// Generic action (status changes, role swaps, archive/restore):
const [status, runStatus, pending] = useOptimisticAction(deal.status);
runStatus('lost', async () => {
  const r = await updateDealStatus(deal.id, 'lost', { reason });
  if (!r.success) throw new Error(r.error);
});
```

**Or apply the pattern manually** when the state is owned by a parent
(e.g. `prism.tsx`'s `handleStatusChange`):

```tsx
const handleStatusChange = async (status: string) => {
  if (!deal) return;
  const previousStatus = deal.status;
  setDeal((prev) => prev ? { ...prev, status } : prev);  // optimistic
  const result = await updateDealStatus(deal.id, status);
  if (!result.success) {
    setDeal((prev) => prev ? { ...prev, status: previousStatus } : prev);  // revert
    toast.error(result.error ?? 'Failed to update status');
  }
};
```

**Don't:**
- Block the UI with a spinner during optimistic writes
- Disable the control during the in-flight period (rare-conflict, last-write-wins is fine)
- Revert text-input edits on error (more confusing than letting the user retry)

---

## 5. Bundled-fetch actions

For "always fetched together" tuples, write **one** server action that
returns all the data instead of N parallel calls from the client.

**Example:** `getDealBundle(dealId, sourceOrgId)` returns
`{ deal, client, stakeholders }` from one server-action round-trip.
Internal `Promise.all` preserves parallelization on the server.

**Why:** every server-action call from the client pays:
- Auth check (~5ms)
- Server-side handler dispatch
- TLS + network hop
- Supabase pool acquisition

Three calls = 3× that overhead. One bundled call pays it once.

**Pattern (file naming):** action lives alongside the individual actions
as `get-{thing}-bundle.ts`. Individual actions are kept exported — callers
that genuinely need just one resource (e.g. background tab-focus refresh)
still use them.

Reference: `src/app/(dashboard)/(features)/crm/actions/get-deal-bundle.ts`.

---

## 6. Selective revalidation

When a mutation affects surfaces **outside** the open detail (e.g. a
sidebar list, a kanban count, a dashboard tile), you can't rely on the
detail's local-state update to keep them honest.

**Pattern:** call `revalidatePath('/parent-route')` **server-side, in the
mutation action**, only when the mutation actually affects that surface.

```ts
// in deal-stakeholders.ts
import { revalidatePath } from 'next/cache';

export async function addDealStakeholder(...) {
  // ... mutation ...

  // Sidebar shows client_name (bill_to) and location (venue_contact).
  // Only those role changes should refresh /crm. POC, planner, host roles
  // don't appear on the sidebar — they keep the perf gain of no refresh.
  if (role === 'bill_to' || role === 'venue_contact') {
    revalidatePath('/crm');
  }

  return { success: true };
}
```

**Don't:**
- Use `router.refresh()` from the client side. It's a sledgehammer that
  re-runs the entire page server component (often 8+ Supabase queries).
- Revalidate every mutation. Most mutations only affect the open item;
  there's no reason to refresh the parent page.

---

## 7. Lazy-load heavy components

For large client components (>500 LOC, or with heavy dep trees) that
aren't critical-path, use `next/dynamic` with `ssr: false` to strip them
from the initial bundle.

```tsx
// AionDealCard is large + ambient (renders after primary paint)
const AionDealCard = dynamic(
  () => import('./aion-deal-card').then((m) => ({ default: m.AionDealCard })),
  { ssr: false },
);

// ProposalBuilder only renders for pre-handoff deals (~60% of opens)
const ProposalBuilder = dynamic(
  () => import('@/features/sales/ui/proposal-builder').then((m) => ({ default: m.ProposalBuilder })),
  { ssr: false },
);
```

**Use when:**
- Component renders conditionally and the fall-through path is common
- Component is heavy (>500 LOC, or pulls in framer-motion/cmdk/dnd-kit deps)
- Component is below-the-fold or ambient (fades in after primary paint)

**Don't:**
- Lazy-load primary critical-path components (header, status, key facts)
- Use `ssr: true` for components with browser-only APIs

---

## 8. RLS query optimization

Two patterns surface as Supabase advisor `WARN` lints on hot tables —
fix them in migrations:

### `auth_rls_initplan`

RLS policies that call `auth.uid()` directly re-evaluate it per row.
Wrap in `(SELECT auth.uid())` so Postgres treats it as an initplan
(evaluated once per query).

```sql
-- BEFORE
CREATE POLICY example ON public.deals
  FOR SELECT USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- AFTER
CREATE POLICY example ON public.deals
  FOR SELECT USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = (SELECT auth.uid())
  ));
```

Reference: `supabase/migrations/20260427230125_rls_auth_uid_initplan_hot_tables.sql`.

### `multiple_permissive_policies`

When multiple PERMISSIVE policies exist for the same `{role, action}`,
Postgres OR's all of them per row. Drop redundant Dashboard-era policies
(usually ones with spaces in the name, like `"View Directory"`) once the
named code-defined policies cover the same surface.

Reference: `supabase/migrations/20260427230409_drop_redundant_dashboard_policies.sql`.

---

## 9. Cache stable data

Data that changes rarely (pipeline stages, workspace job titles, archetypes,
template config) should be cached. The pattern depends on the access shape:

**Server-side, called from a 'use server' file:** module-level Map keyed
by workspace_id, with explicit invalidation function:

```ts
const PIPELINE_CACHE = new Map<string, { data: WorkspacePipeline | null; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getWorkspacePipelineStages() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const now = Date.now();
  const cached = PIPELINE_CACHE.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await fetchUncached(workspaceId);
  PIPELINE_CACHE.set(workspaceId, { data, expiresAt: now + TTL_MS });
  return data;
}

export async function invalidatePipelineCache(workspaceId: string) {
  PIPELINE_CACHE.delete(workspaceId);
}
```

**Why not `unstable_cache`?** It forbids `cookies()` inside the cached
function, which Supabase auth needs. The Map approach sidesteps this
without sacrificing the locality benefit.

**Future settings UI mutations** should call the `invalidate*` exports.

Reference: `src/app/(dashboard)/(features)/crm/actions/get-workspace-pipeline-stages.ts`.

---

## Anti-patterns (don't do these)

| Anti-pattern | Why bad | What to do instead |
|---|---|---|
| `router.refresh()` after a mutation | Re-runs entire page server component (8+ queries) | Update local state surgically; use `revalidatePath` in the action only when sidebar-affecting |
| "Loading…" text on ambient panels | Flashes briefly before content arrives, reads as wave | Return `null`; let content appear silently |
| Centered spinner during navigation between sibling items | Blanks content the user just had | Stale-while-revalidate (keep showing previous content) |
| Synchronous `await mutation; setState; refresh()` | User sees 300-1500ms of "did it work?" before pill changes | Optimistic UI: setState first, await in background, revert on error |
| Three separate fetches for the same item's data | 3× round-trip overhead | Bundle into one server action with internal `Promise.all` |
| Eagerly importing heavy components | Initial bundle bloat | `next/dynamic` for ambient or conditionally-rendered components |
| Bare `auth.uid()` in RLS USING/CHECK | Re-evaluated per row | Wrap in `(SELECT auth.uid())` |
| Multiple PERMISSIVE policies for same `{role, action}` | All evaluated per row | Drop the redundant one (usually old Dashboard-created) |
| `<AnimatePresence mode="wait">` over multi-conditional sibling motion.divs with `initial={false}` | Exit animation never schedules; entering child held forever (Plan tab cold-load deadlock, fixed 2026-05-04) | Use `<LensCrossfade>` from `src/shared/ui/lens-crossfade.tsx` for keyed content swaps inside a held pane |

---

## Adoption checklist for a new detail page

When building a new detail page (event lens, network entity, etc.), apply
these in order:

- [ ] **Measure first** — wrap the navigation transition in `markStart/markEnd`,
      open the perf overlay, and baseline before any optimization.
- [ ] **Stale-while-revalidate** — never show a centered spinner between
      sibling items. Keep prior content during transition.
- [ ] **Synchronized primary block** — header/status/key facts paint together;
      ambient panels fade in silently.
- [ ] **Optimistic mutations** — every status pill, toggle, inline edit, and
      drag uses optimistic UI. Use the helpers in `use-optimistic-mutation.ts`.
- [ ] **Bundled fetch** — if you're calling 2+ server actions on the same
      detail's data, write a `get-{thing}-bundle.ts`.
- [ ] **Selective revalidation** — server actions call `revalidatePath` only
      when the mutation affects surfaces outside the open detail.
- [ ] **Lazy-load** — any component >500 LOC or with heavy deps that isn't
      critical-path uses `next/dynamic` with `ssr: false`.
- [ ] **RLS audit** — run Supabase advisor on `WARN` lints for the new
      tables. Fix `auth_rls_initplan` and `multiple_permissive_policies`
      in migrations.

---

## Reference implementations

- **Stale-while-revalidate**: `prism.tsx` deal-switching (~line 230)
- **Synchronized reveal primitive**: `src/shared/ui/synchronized-reveal.tsx`
- **Optimistic hooks**: `src/shared/lib/perf/use-optimistic-mutation.ts`
- **Optimistic pattern in handler**: `prism.tsx` `handleStatusChange` (~line 339)
- **Bundled fetch action**: `src/app/(dashboard)/(features)/crm/actions/get-deal-bundle.ts`
- **Selective revalidatePath**: `deal-stakeholders.ts` (`addDealStakeholder`,
  `removeDealStakeholder`)
- **Lazy load**: `deal-lens.tsx` `AionDealCard` and `ProposalBuilder` imports
- **Module-level cache**: `get-workspace-pipeline-stages.ts`
- **Lens crossfade primitive**: `src/shared/ui/lens-crossfade.tsx` (used in `prism.tsx` for Deal/Plan/Ledger swap; replaces the multi-keyed AnimatePresence pattern that deadlocked on `initial={false}`)
- **RLS migrations**: `20260427230125_rls_auth_uid_initplan_hot_tables.sql`,
  `20260427230409_drop_redundant_dashboard_policies.sql`
