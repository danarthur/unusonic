'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

/**
 * Marketing landing page rendered at /. Sign-in routes to /login where
 * middleware silently redirects an already-authed session to the user's
 * resolved home — no login form flash for returning users.
 *
 * Access is gated while the product is in private release: all primary
 * CTAs point to a mailto until a waitlist form replaces them.
 */

const REQUEST_ACCESS_HREF = 'mailto:hello@unusonic.com?subject=Request%20access';

// ─── Header ───────────────────────────────────────────────────────────────

function LandingHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[var(--stage-text-primary)]"
          aria-label="Unusonic home"
        >
          <LivingLogo status="idle" size="sm" />
          <span className="text-sm font-medium tracking-[0.12em]">UNUSONIC</span>
        </Link>
        <nav
          className="hidden md:flex items-center gap-8 text-sm text-[var(--stage-text-secondary)]"
          aria-label="Primary"
        >
          <a href="#product" className="hover:text-[var(--stage-text-primary)] transition-colors">Product</a>
          <a href="#aion" className="hover:text-[var(--stage-text-primary)] transition-colors">Aion</a>
          <a href="#security" className="hover:text-[var(--stage-text-primary)] transition-colors">Security</a>
        </nav>
        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
          >
            Log in
          </Link>
          <a
            href={REQUEST_ACCESS_HREF}
            className="stage-panel px-4 py-2 rounded-lg text-sm font-medium text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors"
          >
            Request access
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────

/**
 * Slow concentric rings emanating from the Phase Mark. Ambient signature:
 * the name's "sonic" rendered literally, and Jung's unus mundus — unity
 * expanding outward from the conjunction of opposites at the center.
 */
