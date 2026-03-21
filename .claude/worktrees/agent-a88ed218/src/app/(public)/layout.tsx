/**
 * Public Layout – Client portal (no AppShell / Sidebar / Header)
 * Scroll container with bottom padding so sticky bar + pill are never clipped.
 * @module app/(public)/layout
 */

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-dvh max-h-dvh w-full overflow-x-hidden overflow-y-auto bg-canvas text-ink antialiased"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2.5rem)",
      }}
    >
      <div className="grain-overlay fixed inset-0 pointer-events-none z-[1]" />
      <main className="relative z-0 min-h-dvh flex flex-col items-center overflow-visible">
        {children}
      </main>
    </div>
  );
}
