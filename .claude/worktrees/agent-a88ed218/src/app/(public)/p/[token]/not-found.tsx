/**
 * Public proposal not found – invalid or expired token
 */

export default function PublicProposalNotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-2xl font-light text-ink tracking-tight">
        Proposal not found
      </h1>
      <p className="text-ink-muted mt-2 max-w-sm">
        This link may be invalid or the proposal may have been withdrawn.
      </p>
    </div>
  );
}
