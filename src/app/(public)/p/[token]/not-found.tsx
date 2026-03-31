/**
 * Public proposal not found – invalid or expired token
 */

export default function PublicProposalNotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 text-center">
      <h1
        className="text-2xl font-light tracking-tight"
        style={{ color: 'var(--portal-text)' }}
      >
        Proposal not found
      </h1>
      <p className="mt-2 max-w-sm" style={{ color: 'var(--portal-text-secondary)' }}>
        This link may be invalid or the proposal may have been withdrawn.
      </p>
    </div>
  );
}
