/**
 * Catalog card — renders a single catalog item in the grid view.
 * Status lifecycle: active | draft | archived, derived from is_active + is_draft.
 */

'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { PackageWithTags } from '@/features/sales/api/package-actions';
import { cn } from '@/shared/lib/utils';

type ItemStatus = 'active' | 'draft' | 'archived';

function getItemStatus(pkg: PackageWithTags): ItemStatus {
  if (pkg.is_draft) return 'draft';
  if (!pkg.is_active) return 'archived';
  return 'active';
}

const statusStripe: Record<ItemStatus, string> = {
  active: 'border-l-[3px] border-l-emerald-500/60',
  draft: 'border-l-[3px] border-l-amber-400/60',
  archived: 'border-l-[3px] border-l-[oklch(1_0_0_/_0.1)]',
};

interface CatalogCardProps {
  pkg: PackageWithTags;
  onArchive: (pkg: PackageWithTags) => void;
  isFocused?: boolean;
}

export function CatalogCard({ pkg, onArchive, isFocused }: CatalogCardProps) {
  const router = useRouter();
  const status = getItemStatus(pkg);

  // Image: prefer image_url, fall back to definition hero block
  const def = pkg.definition as {
    blocks?: { type: string; content?: { image?: string; title?: string } }[];
  } | null;
  const heroBlock = def?.blocks?.find((b) => b.type === 'header_hero');
  const imageUrl = pkg.image_url ?? heroBlock?.content?.image ?? null;

  // Navigation target
  const href =
    pkg.category === 'package'
      ? `/catalog/${pkg.id}/builder`
      : `/catalog/${pkg.id}/edit`;

  // Floor price proximity check (within 10%)
  const priceNum = Number(pkg.price);
  const floorNum = pkg.floor_price != null ? Number(pkg.floor_price) : null;
  const nearFloor =
    floorNum != null &&
    priceNum > 0 &&
    floorNum > 0 &&
    priceNum <= floorNum * 1.1;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      onClick={() => router.push(href)}
      role="listitem"
      className={cn(
        'stage-panel rounded-[var(--stage-radius-panel)] flex flex-col gap-3 cursor-pointer relative group',
        statusStripe[status],
        status === 'archived' && 'opacity-60 border-dashed',
        isFocused && 'ring-1 ring-[var(--stage-accent)]',
      )}
    >
      {/* Archive button — top-right icon */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onArchive(pkg);
        }}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-opacity"
        aria-label={pkg.is_active !== false ? 'Archive' : 'Restore'}
      >
        {pkg.is_active !== false ? (
          <Archive size={15} strokeWidth={1.5} />
        ) : (
          <ArchiveRestore size={15} strokeWidth={1.5} />
        )}
      </button>

      {/* Hero image */}
      {imageUrl && (
        <div className="aspect-video rounded-[var(--stage-radius-nested)] overflow-hidden bg-[oklch(1_0_0_/_0.05)] -mx-0.5 -mt-0.5">
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 px-5 pb-5 pt-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="text-[var(--stage-text-primary)] font-medium tracking-tight truncate">
            {pkg.name}
          </h2>
          {status === 'draft' && (
            <span className="shrink-0 text-xs uppercase tracking-wider text-amber-400/80">
              Draft
            </span>
          )}
          {status === 'archived' && (
            <span className="shrink-0 text-xs uppercase tracking-wider text-[var(--stage-text-secondary)]">
              Archived
            </span>
          )}
        </div>

        {/* Price + margin + floor */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight tabular-nums">
            ${priceNum.toLocaleString()}
          </p>
          {pkg.target_cost != null && priceNum > 0 && (
            <span className="text-xs tabular-nums text-[var(--stage-text-secondary)]">
              {Math.round(((priceNum - Number(pkg.target_cost)) / priceNum) * 100)}% margin
            </span>
          )}
          {nearFloor && (
            <span className="text-xs font-medium text-amber-400/90">
              Near floor
            </span>
          )}
        </div>

        {/* Rental stock dots */}
        {(pkg.category as string) === 'rental' && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={cn(
                'inline-block w-2 h-2 rounded-full',
                Number(pkg.stock_quantity ?? 0) > 3
                  ? 'bg-emerald-400'
                  : Number(pkg.stock_quantity ?? 0) >= 1
                    ? 'bg-amber-400'
                    : 'bg-red-400',
              )}
              aria-hidden
            />
            <span className="text-xs tabular-nums text-[var(--stage-text-secondary)]">
              {Number(pkg.stock_quantity ?? 0)} in stock
            </span>
            {pkg.is_sub_rental && (
              <span className="text-xs text-[var(--stage-text-secondary)] opacity-70">
                cross-rental
              </span>
            )}
          </div>
        )}

        {pkg.description && (
          <p className="text-sm text-[var(--stage-text-secondary)] mt-2 line-clamp-3">
            {pkg.description}
          </p>
        )}

        <p className="text-xs text-[var(--stage-text-secondary)] mt-2 capitalize">
          {String(pkg.category).replace(/_/g, ' ')}
        </p>

        {(pkg.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(pkg.tags ?? []).slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="px-2 py-0.5 rounded-md bg-[oklch(1_0_0_/_0.05)] text-xs text-[var(--stage-text-secondary)]"
              >
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  );
}
