/**
 * Client portal footer.
 *
 * Small trust signal: "Powered by Unusonic". The vendor is the foreground
 * identity (§3 principle 2); Unusonic is recessed into the footer so the
 * client knows the infrastructure is trustworthy without it competing for
 * attention.
 *
 * @module features/client-portal/ui/client-portal-footer
 */
import 'server-only';

export function ClientPortalFooter() {
  return (
    <footer
      className="mt-16 flex items-center justify-center gap-2 px-6 py-6 text-[11px] uppercase tracking-[0.16em]"
      style={{
        color: 'var(--portal-text-secondary, var(--stage-text-tertiary))',
        borderTop: '1px solid var(--portal-border-subtle, var(--stage-border))',
      }}
    >
      <span>Powered by</span>
      <span style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}>Unusonic</span>
    </footer>
  );
}
