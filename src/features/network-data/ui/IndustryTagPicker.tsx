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
            className="h-6 w-16 animate-pulse rounded-full bg-[var(--color-mercury)]/20"
          />
        ))}
      </div>
    );
  }

  if (dictionary.length === 0) {
    return (
      <p className="text-xs text-[var(--color-ink-muted)]">
        No categories configured.{' '}
        {showManageLink && (
          <Link href="/settings/network-tags" className="text-[var(--color-silk)] hover:underline">
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
                  ? 'bg-[var(--color-silk)]/20 text-[var(--color-silk)] border border-[var(--color-silk)]/40'
                  : 'border border-dashed border-[var(--color-mercury)]/60 text-[var(--color-ink-muted)] hover:border-[var(--color-silk)]/40 hover:text-[var(--color-silk)]',
                disabled && 'pointer-events-none opacity-60'
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      {showManageLink && (
        <p className="text-[10px] text-[var(--color-ink-muted)]/60">
          <Link href="/settings/network-tags" className="hover:text-[var(--color-ink-muted)] transition-colors">
            Manage categories →
          </Link>
        </p>
      )}
    </div>
  );
}
