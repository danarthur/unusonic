/**
 * Preview mode banner.
 *
 * Persistent, non-dismissible strip rendered above the portal shell
 * during admin preview. Uses dashboard Stage Engineering tokens (sits
 * outside PortalThemeShell) so it is visually distinct from portal content.
 *
 * @module features/client-portal/ui/preview-banner
 */
'use client';

import Link from 'next/link';
import { Eye, ArrowLeft } from 'lucide-react';

type PreviewBannerProps = {
  clientName: string;
  /** URL to return to (typically the deal page). */
  exitHref: string;
};

export function PreviewBanner({ clientName, exitHref }: PreviewBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-6 py-3 border-b"
      style={{
        backgroundColor: 'var(--stage-surface-elevated)',
        borderColor: 'var(--stage-edge-subtle)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <Eye
          size={15}
          strokeWidth={1.5}
          style={{ color: 'var(--stage-text-tertiary)' }}
        />
        <span
          className="text-sm"
          style={{ color: 'var(--stage-text-secondary)' }}
        >
          Previewing <span className="font-medium" style={{ color: 'var(--stage-text-primary)' }}>{clientName}</span>&apos;s portal
        </span>
      </div>
      <Link
        href={exitHref}
        className="flex items-center gap-1.5 text-xs font-medium transition-colors"
        style={{ color: 'var(--stage-text-tertiary)' }}
      >
        <ArrowLeft size={12} strokeWidth={1.5} />
        Exit preview
      </Link>
    </div>
  );
}
