# Silent writes and schema drift

**2026-09-10 · branch `feat/employment-history-ui`**

This started as one bug: the network vocabulary setting had shipped, shown a
success toast, and never once saved. The question that followed it — *are there
others* — turned out to have a long answer.

There are two defects here, and they compound.

**A write that changes nothing is not an error.** PostgREST returns
`{ error: null }` for an UPDATE or DELETE that matches zero rows. An action that
checks only `error` reports success. If the table has no RLS policy for that
command, *every* such write matches zero rows, forever, silently.

**A query against a column that does not exist is not a type error.**
`src/shared/api/supabase/server.ts` and `client.ts` — the two clients that
respect RLS, and therefore the two that carry every user-facing read and write —
were constructed without the `Database` generic. `system.ts` had it.
So the entire authenticated surface of the app was `any`: wrong tables, wrong
columns, wrong RPC names, none of it checked, at compile time or at review.

Typing the two clients produced **280 type errors**. Every table and column
sampled from those errors was verified against live PostgREST before acting on
it. None were false positives.

---

## 1. Workspace settings that had never saved

`public.workspaces` had RLS policies for INSERT and SELECT, and none for UPDATE.

| Setting | Where the user changes it |
|---|---|
| Network vocabulary | Settings → Network |
| Portal theme | Settings → Portal |
| Payment defaults (deposit %, deadlines) | Settings |
| SMS sign-in | Settings → Security |
| Require equipment verification | Settings → Roster |
| Sending domain — add, verify, remove | Settings → Email |

`removeSendingDomain` was the dangerous one: it cleared the local columns and
then deleted the domain at Resend. Had the clear silently failed while the
Resend call succeeded, the workspace would have kept a `sending_domain` naming
a domain that no longer existed, and every outbound email from it would break.

**Fixed.** Migration `20260910060000` splits the two questions: an owner/admin
RLS policy decides *who*, and a column-level GRANT decides *which* — table
UPDATE revoked, re-granted on the thirteen settings columns, so
`subscription_tier` and `stripe_customer_id` stay unreachable from a browser.
`anon` loses UPDATE outright; it held table-wide UPDATE on every column and was
kept out by nothing but the missing policy.

`src/shared/lib/write-landed.ts` is the code-side half: chain `.select('id')`
onto a write and a zero-row result becomes a failure. Use it on every write to
a table whose policy set you have not personally read.

## 2. The team surface, against a table that had moved

`public.workspace_members` holds four columns: `workspace_id`, `user_id`,
`role`, `role_id`. No `id`, no `permissions`, no `department`, no
`primary_location_id`, no `created_at`. Permissions moved onto roles —
`role_id` → `ops.workspace_roles` → `ops.workspace_role_permissions`, read by
`member_has_capability`, edited at `/settings/roles`.

The application never followed. Verified live:

- the Settings page's own membership query asked for `department`,
  `permissions` and the workspace's `invite_code` → **400**. The whole page
  rendered with no workspace: no name, no team, no payment terms, no plan.
- `getWorkspaceMembers` asked for six absent columns → **400**. Team list empty.
- `inviteTeamMember` and `offboardTeamMember` gated on `role, permissions`
  first, so both told the workspace owner they lacked permission.
- `updateMemberRole` — the live role picker — filtered on `id`.
- `member_has_permission` and `get_member_permissions` (DB functions) raise
  `42703` on call. Neither is referenced by any RLS policy, which is the only
  reason this was not worse.
- `hasPermission`, `hasPermissions`, `requirePermission` and five `canView*` /
  `canManage*` wrappers all failed closed for everyone. No callers.

**Fixed**, in commit `cdcbfcfd`. A member is identified by
`(workspace_id, user_id)` now, which is the table's actual primary key.
The per-member permissions grid and the department select are deleted rather
than repaired: the grid granted the same five capabilities the role editor
grants — two sources of truth for one question — and had never saved once.

## 3. Creating a workspace was six writes and a hand-written undo

`initializeOrganization` did six sequential writes and compensated by hand. The
compensation was already wrong:

> Step 3 creates the owner's person entity with `owner_workspace_id` set to the
> new workspace. If step 4 (`workspace_members`) fails, the rollback deletes the
> org entity and the workspace — but not the person.
> `directory.entities.owner_workspace_id` references `workspaces(id)` with **no
> ON DELETE**, so that workspace DELETE raises a foreign-key violation. Its
> result was never checked.

The user is told setup failed. The workspace and the person entity are still
there. That is the shape of the orphaned workspace found in production earlier
this week: no members, no entities, no deals, belonging to nobody.

**Fixed.** Migration `20260910080000` adds
`public.create_workspace_with_owner`, which does all seven writes in one
transaction. There is no compensation logic left to be wrong. It also takes a
transaction-level advisory lock on the caller and returns the workspace they
already own by that name, so the double-click, the impatient refresh and the
client retry — all ordinary on a slow onboarding submit — stop producing a
second workspace.