function HeroResonance() {
  const rings = [0, 1, 2, 3];
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden flex justify-center"
      aria-hidden
    >
      <svg
        viewBox="-300 -300 600 600"
        className="absolute top-[16vh]"
        style={{ width: '140vmin', height: '140vmin' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {rings.map((i) => (
          <motion.circle
            key={i}
            cx="0"
            cy="0"
            fill="none"
            stroke="oklch(1 0 0 / 1)"
            strokeWidth="0.4"
            initial={{ r: 30, opacity: 0 }}
            animate={{ r: [30, 260], opacity: [0, 0.18, 0] }}
            transition={{
              duration: 14,
              delay: i * 3.5,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function LandingHero() {
  return (
    <section className="relative pt-32 pb-0 px-6 overflow-hidden">
      <HeroResonance />
      <motion.div
        className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto pt-20"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_HEAVY}
      >
        <LivingLogo status="idle" size="xl" className="mb-10 text-[var(--stage-text-primary)]" />
        <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-[var(--stage-text-primary)] mb-6 leading-[1.05]">
          The event operating system.
        </h1>
        <p className="text-lg md:text-xl text-[var(--stage-text-secondary)] font-light leading-relaxed mb-10 max-w-2xl">
          Deals, crews, finance, and show calls — in one context-aware workspace built for production.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <a
            href={REQUEST_ACCESS_HREF}
            className="stage-panel px-6 py-3 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors"
          >
            Request access
          </a>
          <a
            href="#product"
            className="px-6 py-3 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
          >
            See it running →
          </a>
        </div>
      </motion.div>
      <HeroProductPreview />
    </section>
  );
}

function HeroProductPreview() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.94, 1, 1.06]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.9, 1], [0.5, 1, 1, 0.65]);

  return (
    <motion.div
      ref={ref}
      style={{ scale, opacity }}
      className="relative z-10 mx-auto max-w-5xl mt-24 px-6"
    >
      <PlaceholderTile label="Unusonic — overview" variant="app" aspect="16/10" />
    </motion.div>
  );
}

// ─── Private-beta strip ───────────────────────────────────────────────────

function PrivateBetaStrip() {
  return (
    <section className="relative py-10 px-6 border-y border-[oklch(1_0_0_/_0.04)] mt-32">
      <div className="max-w-6xl mx-auto flex items-center justify-center gap-3">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.16_145)] shadow-[0_0_10px_oklch(0.72_0.16_145_/_0.5)]"
          aria-hidden
        />
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/75">
          In private beta with production companies across North America
        </p>
      </div>
    </section>
  );
}

// ─── Value slab ───────────────────────────────────────────────────────────

function LandingValueSlab() {
  const items = [
    { title: 'Deals.', body: 'From pitch to signed contract, without the spreadsheet handoff.' },
    { title: 'Logistics.', body: 'Crews, calendars, travel, and show calls on one timeline.' },
    { title: 'Finance.', body: 'Invoices, payments, and QuickBooks — in sync with the work.' },
  ];
  return (
    <section id="product" className="relative py-32 md:py-40 px-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10 md:gap-14">
        {items.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ ...STAGE_HEAVY, delay: i * 0.08 }}
            className="flex flex-col gap-3"
          >
            <h3 className="text-2xl md:text-3xl font-medium text-[var(--stage-text-primary)] tracking-tight">
              {item.title}
            </h3>
            <p className="text-base text-[var(--stage-text-secondary)] font-light leading-relaxed">
              {item.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── Placeholder tile (with faux UI chrome variants) ──────────────────────

type TileVariant = 'plain' | 'app' | 'timeline' | 'conversation' | 'table';

function PlaceholderTile({
  label,
  variant = 'plain',
  aspect = '16/10',
}: {
  label: string;
  variant?: TileVariant;
  aspect?: '16/10' | '4/3' | '1/1';
}) {
  const aspectClass =
    aspect === '4/3' ? 'aspect-[4/3]' : aspect === '1/1' ? 'aspect-square' : 'aspect-[16/10]';
  return (
    <div
      className={`relative w-full ${aspectClass} rounded-2xl overflow-hidden border border-[oklch(1_0_0_/_0.08)]`}
      style={{
        background:
          'radial-gradient(ellipse at top, oklch(0.19 0 0) 0%, oklch(0.10 0 0) 55%, oklch(0.06 0 0) 100%)',
      }}
    >
      <div className="absolute inset-0 grain-overlay opacity-60" aria-hidden />
      {variant === 'app' && <TileChromeApp />}
      {variant === 'timeline' && <TileChromeTimeline />}
      {variant === 'conversation' && <TileChromeConversation />}
      {variant === 'table' && <TileChromeTable />}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <span className="h-1 w-1 rounded-full bg-[oklch(1_0_0_/_0.30)]" aria-hidden />
        <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/60">
          {label}
        </span>
      </div>
    </div>
  );
}

function TileChromeApp() {
  return (
    <>
      <div className="absolute top-5 left-5 flex gap-1.5" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-[oklch(1_0_0_/_0.18)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[oklch(1_0_0_/_0.14)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[oklch(1_0_0_/_0.12)]" />
      </div>
      <div className="absolute top-12 left-5 w-[18%] flex flex-col gap-2" aria-hidden>
        {[0.22, 0.16, 0.12, 0.10, 0.08, 0.08, 0.06].map((op, i) => (
          <span
            key={i}
            className="h-1 rounded-full"
            style={{ background: `oklch(1 0 0 / ${op})`, width: `${60 + (i % 3) * 14}%` }}
          />
        ))}
      </div>
      <div className="absolute top-12 left-[23%] right-6 flex flex-col gap-3" aria-hidden>
        <span className="h-1.5 rounded-full bg-[oklch(1_0_0_/_0.18)] w-1/3" />
        <span className="h-1 rounded-full bg-[oklch(1_0_0_/_0.10)] w-2/3" />
        <span className="h-1 rounded-full bg-[oklch(1_0_0_/_0.08)] w-1/2" />
        <span className="h-1 rounded-full bg-[oklch(1_0_0_/_0.08)] w-3/5" />
        <span className="h-1 rounded-full bg-[oklch(1_0_0_/_0.06)] w-2/5" />
      </div>
    </>
  );
}

function TileChromeTimeline() {
  return (
    <div className="absolute inset-6 flex flex-col gap-5" aria-hidden>
      <div className="flex items-center gap-2">
        <span className="h-1 w-1 rounded-full bg-[oklch(1_0_0_/_0.3)]" />
        <span className="h-1 flex-1 bg-[oklch(1_0_0_/_0.10)] rounded-full" />
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <span
            className="h-1 rounded-full"
            style={{ width: `${(row + 1) * 12 + 8}%`, background: `oklch(1 0 0 / ${0.18 - row * 0.03})` }}
          />
          <span
            className="h-1 rounded-full"
            style={{ width: `${24 + row * 8}%`, background: `oklch(1 0 0 / ${0.10 - row * 0.015})` }}
          />
        </div>
      ))}
    </div>
  );
}

function TileChromeConversation() {
  return (
    <div className="absolute inset-6 flex flex-col gap-4" aria-hidden>
      <div className="self-end max-w-[55%] rounded-xl bg-[oklch(1_0_0_/_0.08)] p-3 flex flex-col gap-1.5">
        <span className="h-1 w-full rounded-full bg-[oklch(1_0_0_/_0.16)]" />
        <span className="h-1 w-3/4 rounded-full bg-[oklch(1_0_0_/_0.12)]" />
      </div>
      <div className="self-start max-w-[70%] rounded-xl bg-[oklch(1_0_0_/_0.05)] p-3 flex flex-col gap-1.5">
        <span className="h-1 w-2/3 rounded-full bg-[oklch(1_0_0_/_0.14)]" />
        <span className="h-1 w-full rounded-full bg-[oklch(1_0_0_/_0.10)]" />
        <span className="h-1 w-5/6 rounded-full bg-[oklch(1_0_0_/_0.10)]" />
      </div>
    </div>
  );
}

function TileChromeTable() {
  return (
    <div className="absolute inset-6 flex flex-col gap-2.5" aria-hidden>
      <div className="grid grid-cols-4 gap-4 pb-2 border-b border-[oklch(1_0_0_/_0.08)]">
        {[0.18, 0.14, 0.14, 0.14].map((op, i) => (
          <span key={i} className="h-1 rounded-full" style={{ background: `oklch(1 0 0 / ${op})` }} />
        ))}
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="grid grid-cols-4 gap-4 py-1.5">
          {[0, 1, 2, 3].map((col) => (
            <span
              key={col}
              className="h-1 rounded-full"
              style={{
                width: `${60 + ((row + col) % 4) * 10}%`,
                background: `oklch(1 0 0 / ${0.12 - row * 0.02})`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Deep-dive sections ───────────────────────────────────────────────────

interface DeepDiveProps {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  placeholderLabel: string;
  variant?: TileVariant;
  flip?: boolean;
}

function LandingDeepDive({
  id,
  eyebrow,
  title,
  body,
  placeholderLabel,
  variant = 'app',
  flip,
}: DeepDiveProps) {
  return (
    <section id={id} className="relative py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 md:gap-20 items-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={STAGE_HEAVY}
          className={`flex flex-col gap-5 ${flip ? 'md:order-2' : ''}`}
        >
          <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70">
            {eyebrow}
          </span>
          <h2 className="text-3xl md:text-5xl font-medium text-[var(--stage-text-primary)] tracking-tight leading-[1.1]">
            {title}
          </h2>
          <p className="text-base md:text-lg text-[var(--stage-text-secondary)] font-light leading-relaxed max-w-lg">
            {body}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ ...STAGE_HEAVY, delay: 0.08 }}
          className={flip ? 'md:order-1' : ''}
        >
          <PlaceholderTile label={placeholderLabel} variant={variant} />
        </motion.div>
      </div>
    </section>
  );
}

// ─── Bento grid ───────────────────────────────────────────────────────────

interface BentoTileProps {
  title: string;
  body: string;
  className?: string;
  decoration?: ReactNode;
}

function BentoTile({ title, body, className, decoration }: BentoTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={STAGE_HEAVY}
      className={`stage-panel relative rounded-2xl p-7 md:p-8 overflow-hidden ${className ?? ''}`}
    >
      {decoration && (
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {decoration}
        </div>
      )}
      <div className="relative z-10 flex flex-col gap-2 h-full">
        <h3 className="text-lg md:text-xl font-medium text-[var(--stage-text-primary)] tracking-tight">
          {title}
        </h3>
        <p className="text-sm text-[var(--stage-text-secondary)] font-light leading-relaxed max-w-sm">
          {body}
        </p>
      </div>
    </motion.div>
  );
}

function BentoDecorTimeline() {
  return (
    <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-2 opacity-70">
      <div className="flex items-center gap-2">
        <span className="h-1 w-1 rounded-full bg-[oklch(1_0_0_/_0.3)]" />
        <span className="h-[1px] flex-1 bg-[oklch(1_0_0_/_0.10)]" />
      </div>
      {[0.22, 0.15, 0.10].map((op, i) => (
        <div key={i} className="flex items-center gap-2 pl-3">
          <span className="h-0.5 rounded-full" style={{ width: `${35 + i * 18}%`, background: `oklch(1 0 0 / ${op})` }} />
          <span className="h-0.5 rounded-full" style={{ width: `${20 + i * 8}%`, background: `oklch(1 0 0 / ${op * 0.5})` }} />
        </div>
      ))}
    </div>
  );
}

function BentoDecorRoster() {
  return (
    <div className="absolute bottom-6 right-6 flex -space-x-2 opacity-80">
      {[0.30, 0.22, 0.16, 0.12].map((op, i) => (
        <span
          key={i}
          className="h-8 w-8 rounded-full border border-[oklch(0.10_0_0)]"
          style={{ background: `oklch(1 0 0 / ${op})` }}
        />
      ))}
    </div>
  );
}

function BentoDecorDocs() {
  return (
    <div className="absolute bottom-6 right-7 flex gap-1.5 opacity-80">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-14 w-10 rounded-md border border-[oklch(1_0_0_/_0.12)]"
          style={{
            background: `oklch(1 0 0 / ${0.06 - i * 0.015})`,
            transform: `translateY(${i * -4}px) rotate(${-4 + i * 4}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function BentoDecorLink() {
  return (
    <svg
      className="absolute bottom-5 right-5 h-12 w-12 opacity-30"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 30 L30 18" />
      <path d="M14 22 a8 8 0 0 1 8 -8 l4 0" />
      <path d="M34 26 a8 8 0 0 1 -8 8 l-4 0" />
    </svg>
  );
}

function BentoDecorRoute() {
  return (
    <svg
      className="absolute bottom-4 left-0 right-0 h-16 w-full opacity-50"
      viewBox="0 0 200 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M 10 45 C 40 15, 80 55, 110 25 S 170 35, 195 15" strokeDasharray="3 4" />
      <circle cx="10" cy="45" r="2" fill="currentColor" />
      <circle cx="110" cy="25" r="2" fill="currentColor" />
      <circle cx="195" cy="15" r="2" fill="currentColor" />
    </svg>
  );
}

function BentoDecorGrid() {
  return (
    <div className="absolute bottom-5 right-5 grid grid-cols-3 gap-1.5 opacity-60">
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className="h-3 w-3 rounded-sm"
          style={{ background: `oklch(1 0 0 / ${0.18 - (i % 3) * 0.04})` }}
        />
      ))}
    </div>
  );
}

function LandingBento() {
  return (
    <section className="relative py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={STAGE_HEAVY}
          className="text-center mb-14"
        >
          <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70">
            Everything in one workspace
          </span>
          <h2 className="mt-4 text-3xl md:text-5xl font-medium text-[var(--stage-text-primary)] tracking-tight leading-[1.1]">
            Built for every part of production.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 auto-rows-[180px] md:auto-rows-[220px] gap-4 text-[var(--stage-text-secondary)]">
          <BentoTile
            title="Run of show"
            body="Every cue, call, and transition on one timeline — editable live, readable on stage."
            className="md:col-span-2 md:row-span-2"
            decoration={<BentoDecorTimeline />}
          />
          <BentoTile
            title="Proposals"
            body="Build, send, and accept — proposals that become events without re-keying."
            className="md:col-span-2"
            decoration={<BentoDecorDocs />}
          />
          <BentoTile
            title="Crew"
            body="The whole roster — travel, per diem, pay, calls."
            className="md:col-span-2"
            decoration={<BentoDecorRoster />}
          />
          <BentoTile
            title="Client portal"
            body="One link, all the approvals."
            className="md:col-span-2"
            decoration={<BentoDecorLink />}
          />
          <BentoTile
            title="Transport"
            body="Trucks, flights, hotels, buses — routed and reconciled."
            className="md:col-span-2 md:row-span-2"
            decoration={<BentoDecorRoute />}
          />
          <BentoTile
            title="Catalog & kits"
            body="Verified gear and reusable kits — gap analysis before a bid goes out."
            className="md:col-span-2"
            decoration={<BentoDecorGrid />}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Without / With ───────────────────────────────────────────────────────

function LandingWithoutWith() {
  const without = [
    'Six tools, forty-seven tabs',
    'Manual re-keying between sales and production',
    'Spreadsheet version fights',
    'Quickbooks catch-up at month-end',
    'Text threads and Slack for crew calls',
    'Proposal PDFs buried in Dropbox',
  ];
  const withIt = [
    'One context-aware workspace',
    'Accepted deals become events — inherits crew, venue, budget',
    'One source of truth per production',
    'Invoices generated and reconciled with the work',
    'Crew sees their own show data, on their phone',
    'Live proposals, client approvals in a click',
  ];
  return (
    <section className="relative py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={STAGE_HEAVY}
          className="text-center mb-14"
        >
          <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70">
            The difference
          </span>
          <h2 className="mt-4 text-3xl md:text-5xl font-medium text-[var(--stage-text-primary)] tracking-tight leading-[1.1]">
            Stop running your shows on duct tape.
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-5">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={STAGE_HEAVY}
            className="relative rounded-2xl p-8 border border-[oklch(1_0_0_/_0.05)] bg-[oklch(0.08_0_0_/_0.6)]"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/60 mb-5">
              Without Unusonic
            </div>
            <ul className="flex flex-col gap-4">
              {without.map((line) => (
                <li key={line} className="flex items-start gap-3 text-[var(--stage-text-secondary)]/80 font-light">
                  <span
                    className="mt-[0.55em] h-[1px] w-3 flex-none bg-[oklch(1_0_0_/_0.22)]"
                    aria-hidden
                  />
                  <span className="text-sm md:text-base">{line}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ ...STAGE_HEAVY, delay: 0.08 }}
            className="stage-panel relative rounded-2xl p-8"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70 mb-5">
              With Unusonic
            </div>
            <ul className="flex flex-col gap-4">
              {withIt.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 text-[var(--stage-text-primary)] font-light"
                >
                  <span
                    className="mt-[0.55em] h-1 w-1 rounded-full flex-none bg-[oklch(0.72_0.16_145)] shadow-[0_0_6px_oklch(0.72_0.16_145_/_0.5)]"
                    aria-hidden
                  />
                  <span className="text-sm md:text-base">{line}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── Design philosophy ────────────────────────────────────────────────────

function LandingPhilosophy() {
  return (
    <section className="relative py-32 md:py-40 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={STAGE_HEAVY}
          className="flex flex-col gap-6 items-center"
        >
          <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70">
            Design philosophy
          </span>
          <h2 className="text-3xl md:text-5xl font-medium text-[var(--stage-text-primary)] tracking-tight leading-[1.1]">
            A precision instrument, not another app.
          </h2>
          <p className="text-base md:text-lg text-[var(--stage-text-secondary)] font-light leading-relaxed max-w-2xl">
            Unusonic is designed in a single system called Stage Engineering — matte surfaces,
            a single warm light source, typography as quiet as the room before a show starts.
            No decoration. Nothing shouting. Every control where your hand already is.
          </p>
          <div className="mt-4 flex items-center gap-3 text-[var(--stage-text-secondary)]/60">
            <span className="h-[1px] w-12 bg-[oklch(1_0_0_/_0.12)]" aria-hidden />
            <span className="text-[10px] uppercase tracking-[0.24em]">Stage Engineering</span>
            <span className="h-[1px] w-12 bg-[oklch(1_0_0_/_0.12)]" aria-hidden />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────

interface IntegrationMarkProps {
  name: string;
  mark: ReactNode;
}

const MARK_CLASS = 'h-6 w-6 text-[var(--stage-text-primary)]/75';

function MarkQuickBooks() {
  return (
    <svg viewBox="0 0 32 32" className={MARK_CLASS} fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="currentColor" opacity="0.12" />
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <text x="16" y="20.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">qb</text>
    </svg>
  );
}

function MarkStripe() {
  return (
    <svg viewBox="0 0 32 32" className={MARK_CLASS} fill="currentColor" aria-hidden>
      <path d="M16.7 13.3c-2.5-.9-3.9-1.6-3.9-2.8 0-1 .9-1.6 2.5-1.6 2.3 0 4.6.9 6.1 1.6l.9-5.5c-1.2-.6-3.7-1.5-7.2-1.5-2.5 0-4.5.6-6 1.8C7.6 6.5 6.8 8.2 6.8 10.3c0 3.7 2.3 5.3 5.9 6.6 2.3.8 3.1 1.4 3.1 2.3 0 .9-.8 1.5-2.2 1.5-1.8 0-4.7-.9-6.6-2l-.9 5.6c1.7 1 4.8 2 8 2 2.8 0 5.1-.7 6.7-2 1.7-1.4 2.6-3.5 2.6-6.1 0-3.6-2.3-5.2-5.7-6.2" />
    </svg>
  );
}

function MarkGoogle() {
  return (
    <svg viewBox="0 0 32 32" className={MARK_CLASS} fill="none" aria-hidden>
      <rect x="4" y="5" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 11 L28 11" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="3" width="3" height="4" rx="1" fill="currentColor" />
      <rect x="25" y="3" width="3" height="4" rx="1" fill="currentColor" />
      <text x="16" y="24" textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor">31</text>
    </svg>
  );
}

function MarkApple() {
  return (
    <svg viewBox="0 0 32 32" className={MARK_CLASS} fill="currentColor" aria-hidden>
      <path d="M22.5 23.9c-1 1.5-2 2.4-3.4 2.4-1.3 0-1.7-.8-3.3-.8s-2 .8-3.3.8c-1.4 0-2.4-1.1-3.4-2.6-2-3-3.5-8-1.4-11.5 1-1.7 2.7-2.8 4.4-2.8 1.3 0 2.6.9 3.3.9s2.3-1.1 3.9-.9c1.5.1 2.9.7 3.7 2-3.2 1.9-2.6 6.3.5 7.6-.8 1.7-1 2.7-2 4.9zM16 8.5c-.2-1.8 1.1-3.5 2.5-4.4.3 1.7-1 3.6-2.5 4.4z" />
    </svg>
  );
}

function MarkMasterTour() {
  return (
    <svg viewBox="0 0 32 32" className={MARK_CLASS} fill="none" aria-hidden>
      <rect x="4" y="6" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      <text x="16" y="20" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">MT</text>
    </svg>
  );
}

function MarkRoadie() {
  return (
    <svg viewBox="0 0 32 32" className={MARK_CLASS} fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <text x="16" y="20.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">R</text>
    </svg>
  );
}

function IntegrationCell({ name, mark }: IntegrationMarkProps) {
  return (
    <div className="stage-panel rounded-xl px-4 py-5 flex items-center gap-3 text-[var(--stage-text-secondary)]">
      {mark}
      <span className="text-xs md:text-sm tracking-wide font-medium text-[var(--stage-text-primary)]/85">
        {name}
      </span>
    </div>
  );
}

function LandingIntegrations() {
  const items: IntegrationMarkProps[] = [
    { name: 'QuickBooks', mark: <MarkQuickBooks /> },
    { name: 'Stripe', mark: <MarkStripe /> },
    { name: 'Google Calendar', mark: <MarkGoogle /> },
    { name: 'Apple Calendar', mark: <MarkApple /> },
    { name: 'Master Tour', mark: <MarkMasterTour /> },
    { name: 'Roadie', mark: <MarkRoadie /> },
  ];
  return (
    <section className="relative py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={STAGE_HEAVY}
        >
          <h2 className="text-3xl md:text-5xl font-medium text-[var(--stage-text-primary)] tracking-tight mb-4 leading-[1.1]">
            Fits the tools you already trust.
          </h2>
          <p className="text-base md:text-lg text-[var(--stage-text-secondary)] font-light mb-14 max-w-2xl mx-auto">
            Connect the systems your company already runs on. More integrations arriving as we go.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {items.map((item) => (
              <IntegrationCell key={item.name} {...item} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────

function LandingSecurity() {
  return (
    <section id="security" className="relative py-24 md:py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={STAGE_HEAVY}
          className="flex flex-col gap-5 items-center"
        >
          <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70">
            Security
          </span>
          <h2 className="text-3xl md:text-5xl font-medium text-[var(--stage-text-primary)] tracking-tight leading-[1.1]">
            Sovereign by design.
          </h2>
          <p className="text-base md:text-lg text-[var(--stage-text-secondary)] font-light leading-relaxed max-w-xl">
            Passkey-first sign-in. Sovereign recovery with BIP39 and Shamir. Your data, your keys, your workspace.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────

function LandingCTA() {
  return (
    <section className="relative py-32 md:py-40 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={STAGE_HEAVY}
          className="flex flex-col gap-7 items-center"
        >
          <h2 className="text-4xl md:text-6xl font-medium text-[var(--stage-text-primary)] tracking-tight leading-[1.05]">
            Run your first show on Unusonic.
          </h2>
          <p className="text-base md:text-lg text-[var(--stage-text-secondary)] font-light max-w-xl">
            We&rsquo;re opening access in waves. Tell us about your production and we&rsquo;ll be in touch.
          </p>
          <a
            href={REQUEST_ACCESS_HREF}
            className="stage-panel px-7 py-3.5 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors"
          >
            Request access
          </a>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────

function LandingFooter() {
  const cols = [
    { title: 'Product', items: ['Overview', 'Aion', 'Security'] },
    { title: 'Company', items: ['About', 'Contact'] },
    { title: 'Resources', items: ['Docs', 'Status'] },
    { title: 'Legal', items: ['Privacy', 'Terms'] },
  ];
  return (
    <footer className="relative py-16 px-6 border-t border-[oklch(1_0_0_/_0.06)]">
      <div className="max-w-6xl mx-auto grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-[var(--stage-text-primary)]">
            <LivingLogo status="idle" size="sm" />
            <span className="text-sm font-medium tracking-[0.12em]">UNUSONIC</span>
          </div>
          <p className="text-xs text-[var(--stage-text-secondary)]/70 font-light max-w-xs">
            The event operating system.
          </p>
        </div>
        {cols.map((col) => (
          <div key={col.title} className="flex flex-col gap-3">
            <h4 className="text-[10px] uppercase tracking-[0.24em] text-[var(--stage-text-secondary)]/70">
              {col.title}
            </h4>
            {col.items.map((item) => (
              <span
                key={item}
                className="text-sm text-[var(--stage-text-secondary)]/80 font-light"
              >
                {item}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-[oklch(1_0_0_/_0.04)] flex flex-col sm:flex-row gap-2 justify-between text-xs text-[var(--stage-text-secondary)]/60">
        <span>© {new Date().getFullYear()} Unusonic</span>
        <span>Built for event production.</span>
      </div>
    </footer>
  );
}

// ─── Composition ──────────────────────────────────────────────────────────

export function LandingContent() {
  return (
    <div className="relative">
      <LandingHeader />
      <LandingHero />
      <PrivateBetaStrip />
      <LandingValueSlab />
      <LandingDeepDive
        id="handoff"
        eyebrow="Sales → Production"
        title="The handoff that never had to happen."
        body="When a proposal is accepted, the deal becomes an event. The Plan tab inherits the crew, the venue, the timing, and the budget. No re-keying, no lost context."
        placeholderLabel="Plan tab — preview"
        variant="app"
      />
      <LandingDeepDive
        id="aion"
        eyebrow="Aion"
        title="A co-pilot that knows your shows."
        body="Aion reads your calendar, crew roster, and inbox, and surfaces what needs your attention before you have to ask. Not a chatbot — a second brain for your production."
        placeholderLabel="Aion Daily Brief — preview"
        variant="conversation"
        flip
      />
      <LandingDeepDive
        id="finance"
        eyebrow="Finance"
        title="Numbers that match the work."
        body="Invoices generate from accepted proposals. Payments reconcile with QuickBooks. No more monthly catch-up."
        placeholderLabel="Finance — preview"
        variant="table"
      />
      <LandingBento />
      <LandingWithoutWith />
      <LandingPhilosophy />
      <LandingIntegrations />
      <LandingSecurity />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
