/**
 * Public Invoice Layout — `/i/*`
 *
 * Light theme layout for client-facing invoice pages.
 * No sidebar, no dashboard shell, no auth required.
 * Mirrors the (public) layout pattern for proposals.
 *
 * @module app/i/layout
 */

export default function PublicInvoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-dvh max-h-dvh w-full overflow-x-hidden overflow-y-auto antialiased"
      style={{
        backgroundColor: '#fafafa',
        color: '#111',
        fontFamily: 'var(--font-geist-sans, Inter, system-ui, sans-serif)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
      }}
    >
      <main className="relative z-0 min-h-dvh flex flex-col">
        {children}
      </main>
    </div>
  );
}
