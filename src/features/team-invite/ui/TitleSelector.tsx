'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

export interface TitleSelectorProps {
  value: string;
  onChange: (val: string) => void;
  existingTitles: string[];
  placeholder?: string;
  className?: string;
}

/**
 * Creatable combobox: pick existing job title or type a new one.
 */
export function TitleSelector({
  value,
  onChange,
  existingTitles,
  placeholder = 'Select or create title…',
  className,
}: TitleSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return existingTitles;
    return existingTitles.filter((t) => t.toLowerCase().includes(q));
  }, [existingTitles, search]);
  const canCreate = search.trim().length > 0 && !existingTitles.some((t) => t.toLowerCase() === search.trim().toLowerCase());

  const handleCreate = () => {
    const newTitle = search.trim();
    if (newTitle) {
      onChange(newTitle);
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
        Job title
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)]/50 px-3 py-2.5 text-left font-normal text-[var(--stage-text-primary)]',
              'hover:bg-[var(--stage-void)]/70 hover:border-[oklch(1_0_0_/_0.08)]'
            )}
          >
            <span className={value ? undefined : 'text-[var(--stage-text-secondary)]'}>{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[200px] max-w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden rounded-xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.35)]" align="end">
          <div className="rounded-xl overflow-hidden">
            <input
              placeholder="Search title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'flex h-10 w-full border-0 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)]/30 px-3 py-2 text-sm',
                'text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none'
              )}
            />
            <div className="max-h-[200px] overflow-y-auto p-1.5 bg-[var(--stage-surface)]">
              {canCreate && (
                <button
                  type="button"
                  onClick={handleCreate}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                    'hover:bg-[var(--stage-accent)]/20 text-[var(--stage-accent)]'
                  )}
                >
                  <Plus className="size-4" />
                  Create &quot;{search.trim()}&quot;
                </button>
              )}
              {filtered.length === 0 && !canCreate && (
                <p className="px-2 py-3 text-sm text-[var(--stage-text-secondary)]">No titles yet. Type to create.</p>
              )}
              {filtered.map((title) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => {
                    onChange(title);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--stage-text-primary)]',
                    'hover:bg-[var(--stage-accent)]/15',
                    value === title && 'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)]'
                  )}
                >
                  <Check className={cn('size-4 shrink-0', value === title ? 'opacity-100' : 'opacity-0')} />
                  {title}
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
