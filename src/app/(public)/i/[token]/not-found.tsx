/**
 * Public invoice not found – invalid or expired token
 */

export default function PublicInvoiceNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <h1
        className="text-2xl font-light tracking-tight"
        style={{ color: 'var(--portal-text)' }}
      >
        Invoice not found
      </h1>
      <p className="mt-2 max-w-sm" style={{ color: 'var(--portal-text-secondary)' }}>
        This link may be invalid or the invoice may have been removed.
      </p>
    </div>
  );
}
