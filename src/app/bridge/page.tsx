import type { Metadata } from 'next';
import { DownloadButtons, InstallGuideLink } from './download-buttons';

/**
 * /bridge — Unusonic Bridge download page.
 *
 * Public (no auth required). Served from the root layout with full Stage
 * Engineering tokens. The copy is verbatim from the User Advocate research
 * — it's the reversibility contract the working DJ needs to see before
 * installing any app that touches their Serato library.
 *
 * Tagline: "Synced by load-in."
 */

export const metadata: Metadata = {
  title: 'Unusonic Bridge — Synced by load-in',
  description:
    'Bridge builds your show crate in Serato automatically. Install it on your laptop, pair it with Unusonic, and your next gig is already prepped when you open Serato.',
  openGraph: {
    title: 'Unusonic Bridge — Synced by load-in',
    description: 'Show prep, already in Serato.',
  },
};

export default function BridgeDownloadPage() {
  return (
    <div
      className="min-h-dvh w-full flex flex-col items-center px-6 py-16 md:py-24"
      style={{
        backgroundColor: 'var(--stage-bg)',
        color: 'var(--stage-text-primary)',
      }}
    >
      {/* Hero */}
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--stage-text-tertiary)] mb-5">
          Unusonic Bridge
        </span>

        <h1 className="text-4xl md:text-6xl font-medium tracking-tight mb-4">
          Synced by load-in.
        </h1>

        <p className="text-lg md:text-xl text-[var(--stage-text-secondary)] font-light leading-relaxed mb-10 max-w-xl">
          Bridge builds your show crate in Serato automatically. When you open
          Serato on prep night, the crate for your next gig is already there —
          matched to your local library, labeled by moment, ready to go.
        </p>

        <DownloadButtons />

        <div className="mt-4">
          <InstallGuideLink />
        </div>
      </div>

      {/* Trust contract — the User Advocate's exact phrasing */}
      <section className="w-full max-w-2xl mt-20 md:mt-28">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--stage-text-tertiary)] mb-5">
          What Bridge does — and what it never does
        </h2>
        <div className="stage-panel rounded-2xl p-6 md:p-8 space-y-4 text-[15px] leading-relaxed text-[var(--stage-text-secondary)]">
          <p>
            Bridge reads your Unusonic show program and builds a Serato crate.
          </p>
          <p>
            It never touches your existing crates. It never moves, renames, or
            modifies your music files. You can delete the Bridge crate anytime
            with zero side effects.
          </p>
          <p>
            Every Bridge crate lives in a dedicated <span className="font-mono text-[13px] bg-[var(--ctx-well)] px-1.5 py-0.5 rounded">Unusonic</span> folder inside Serato&apos;s sidebar — visually
            separate from your own work. If a song from the client&apos;s must-play
            list isn&apos;t in your library, Bridge marks it as a visible missing
            track so you see the gap on prep night, not on stage.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-2xl mt-16 md:mt-20">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--stage-text-tertiary)] mb-5">
          How it works
        </h2>
        <div className="grid gap-4 md:gap-5">
          <Step
            number="1"
            title="Install Bridge on your laptop"
            body="Download and install. It lives in the menubar (Mac) or system tray (Windows). You never interact with it directly."
          />
          <Step
            number="2"
            title="Connect it to Unusonic"
            body="Open your Unusonic profile, generate a pairing code, type it into Bridge. That's it."
          />
          <Step
            number="3"
            title="Open Serato on prep night"
            body="Your next show's crate is already there. First dance, cocktail hour, open dancing — each moment labeled. Must-plays, play-if-possibles, and the do-not-play list all threaded in."
          />
          <Step
            number="4"
            title="Last-minute changes sync automatically"
            body="The planner adds 'Dancing Queen' at 4:15pm the day of. By the time you walk into the venue, it's in your crate. You didn't touch anything."
          />
        </div>
      </section>

      {/* System requirements */}
      <section className="w-full max-w-2xl mt-16 md:mt-20">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--stage-text-tertiary)] mb-5">
          Requirements
        </h2>
        <div className="stage-panel rounded-2xl p-6 md:p-8">
          <dl className="grid md:grid-cols-2 gap-4 text-sm">
            <Requirement label="macOS" value="10.15 Catalina or later" />
            <Requirement label="Windows" value="Windows 10 or later" />
            <Requirement label="Serato" value="Any recent version" />
            <Requirement label="Rekordbox" value="XML export supported" />
            <Requirement label="Size" value="~10 MB installed" />
            <Requirement label="Unusonic account" value="Any tier — Bridge is free" />
          </dl>
        </div>
      </section>

      {/* Footer note */}
      <div className="mt-20 text-[11px] text-[var(--stage-text-tertiary)] text-center max-w-md">
        Bridge is made by Unusonic. Your pairing links Bridge to your Unusonic account
        — not to any specific production company. If you leave a workspace, the crates
        you already built stay on your laptop.
      </div>
    </div>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="stage-panel rounded-xl p-5 md:p-6 flex gap-5">
      <div className="text-2xl font-mono font-medium text-[var(--stage-text-tertiary)] shrink-0 w-8">
        {number}
      </div>
      <div>
        <h3 className="text-sm font-medium text-[var(--stage-text-primary)] mb-1.5">
          {title}
        </h3>
        <p className="text-[13px] text-[var(--stage-text-secondary)] leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}

function Requirement({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-[var(--stage-text-tertiary)]">
        {label}
      </dt>
      <dd className="text-[var(--stage-text-primary)]">{value}</dd>
    </div>
  );
}
