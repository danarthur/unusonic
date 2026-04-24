import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, Apple, Monitor } from 'lucide-react';

/**
 * /bridge/install — Install guide for Unusonic Bridge.
 *
 * Covers the "why does my OS say this app is suspicious" problem that
 * affects Phase 1.0 (no signing) and early Phase 1.5 (fresh cert, no
 * SmartScreen reputation yet). The User Advocate funnel analysis says
 * 10% of interested DJs bail at Gatekeeper/SmartScreen warnings — this
 * page is the escape valve.
 */

export const metadata: Metadata = {
  title: 'Installing Unusonic Bridge',
  description:
    'How to install Unusonic Bridge on macOS and Windows, including how to clear the security warnings on your first install.',
};

export default function BridgeInstallPage() {
  return (
    <div
      className="min-h-dvh w-full flex flex-col items-center px-6 py-16 md:py-24"
      style={{
        backgroundColor: 'var(--stage-bg)',
        color: 'var(--stage-text-primary)',
      }}
    >
      <div className="w-full max-w-2xl">
        {/* Back link */}
        <Link
          href="/bridge"
          className="inline-flex items-center gap-1 text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors mb-8"
        >
          <ChevronLeft className="size-3" />
          Back to download
        </Link>

        {/* Header */}
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--stage-text-tertiary)] block mb-4">
          Install guide
        </span>
        <h1 className="text-3xl md:text-4xl font-medium tracking-tight mb-4">
          Installing Unusonic Bridge
        </h1>
        <p className="text-[15px] text-[var(--stage-text-secondary)] leading-relaxed mb-12 max-w-xl">
          This page covers the security warnings you may see on your first
          install, and how to get past them. You only have to do this once
          per laptop.
        </p>

        {/* macOS section */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-5">
            <Apple className="size-5 text-[var(--stage-text-secondary)]" />
            <h2 className="text-lg font-medium">macOS</h2>
          </div>

          <Step
            number="1"
            title="Open the downloaded .dmg file"
            body={
              <>
                Double-click <code className="text-[13px] bg-[var(--ctx-well)] px-1.5 py-0.5 rounded font-mono">Unusonic Bridge.dmg</code> from
                your Downloads folder. A window will open showing the Bridge app
                and a shortcut to your Applications folder.
              </>
            }
          />

          <Step
            number="2"
            title="Drag Bridge into Applications"
            body="Drag the Unusonic Bridge icon onto the Applications folder shortcut. This copies it to your system."
          />

          <Step
            number="3"
            title={'If you see "cannot be opened because the developer cannot be verified"'}
            body={
              <>
                This happens if you received a pre-release build. Two fixes,
                pick either:
                <ul className="list-disc ml-5 mt-2 space-y-1.5">
                  <li>
                    <strong>Right-click → Open.</strong> Control-click (or
                    right-click) the Bridge app in Applications, choose Open,
                    then click Open in the confirmation dialog. macOS will
                    remember and stop warning you.
                  </li>
                  <li>
                    <strong>System Settings.</strong> Open System Settings →
                    Privacy &amp; Security, scroll down, and click &ldquo;Open
                    Anyway&rdquo; next to the Bridge warning.
                  </li>
                </ul>
              </>
            }
          />

          <Step
            number="4"
            title="Confirm Bridge is running"
            body={
              <>
                Look at the top-right of your menu bar. You should see the
                Unusonic Bridge icon. Click it to see the menu (Sync Now,
                Settings, Quit). If you don&apos;t see the icon, quit Bridge and
                re-open it from Applications.
              </>
            }
          />
        </section>

        {/* Windows section */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-5">
            <Monitor className="size-5 text-[var(--stage-text-secondary)]" />
            <h2 className="text-lg font-medium">Windows</h2>
          </div>

          <Step
            number="1"
            title="Run the downloaded .exe installer"
            body={
              <>
                Double-click <code className="text-[13px] bg-[var(--ctx-well)] px-1.5 py-0.5 rounded font-mono">Unusonic Bridge Setup.exe</code> from
                your Downloads folder.
              </>
            }
          />

          <Step
            number="2"
            title={'If SmartScreen says "Windows protected your PC"'}
            body={
              <>
                This is normal for recently-signed apps — Windows shows the
                warning until a few hundred people have installed the app
                without issue. To proceed:
                <ol className="list-decimal ml-5 mt-2 space-y-1.5">
                  <li>Click the <strong>More info</strong> link in the dialog</li>
                  <li>
                    Click the <strong>Run anyway</strong> button that appears
                    below
                  </li>
                </ol>
              </>
            }
          />

          <Step
            number="3"
            title="Follow the installer"
            body="Click through the installer — it's a short wizard. Bridge installs for your user only and doesn't require admin rights."
          />

          <Step
            number="4"
            title="Confirm Bridge is running"
            body={
              <>
                Look at the system tray (bottom-right, next to the clock). You
                should see the Unusonic Bridge icon. Click it to see the menu.
                If the tray icon is hidden, click the up-arrow to expand the
                tray and drag Bridge out to pin it.
              </>
            }
          />
        </section>

        {/* Pairing section */}
        <section className="mb-14">
          <h2 className="text-lg font-medium mb-5">Next: pair Bridge with your Unusonic account</h2>

          <div className="stage-panel rounded-xl p-6 text-[14px] leading-relaxed text-[var(--stage-text-secondary)]">
            <ol className="list-decimal ml-5 space-y-3">
              <li>
                Open{' '}
                <a
                  href="/login"
                  className="text-[var(--stage-text-primary)] underline underline-offset-4 decoration-dotted"
                >
                  your Unusonic profile
                </a>{' '}
                in a browser.
              </li>
              <li>
                Scroll to the <strong>Unusonic Bridge</strong> section and
                click <strong>Connect my laptop</strong>.
              </li>
              <li>
                A code will appear, formatted like{' '}
                <code className="text-[13px] bg-[var(--ctx-well)] px-1.5 py-0.5 rounded font-mono">ABCD-EFGH</code>.
                It expires in 5 minutes.
              </li>
              <li>
                In Bridge&apos;s settings window, paste the code and click Pair. You
                should see &quot;Connected to {'{'}workspace{'}'} — found your upcoming shows&quot;.
              </li>
            </ol>
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="mb-14">
          <h2 className="text-lg font-medium mb-5">Troubleshooting</h2>

          <div className="space-y-3">
            <TroubleshootingItem
              question="Bridge says 'That code expired'"
              answer="Codes are single-use and expire in 5 minutes. Generate a fresh one in the portal and try again."
            />
            <TroubleshootingItem
              question="Bridge says 'Can't reach Unusonic'"
              answer="Check that your laptop has an internet connection, then try again. Bridge needs network access to talk to Unusonic."
            />
            <TroubleshootingItem
              question="Bridge is paired but I don't see a crate in Serato"
              answer="Bridge syncs every 60 seconds automatically, and writes crates to _Serato_/Subcrates/Unusonic. Open Serato and look under the 'Unusonic' parent in the sidebar. If it's not there yet, click 'Sync Now' from the Bridge tray menu."
            />
            <TroubleshootingItem
              question="A song I expected is missing from the crate"
              answer="If Bridge couldn't match a song to a file in your library, it shows up in the crate as a broken track named 'MISSING - Artist - Title.mp3'. That's intentional — a visible gap beats silent omission. Either add the missing file to your library and sync again, or mark it as OK in the Unusonic portal."
            />
            <TroubleshootingItem
              question="How do I uninstall Bridge?"
              answer="On Mac, drag the app from Applications to the Trash. On Windows, use the standard Apps & Features uninstaller. Either way, the crates Bridge already wrote to Serato stay where they are — you can delete the Unusonic folder in Serato's subcrates at any time with zero side effects."
            />
          </div>
        </section>

        {/* Help link */}
        <div className="text-[13px] text-[var(--stage-text-tertiary)] text-center">
          Still stuck? Talk to your production manager or{' '}
          <a
            href="mailto:support@unusonic.com"
            className="underline underline-offset-4 decoration-dotted hover:text-[var(--stage-text-secondary)] transition-colors"
          >
            email support
          </a>
          .
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex gap-5 mb-5 last:mb-0">
      <div className="text-xl font-mono font-medium text-[var(--stage-text-tertiary)] shrink-0 w-6 mt-0.5">
        {number}
      </div>
      <div>
        <h3 className="text-[15px] font-medium text-[var(--stage-text-primary)] mb-1.5">
          {title}
        </h3>
        <div className="text-[14px] text-[var(--stage-text-secondary)] leading-relaxed">
          {body}
        </div>
      </div>
    </div>
  );
}

function TroubleshootingItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <details className="stage-panel rounded-xl p-5 group">
      <summary className="text-[14px] font-medium text-[var(--stage-text-primary)] cursor-pointer list-none flex items-center justify-between gap-3">
        {question}
        <span className="text-[var(--stage-text-tertiary)] group-open:rotate-90 transition-transform text-xs">
          ▶
        </span>
      </summary>
      <p className="mt-3 text-[13px] text-[var(--stage-text-secondary)] leading-relaxed">
        {answer}
      </p>
    </details>
  );
}
