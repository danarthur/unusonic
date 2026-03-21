import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CommandPaletteProvider } from "@/shared/ui/providers/CommandPaletteContext";
import { SessionProvider } from "@/shared/ui/providers/SessionContext";
import { ThemeProvider } from "@/shared/ui/providers/ThemeProvider";
import { CommandSpineWithNetwork } from "./command-spine-with-network";
import { ConditionalToaster } from "@/shared/ui/conditional-toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Signal",
  description: "The Event Operating System",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Signal",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#262626",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Retry once on chunk load timeout (Next.js dev Webpack chunk issue). Clear .next and restart if it persists. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  var key = 'next-chunk-load-retry';
  function maybeRetry(msg) {
    if (msg && (msg.indexOf('ChunkLoadError') !== -1 || msg.indexOf('Loading chunk') !== -1)) {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    }
  }
  window.addEventListener('error', function(e) { maybeRetry(e.message); });
  window.addEventListener('unhandledrejection', function(e) { maybeRetry(e.reason && e.reason.message); });
})();
            `.trim(),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen h-screen overflow-x-hidden overflow-y-auto bg-canvas text-ink`}
      >
        <div className="h-full min-h-screen min-w-0 w-full flex flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <CommandPaletteProvider>
              <SessionProvider>
                {children}
              </SessionProvider>
              <CommandSpineWithNetwork />
              <ConditionalToaster />
            </CommandPaletteProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
