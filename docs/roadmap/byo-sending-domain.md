# BYO Sending Domain — Roadmap Note

**Status:** deferred past Phase 1 pilot. Captured here from the 2026-04-24
Replies inbound hardening pass.

## Context

During the User Advocate research pass for the Replies feature, Marcus
(composite production-company owner) was emphatic on a single point:

> Clients WILL see the From address in their inbox. If the bride's mom is
> on her iPad and sees `thread-1b0d97d7-...@replies.unusonic.com` or any
> Unusonic-branded sender on a $85K wedding, I look like an amateur
> SaaS-trapped vendor. The From must say me. My name. My domain.

Today, outbound from Unusonic sends as:

```
From: "Unusonic" <hello@unusonic.com>
Reply-To: thread-{uuid}@replies.unusonic.com
```

The From is acceptable for Phase 1 (it's not a UUID, it's a clean
company-branded sender) but falls short of the Marcus standard for high-
stakes B2B relationships.

## The path forward

`getWorkspaceFrom()` at [`src/shared/api/email/core.ts:65`](../../src/shared/api/email/core.ts#L65)
already supports a verified custom sending domain per workspace:

```typescript
if (ws?.sending_domain_status === 'verified' && ws.sending_domain) {
  const localpart = ws.sending_from_localpart ?? 'hello';
  const displayName =
    senderName?.trim() || ws.sending_from_name?.trim() || 'Unusonic';
  return `${displayName} <${localpart}@${ws.sending_domain}>`;
}
```

What's missing is the owner-facing workflow to verify and configure a
sending domain. The back-end plumbing exists; the UI and domain
verification flow do not.

## Scope of the Phase 1.5 initiative

### Must ship

1. **`/settings/email` page** — new section in workspace settings where
   owner enters their sending domain and display name. Copy: "Clients
   will see email from this address — not from Unusonic."
2. **Resend domain provisioning** — automate `resend.domains.create`
   through a server action, capture the `resend_domain_id` into
   `public.workspaces.resend_domain_id`.
3. **DNS verification checklist** — UI shows the DKIM CNAMEs, SPF TXT,
   and return-path records the owner needs to add at their registrar.
   Poll `resend.domains.get` until verified; flip
   `sending_domain_status` column.
4. **Resend inbound webhook integration** — we already receive
   `domain.updated` events via [`src/app/api/webhooks/resend/route.ts`](../../src/app/api/webhooks/resend/route.ts).
   Hook it up to update `sending_domain_status` automatically.
5. **Matching Reply-To domain** — when the workspace is on their own
   domain, outbound should use `thread-{uuid}@replies.{their-domain}`
   not `thread-{uuid}@replies.unusonic.com`. This requires a separate
   Postmark Inbound Server per workspace (or a shared server with
   per-workspace custom inbound domain forwarding). Work out the cost
   model before committing to per-workspace Postmark servers.

### Should ship (same sprint if possible)

6. **Reply-To invisibility** — many modern mail clients expand
   Reply-To when it differs from From and show a "This email was
   Reply-To: xyz" banner. For power users, set both From and Reply-To on
   the same domain to eliminate the banner entirely.
7. **Fallback degradation** — workspaces mid-verification (DNS not yet
   live) should fall back to `unusonic.com` cleanly rather than bounce.
   Tested via `sending_domain_status IN ('pending', 'temporary_failure')`.
8. **Bounce reconciliation** — surface delivery failures (`email.bounced`
   events from Resend) on the deal so owners see "That email to the
   bride bounced — wrong address?" rather than discovering the silence.

### Defer to Phase 2

9. **DMARC enforcement on owned domains** — detection and remediation
   wizard if workspace has a domain but no DMARC record.
10. **Parallel domain strategy** — owner can verify both `myproduction.com`
    (high-trust) and `myproduction-email.com` (transactional) per
    Linear/Vercel's pattern, with the transactional domain carrying the
    replies alias.

## Dependencies

- Resend API access is already provisioned. `getResend()` factory works.
- `public.workspaces` already has `sending_domain`, `sending_domain_status`,
  `sending_from_name`, `sending_from_localpart`, `resend_domain_id` columns.
- The `/settings/email` route doesn't exist yet. Route group: probably
  `/(dashboard)/(features)/settings/email` alongside existing settings.

## Why this matters

This is the single biggest perceived-quality lever for Replies. Marcus's
quote holds: for a production company selling high-ticket services, the
sender identity IS the brand. Every SaaS vendor who ships with their own
domain in the From field immediately reveals the seams. Ones who invest
in BYO-domain (Intercom, Front, HubSpot, Resend itself) sell themselves
to customers who want brand invisibility.

## Tracking

- No ticket opened yet. Open when Phase 1 pilot lands and we have
  two-week usage data to prioritize against.
- Next review: post-Invisible-Touch-Events pilot Week 2 retrospective.

## Related

- [Replies design doc](../reference/replies-design.md) — the inbound pipeline
  already assumes per-workspace reply aliases, so adding a per-workspace
  reply domain is incremental, not a rebuild.
- [Email sending reference](../reference/code/email-sending.md) — existing
  `getWorkspaceFrom()` contract.
