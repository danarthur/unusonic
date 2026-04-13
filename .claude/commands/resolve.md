Resolve every finding in a `/sweep`-style audit doc end-to-end. The doc is the working contract — work down it slice by slice, fix what can be fixed, propose what needs approval, and report the result.

## Input

If the user passes a path, use it. Otherwise glob `docs/audits/owner-walkthrough-*.md` and pick the most recently modified — print the chosen path before starting.

Read the doc fully. Build a task list with one task per slice (typically 5–6) plus a final "verify build + lint + type check" task. Mark each task in_progress when you start it and completed when its commit lands.

## Per slice

For each slice:

1. **Read in parallel.** Pull every file referenced in the slice in one tool-use block. Don't read them one at a time.
2. **Group fixes by file.** Many findings touch the same file — coalesce into one Edit pass per file when possible.
3. **Honor the project rules.** Especially:
   - ESLint `no-restricted-syntax` bans the variable name `attrs` in actions/api files. When introducing `readEntityAttrs(...)`, name the result by entity type (`companyAttrs`, `coupleAttrs`, `venueAttrs`) — never `attrs`.
   - Tailwind v4 wildcard landmine — never write `bg-[var(--token-*)]` anywhere.
   - Five-schema rule: no new tables in `public`. Direct subquery RLS for `public`, `get_my_workspace_ids()` for `directory`/`ops`/`finance`/`cortex`.
   - Cortex writes via `SECURITY DEFINER` RPC only.
   - Brand enforcement: `Signal` → `Unusonic`, `ION` → `Aion` (with the documented exceptions in CLAUDE.md).
4. **Don't expand scope without asking.** When a finding requires a migration, a new domain event type, a new feature surface, or a 14k-token component split — stop, present the plan as a fork, and wait for approval. Memory: "Premium outcome over speed" — give the user the choice.

## Gating rules (require explicit user approval)

Stop and propose before doing any of these:

- **Database migrations.** Draft the SQL + RLS notes + which file regenerates types, then ask. Apply via the Supabase MCP tool only after approval. Run `npm run db:types` after.
- **New domain event types** in `src/shared/lib/domain-events/types.ts`. Per the design comment, every new type needs a consumer story.
- **Schema changes that touch the five-schema split** (new tables, FK additions, etc.).
- **Net-new features** that didn't exist before (e.g. "implement X recommender"). Present scope as a fork — minimal / targeted / full — and let the user pick.
- **Component refactors > 1000 lines** that you can't visually verify. Confirm the user wants the split before doing it.

For everything else — bug fixes, raw-cast replacements, dead-code removal, NaN guards, missing fallbacks, log additions — just do it.

## When a finding is wrong

Audit agents misread state. If a finding is already resolved or based on a wrong assumption, verify by reading the current file and either:
- Skip it and note in the final report, OR
- Address an adjacent real issue in the same area if you find one.

Don't argue with the audit in the commit; just make the code right.

## Commits

Commit at meaningful boundaries — typically one commit per slice once it builds clean. Use the project's commit-message style:

- Subject line: `<type>(<scope>): <imperative>` matching recent history (`fix:`, `feat:`, `refactor:`, `chore:`).
- Body: what was changed and why per slice. Reference the audit's severity terms (CRITICAL/HIGH/MEDIUM) when it clarifies impact.
- Sign with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.

If a slice surfaces deferred items, list them at the bottom of that slice's commit message.

## Verification (final task)

Before declaring done:

1. `npx tsc --noEmit` — filter to non-`.next/types`, non-`/worktrees/` errors. Touched files must be clean.
2. `npm run lint` — survey only the files you changed. Report any errors you introduced. Pre-existing warnings are not your problem.
3. `npm run build` — must succeed. If it fails on something pre-existing (ghost imports, missing modules) — flag it but don't auto-fix; ask the user.
4. Run any test files in folders you touched. New tests should pass; if you rewrote a test for behavior you changed, make sure it covers the new behavior, not the old.

## Final report

Send the user a short summary message with:

- Table of commits (`hash` — one-line description).
- Count of resolved findings vs total.
- **Deferred items** with one-sentence reasons (migration approval, architectural scoping, visual verification, etc.).
- Clean state confirmation: `tsc clean`, `build green`, `tests pass`.

End with a single question if anything needs the user's input (e.g. "OK to apply migration X?"), otherwise end with the doc-deletion suggestion: "audit fully resolved — delete `<path>` if you want a clean slate for the next sweep."

## Don't

- Don't run the dev server to "verify" UI changes — you can't see them. Say so explicitly.
- Don't add backwards-compat shims for code you removed.
- Don't write planning markdown files. Work from conversation context.
- Don't commit untracked files you didn't create.
- Don't barrel through migrations or feature additions without user approval.
- Don't paste the full audit back at the user — they wrote it.
