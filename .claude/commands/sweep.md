Run a full owner-walkthrough stress test of Unusonic as if you were a production-company owner entering a real event end-to-end. Goal: surface bugs, incomplete features, broken flows, dead UI, and gaps a real user would hit.

Dispatch 6 Explore agents in parallel (very thorough), each owning one slice of the owner journey:

1. Auth, onboarding, workspace bootstrap, passkey + recovery
2. CRM, contacts/directory, deals, proposal builder (lead intake → proposal sent)
3. Deal-to-Event handoff wizard + event creation / event detail shell
4. Event Plan tab: crew, equipment, run of show, production team card
5. Billing: finance.invoices, payments, Stripe webhook, QBO sync, client invoice view
6. Client portal + email flows + Aion/Brain tab

Rules for each agent:
- Pure code inspection; do NOT run the dev server, do NOT edit files.
- Look for: TODO/FIXME/HACK, throws on happy paths, stub server actions that return success without persisting, dead buttons (href="#", onClick no-ops), forms with no action wired, reads of removed tables (public.invoices, public.events, contacts, etc.), legacy brand names (Signal, ION, signal_*), Next 16 async-params misuse, inconsistent copy tone, broken empty states, "coming soon" / "not implemented".
- Return findings as markdown with CRITICAL / HIGH / MEDIUM / LOW sections, each bullet: `file:line — issue — owner impact — fix`.
- Cap at ~30 findings per slice, quality over quantity.

After all 6 return, collate into a single doc at `docs/audits/owner-walkthrough-YYYY-MM-DD.md` (use today's date from the environment block) with:
- Top summary: total findings by severity
- One section per slice
- Quick-wins list at the end (≤10 items the user can knock out fast)

Print the doc path and one-line severity count summary when done.
