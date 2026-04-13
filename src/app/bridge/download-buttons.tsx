'use client';

/**
 * Download buttons for the Unusonic Bridge download page.
 * Detects the visitor's OS on mount and highlights the matching button.
 * Before mount both buttons render equally so the server-rendered markup
 * stays static.
 *
 * @module app/bridge/download-buttons
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Apple, Monitor, ArrowRight } from 'lucide-react';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

type DetectedOs = 'macos' | 'windows' | null;

// Hard-coded version for Phase 1.5. Update on every release — the filenames
// come from `tauri-action` which bakes the version into the asset name.
// When we have frequent releases this should come from an env var or a
// small JSON fetched from the GitHub API.
const BRIDGE_VERSION = '0.1.0';
const REPO = 'danarthur/unusonic';

const MACOS_URL = `https://github.com/${REPO}/releases/latest/download/Unusonic.Bridge_${BRIDGE_VERSION}_universal.dmg`;
const WINDOWS_URL = `https://github.com/${REPO}/releases/latest/download/Unusonic.Bridge_${BRIDGE_VERSION}_x64-setup.exe`;

function detectOs(): DetectedOs {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac') && !ua.includes('iphone') && !ua.includes('ipad')) return 'macos';
  if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) return 'windows';
  return null;
}

export function DownloadButtons() {
  const [os, setOs] = useState<DetectedOs>(null);

  useEffect(() => {
    setOs(detectOs());
  }, []);

  return (
    <motion.div
      className="flex flex-col sm:flex-row gap-3 w-full max-w-md"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_HEAVY}
    >
      <DownloadButton
        href={MACOS_URL}
        label="Download for Mac"
        icon={Apple}
        primary={os === 'macos' || os === null}
      />
      <DownloadButton
        href={WINDOWS_URL}
        label="Download for Windows"
        icon={Monitor}
        primary={os === 'windows'}
      />
    </motion.div>
  );
}

function DownloadButton({
  href,
  label,
  icon: Icon,
  primary,
}: {
  href: string;
  label: string;
  icon: typeof Apple;
  primary: boolean;
}) {
  return (
    <a
      href={href}
      className={
        primary
          ? 'stage-panel flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] bg-[oklch(1_0_0/0.08)] hover:bg-[oklch(1_0_0/0.12)] transition-colors'
          : 'stage-panel flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.08)] hover:border-[oklch(1_0_0/0.14)] hover:text-[var(--stage-text-primary)] transition-colors'
      }
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
      {primary && <ArrowRight className="size-3.5 shrink-0 opacity-60" />}
    </a>
  );
}

/** Small secondary link for the install guide, colocated so it lives with the buttons. */
export function InstallGuideLink() {
  return (
    <Link
      href="/bridge/install"
      className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors underline underline-offset-4 decoration-dotted"
    >
      Having trouble installing? Read the setup guide
    </Link>
  );
}
