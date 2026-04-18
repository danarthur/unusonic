Run a full owner-walkthrough stress test of Unusonic as if you were a production-company owner entering a real event end-to-end. Dispatch 6 Explore agents in parallel, one per slice. **Quality of findings > quantity — a clean slice is a valid result.**

## Six slices

1. Auth, onboarding, workspace bootstrap, passkey + recovery
2. CRM, contacts/directory, deals, proposal builder (lead intake → proposal sent)
3. Deal-to-Event handoff wizard + event creation / event detail shell
4. Event Plan tab: crew, equipment, run of show, production team card
5. Billing: finance.invoices, payments, Stripe webhook, QBO sync, client invoice view
6. Client portal + email flows + Aion/Brain tab

## Agent contract (strict)

Each agent is a read-only inspector. Pure code inspection — do NOT run the dev server, do NOT edit files. Grepping, reading files, and inspecting git history IS allowed and encouraged.

**Before flagging ANY finding, the agent MUST complete this four-step verification. If any step invalidates the concern, the finding is dropped.**

1. **Read 10 lines before and 10 lines after the flagged line.** If a comment in that window explains or justifies the code, the finding is invalid. Most false positives are deliberate decisions with inline rationale.
2. **Trace at least one caller.** Grep for the flagged symbol (`grep -rn 'functionName(' src/`) and read one callsite. If the concern (missing try/catch, silent fail, unvalidated input) is already handled upstream, the finding is invalid.
3. **Check git history on the touched lines.** Run `git log -p -S '<short identifier>' -- <file> | head -80`. If the fix for the concern was landed in a recent commit and is visible in the current file, the finding is invalid.
4. **Check CLAUDE.md and `docs/reference/` for documented exceptions.** Before flagging a rule violation (five-schema, portal, brand, RLS, cortex writes, table deprecation), confirm the project docs do not document the file / table / pattern as grandfathered or intentional.

**Flag as CONFIRMED only when all four checks pass.** If a check couldn't fully resolve the concern — e.g. couldn't trace all callers, couldn't grep exhaustively — downgrade to SUSPECTED and say so explicitly. SUSPECTED is honest and useful; unverified CONFIRMED is noise.

## What to look for

- TODO / FIXME / HACK comments describing known unfinished work (quote the comment text)
- Throws on happy paths — only after verifying no upstream catch
- Stub server actions returning `{ success: true }` without persisting — verify by reading the RPC / insert / update call
- Dead buttons (`href="#"`, empty `onClick`, forms with no `action` or `onSubmit`)
- Reads of removed tables: `public.invoices`, `public.invoice_items` (removed 2026-04-12), `contacts`, `clients`, `people`, `organizations`, `public.events` (deprecated — new code must use `ops.events`), `org_members`, `org_relationships`, `spine_items`, `catalog_embeddings`
- Calls to removed RPCs: `create_draft_invoice_from_proposal` (replaced by `finance.spawn_invoices_from_proposal`)
- Legacy brand names in code or user-visible copy: `Signal`, `Signal Live`, `ION` (as AI name), `signal_*`, `SIGNAL_PHYSICS`, `runsignal.live`, `IonInput` / `IonVoice` / `IonLens` / `IonOnboardingShell`, `/api/ion`, "Ask Signal..."
- Next.js 16 async-params misuse: `params.x` / `searchParams.x` / `cookies().x` without `await`
- Inconsistent copy tone: exclamation marks, Title Case where sentence case belongs, "event" instead of "show" in owner-facing UI, "resources" instead of "crew", "Gig" leaking into UI
- Broken empty states, user-visible "coming soon" / "not implemented" / "WIP"
- **Tailwind v4 wildcard landmine: never write a literal Tailwind arbitrary-value class with a placeholder character inside the brackets.** Tailwind v4 scans every file (markdown, comments, ESLint messages) and emits CSS for whatever it finds — a placeholder character becomes invalid CSS that turbopack rejects. Always use the real token name, or describe the rule in prose.
- RLS gaps, `service_role` leaks to client bundles (`system.ts` imported outside server files)
- `SECURITY DEFINER` RPCs missing `REVOKE FROM PUBLIC` / `anon` in migrations
- Ghost Protocol violations (gating on sign-up for adds; `ROSTER_MEMBER` for freelancers vs. `PARTNER` with `tier: 'preferred'`)
- Raw `entity.attributes` dot/bracket access in server actions (must use `readEntityAttrs`)

## What NOT to flag (false-positive anti-examples)

**Do not include these. Each one wasted a review cycle in a prior sweep:**

- A throw that looks unhandled in isolation — the caller catches it. Read the caller before flagging.
- "Add X" when X is already on the flagged line. Re-read character by character (e.g. `raw.trim().slice(0, 100)` already trims).
- "Should migrate to schema Y" when CLAUDE.md lists the table as grandfathered (`public.contracts`, `public.proposals`, `public.deals`, `public.run_of_show_cues`).
- "Add Sentry logging" when `Sentry.captureMessage` / `Sentry.logger.error` is already in that exact block.
- "Portal the backdrop" when `createPortal(backdrop, document.body)` is already in the code — that IS the canonical pattern (CLAUDE.md §10).
- "Refactor this into a helper" / "function too long" / "extract for readability" — out of scope. `/sweep` is for owner-impact bugs, not maintainability nits.
- Speculation without a concrete reproducer — "could race", "might fail", "what if the user…" with no evidence in the code.
- Duplicate findings for the same root cause in different files — merge into ONE finding with a `Locations:` list.

## Output format

Each agent returns markdown:

```
## Slice N: <slice name>

### CONFIRMED — CRITICAL
- `file:line` — <issue> — <owner impact> — <fix>
  - Verified: <what you checked — e.g. "caller at foo.tsx:212 has no try/catch; Sentry not called anywhere in the block">

### CONFIRMED — HIGH
…

### CONFIRMED — MEDIUM
…

### CONFIRMED — LOW
…

### SUSPECTED (could not fully verify)
- `file:line` — <issue> — <what you couldn't verify and why>

### Checked and clean
One paragraph listing the areas inspected that showed no issues — e.g. "Stripe webhook signature flow, QBO advisory-lock token refresh, RLS on `finance.*` tables." Keeps the report honest about coverage and prevents "no findings" from being misread as "didn't look."
```

**No cap on findings.** Return only what survives the verification checklist. Three CONFIRMED findings plus a healthy "Checked and clean" block is a better slice than thirty noisy entries. Zero CONFIRMED findings is valid if the slice is genuinely clean.

## Collation

After all 6 return, collate into `docs/audits/owner-walkthrough-YYYY-MM-DD.md` (today's date from the environment block):

- **Top summary:** counts per CONFIRMED tier, total SUSPECTED, count of "checked clean" surface areas.
- **Per-slice sections** preserving each agent's structure.
- **Cross-slice dedupe:** if the same root-cause finding appears in 2+ slices, merge into ONE entry under the most relevant slice with `Also surfaced in: Slice X, Slice Y`. Do not list the same bug three times.
- **Quick wins** at the end: ≤10 CONFIRMED items the user can knock out in under 30 min each. Never pull from SUSPECTED.

Print the doc path and one-line severity-count summary when done.
