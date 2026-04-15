# Lobby widget empty-state tests — pattern

Phase 2.5 of the reports & analytics initiative wired every default Lobby widget
to the `METRICS[...].emptyState.body` registry copy. The widgets follow one of
two shapes:

1. **WidgetShell-based widgets.** Pass `empty={!loading && isEmpty}` and
   `emptyMessage={META.emptyState.body}` to `WidgetShell`. The shell handles
   icon + paragraph rendering.
2. **Custom chrome widgets** (`active-production`, `real-time-logistics`).
   Render a conditional empty block inline using the registry copy.

We co-locate a small test file per representative widget under
`src/widgets/<key>/__tests__/<Widget>.test.tsx`. Each test asserts three
things:

- **Empty data** — the exact `METRICS[...].emptyState.body` string renders.
- **Loading** — loading state takes precedence over empty (the body copy must
  NOT appear when `loading={true}`).
- **Populated data** — when data has content, the empty copy is absent.

We don't repeat tests for every widget. `WidgetShell` itself is thin wiring; if
a widget correctly passes `empty` and `emptyMessage` into the shell and uses
`METRICS[...].emptyState.body`, the other widgets behave identically. Tests
are written for:

- `action-queue` — simple list-driven empty case (array length).
- `revenue-trend` — threshold-based empty case (needs ≥2 months of revenue).
- `financial-pulse` — multi-field empty predicate.
- `active-production` — custom chrome, not WidgetShell.

If a new Lobby widget adds custom-chrome rendering, add a parallel test
following the `active-production` example.