## 4. Features reading tables that do not exist

Every one verified with a live request. All 404.

| Referenced | Reality | Effect |
|---|---|---|
| `public.talent_skills` | `ops.crew_skills`, keyed by entity id | every skill badge and skill list empty |
| `public.locations` | venues are `directory.entities` | Settings locations panel always empty; add button always failed |
| `public.qbo_configs`, `public.finance` | `finance.qbo_connections` | Settings reported QuickBooks disconnected either way |
| `workspaces.invite_code` | no such column | invite-code panel rendered nothing, always |
| `public.org_private_data` | nothing yet — see below | client private notes silently discarded |
| `public.tasks`, `knowledge_snippets`, `inbox` | never existed | unrouted prototype pages |
| `deal_stakeholders` unqualified | `ops.deal_stakeholders` | stakeholder fallback for deal finance and proposals always denied |

The `/capture` and `/inbox` pages and the `/api/capture` route are deleted.
Nothing linked to them, they wrote to tables that never existed, and the route
accepted unauthenticated POSTs that inserted rows with no `workspace_id`.

`regenerate_invite_code` and `workspace_joinable_by_invite` still exist in the
database and reference `invite_code`, `created_by` and `updated_at`, none of
which are columns of `public.workspaces`. Both raise if called. Nothing calls
them. **Open.**

## 5. Private notes on a client — open

`org_private_data` was keyed `(owner_org_id, subject_org_id)`: notes one
workspace keeps about another party. The table is gone, so the write 404'd and
the two callers — the client card on a deal, and the Private notes tab in the
network sheet — showed a generic failure while the owner's typed notes
disappeared.

For now the write refuses in plain words rather than pretending. Putting the
feature back means a `private_notes` column on
`directory.entity_working_notes`, which is already the per-entity,
workspace-scoped place for exactly this. It is deliberately **not** stored on
`directory.entities.attributes`: those travel with the entity, and a note one
workspace keeps about a shared or claimed org must not.

## 6. Everything else the types found

Typing the clients produced 280 errors. Two remain, and both are waiting on a
migration rather than a decision. What the other 278 turned out to be:

**Queries against columns that are gone.** `workspace_members.created_at` in
the session hydrator and the login diagnostic. `deals.client_name` on the
printed run-of-show, which is why the client line has always read "—".
`directory.entities.name` in the crew-equipment review, which is why every
owner showed as "Unknown". `profiles.preferences` and
`profiles.onboarding_signalpay_prompted`, both accepted by functions nobody
called. `ops.events.start_at`, read and written by the reschedule action, where
the column is `starts_at` -- so rescheduling matched nothing.

**Queries against the wrong schema.** `patch_event_ros_data` is `ops.` and was
called unqualified from the deal handover, the band-data save and the DJ-prep
save. `match_memory` is `cortex.`, called unqualified from the Aion embeddings
search, so semantic memory could never return a row. `patch_entity_attributes`
is `public.` and two network writes called it through `.schema('directory')`.
`events` and `deal_crew` unqualified in two Aion production tools.

**A value the enum does not have.** Two lobby widgets filtered
`.in('status', ['accepted', 'signed'])`; `proposal_status` is
draft/sent/viewed/accepted/rejected, so Postgres rejected the query and both
widgets rendered empty.

**A column the table does not have.** `proposalSwapAction` wrote `is_taxable`
onto `proposal_items`, which does not have it -- taxability lives inside
`definition_snapshot`, which the same statement was already writing. Every
package swap failed. Its test asserted the top-level column, so the test passed
against a statement Postgres was rejecting.

**Nullable columns used as though they were not.** `workspace_members.role` in
four role checks and the workspace router. `deal_crew.entity_id` and
`crew_assignments.entity_id`. `ops.events.workspace_id` on both song-request
audit paths. `passkeys.created_at`, fed straight to `new Date()` in the identity
export. `projects.project_id` in the conflict checker, where `.eq(col, null)`
becomes `id=eq.null` and matches nothing -- indistinguishable from "belongs to
another workspace".

**NOT NULL columns written null.** `deals.proposed_date`.
`ops.crew_assignments.role`, which is NOT NULL with a default of `''` and was
being given `deal_crew.role_note`, which is nullable -- one crew row with no
note failed the insert and took the whole rate sync with it.

**Casts that defeated the checker rather than satisfying it.** Three
`as unknown as { schema: ... }` wrappers left over from before the generated
types covered all six schemas; `as Record<string, unknown>` on four insert and
update payloads. Each one replaced a checked row shape with `unknown`.

**JSONB payloads typed `Record<string, unknown>`.** About forty. Not wrong at
runtime, but unchecked: `unknown` admits a Date, a Map, a class instance, and
supabase-js hands the payload to `JSON.stringify`, so those arrive as a string,
as `{}`, and not at all. `src/shared/lib/jsonb.ts` names the shape to build
them in. Structured domain types on their way into JSONB columns
(`PackageDefinition`, the proposal definition snapshot, the run-of-show
payloads) keep an explicit cast, named as a boundary.

