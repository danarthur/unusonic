'use client';

import * as React from 'react';
import Link from 'next/link';
import { getWorkspaceIndustryTags } from '@/entities/talent/api/get-workspace-industry-tags';
import type { WorkspaceIndustryTag } from '@/entities/talent/api/get-workspace-industry-tags';
import { cn } from '@/shared/lib/utils';

interface IndustryTagPickerProps {
  /** Currently selected tag keys. */
  value: string[];
  onChange: (tags: string[]) => void;
  workspaceId: string;
  /** Show a link to the tag management settings page. Default true. */
  showManageLink?: boolean;
  disabled?: boolean;
}

/**
 * Multi-select chip picker for workspace industry tags.
 * Dictionary-only — no free-text input. Clicking a chip toggles it.
 * Admin/owner can reach the full dictionary via the "Manage" link.
 */
export function IndustryTagPicker({
  value,
  onChange,
  workspaceId,
  showManageLink = true,
  disabled = false,
}: IndustryTagPickerProps) {
  const [dictionary, setDictionary] = React.useState<WorkspaceIndustryTag[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getWorkspaceIndustryTags(workspaceId).then((tags) => {
      if (!cancelled) {
        setDictionary(tags);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const toggle = React.useCallback(
    (tag: string) => {
      if (disabled) return;
      onChange(
        value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]
      );
    },
    [value, onChange, disabled]
  );

  if (loading) {
    return (
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="h-6 w-16 stage-skeleton rounded-full bg-[oklch(1_0_0_/_0.08)]/20"
          />
        ))}
      </div>
    );
  }

  if (dictionary.length === 0) {
    return (
      <p className="text-xs text-[var(--stage-text-secondary)]">
        No categories configured.{' '}
        {showManageLink && (
          <Link href="/settings/network-tags" className="text-[var(--stage-accent)] hover:underline">
            Add some in Settings.
          </Link>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {dictionary.map((entry) => {
          const isSelected = value.includes(entry.tag);
          return (
            <button
              key={entry.tag}
              type="button"
              onClick={() => toggle(entry.tag)}
              disabled={disabled}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                isSelected
                  ? 'bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] border border-[var(--stage-accent)]/40'
                  : 'border border-dashed border-[oklch(1_0_0_/_0.08)]/60 text-[var(--stage-text-secondary)] hover:border-[var(--stage-accent)]/40 hover:text-[var(--stage-accent)]',
                disabled && 'pointer-events-none opacity-60'
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      {showManageLink && (
        <p className="text-[10px] text-[var(--stage-text-secondary)]/60">
          <Link href="/settings/network-tags" className="hover:text-[var(--stage-text-secondary)] transition-colors">
            Manage categories →
          </Link>
        </p>
      )}
    </div>
  );
}
