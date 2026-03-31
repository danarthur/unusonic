/**
 * Public Layout – Client portal (proposals, invoices, crew confirmation)
 * Light theme. No AppShell / Sidebar / Header.
 * The portal is the production company's face — Unusonic recedes.
 *
 * CSS custom properties (--portal-*) are set as defaults in globals.css.
 * Each page wraps its content in <PortalThemeShell> which overrides
 * the vars per-workspace. This layout consumes them.
 *
 * @module app/(public)/layout
 */

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-dvh max-h-dvh w-full overflow-x-hidden overflow-y-auto antialiased"
      style={{
        backgroundColor: 'var(--portal-bg)',
        color: 'var(--portal-text)',
        fontFamily: 'var(--portal-font-body, var(--font-sans))',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
      }}
    >
      <main className="relative z-0 min-h-dvh flex flex-col items-center overflow-visible">
        {children}
      </main>
    </div>
  );
}