**Rows asserted rather than parsed.** `run_of_show_cues.assigned_crew` and
`assigned_gear` are JSONB and were handed to callers as `Cue` without ever
being looked at. `toCue` and `toRosTemplate` parse at the boundary now -- which
also caught `saveRosTemplate` skipping the normalisation entirely, so a
template saved with sections came back from its own save still wrapped.

**Nullable RPC arguments.** 38 of them, each checked against its parameter's
Postgres default before being changed.

### Zero

All three migrations are applied and the types are regenerated:

  20260910060000  workspaces UPDATE policy + column grants
  20260910080000  create_workspace_with_owner
  20260910100000  profiles.passkey_nudge_dismissed_at

Verified against the live database rather than assumed: `authenticated` can
update `portal_theme_preset` and `sending_domain` and cannot update
`stripe_customer_id` or `subscription_tier`; `anon` cannot update
`public.workspaces` at all; `authenticated` may execute
`create_workspace_with_owner` and `anon` may not. The two selects that used to
answer 400 -- the settings page's membership query and the passkey nudge read
-- answer 200. `create_workspace_with_owner` was smoke tested through its
unauthenticated guard, which returned before any insert.

The regeneration surfaced one last error worth naming: `callMetric` dispatches
on a schema and function name taken from the metric registry, so there is no
literal for TypeScript to resolve and it intersects five RPC-name unions into
`never`. That cast stays -- but the comment above it claimed the generated types
only covered public, which has not been true since PR 6.5, and now says what is
actually being asserted and what checks it instead.

**280 type errors to 0.** 2,127 tests pass, both ratchets pass.

**Do not turn the `<Database>` generic back off.** It is the only thing standing
between this class of bug and the next release.

## 7. What CI caught that I had not

Three failures on the first push, all mine, and the last is the one worth
remembering.

**A sync export in a `'use server'` file.** `billToDiffering` is a comparison
over rows already in hand -- not async, not an action -- exported from
`deal-stakeholders.ts`. Next.js requires every export from such a file to be a
directly-defined async function. `tsc` does not catch it and neither does the
test suite; only `next build` does.

**A safety assertion that was wrong about a fresh database.** The
orphan-workspace migration asserted that at least one workspace with members
survives. True on production; on an empty Postgres there are none to begin
with, so it raised and the RLS job stopped there. "There were never any" is not
the same failure as "they are gone" -- it counts before and after now.

**`add_co_host_edge` had been throwing on every call since 20260909120000.**
`cortex.relationships` has one unique index on those three columns and it is
partial (`WHERE ended_at IS NULL`). A bare `ON CONFLICT (cols)` cannot use a
partial index; Postgres raises 42P10 at runtime. The rewrite from replace to
merge dropped the predicate from both inference clauses, so **linking a partner
failed outright** -- the edge the whole couples feature reads was unwritable.
Confirmed by running both forms against production inside a transaction and
rolling back: bare returned 42P10, guarded succeeded.

pgTAP test 01300 exists to catch exactly this and had been failing the entire
time. It was never run, because Docker is unavailable locally and `tsc` plus
unit tests plus the two ratchets felt like enough. They are not enough for a
database function or for a `'use server'` boundary, and the two things that do
catch them -- `next build` and `supabase test db` -- both live in CI.

Test 01200 was widened to accept column-level grants, since `public.workspaces`
is deliberately built that way, and given a second assertion so the widening has
a floor: `authenticated` cannot update `stripe_customer_id`,
`stripe_subscription_id`, `subscription_tier`, `billing_status`, `extra_seats`
or `trial_ends_at`.

## Rules that follow from this

1. **Never construct a Supabase client without `<Database>`.** All three now
   have it.
2. **A write that must land must prove it landed.** `writeLanded` on any
   UPDATE or DELETE whose table's policy set you have not read.
3. **Multi-step creation belongs in one transaction.** If it spans more than
   two tables, it is a SECURITY DEFINER RPC, not a sequence with an undo.
4. **A policy decides who; a column grant decides which.** Reach for both
   before reaching for a bespoke RPC per column.
5. **`CREATE FUNCTION` grants EXECUTE to PUBLIC.** Every new one REVOKEs and
   GRANTs explicitly, with an assertion block in the same migration. So does
   `CREATE OR REPLACE`: it inherits an existing ACL but leaves `proacl` NULL on
   a fresh database, and NULL means PUBLIC.
6. **`ON CONFLICT` against a partial index must repeat the predicate.** A bare
   inference clause raises 42P10 at runtime, not at creation.
7. **`tsc`, unit tests and the ratchets do not cover a database function or a
   `'use server'` boundary.** `supabase test db` and `next build` do. Push early
   rather than assuming.
