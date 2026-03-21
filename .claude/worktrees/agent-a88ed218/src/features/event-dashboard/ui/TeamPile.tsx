'use client';

import React from 'react';
import { cn } from '@/shared/lib/utils';

export interface TeamMember {
  id: string;
  name: string | null;
  avatarUrl?: string | null;
  role?: string;
}

interface TeamPileProps {
  members: TeamMember[];
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
};

export function TeamPile({ members, max = 5, size = 'md', className }: TeamPileProps) {
  const visible = members.slice(0, max);
  const overflow = members.length > max ? members.length - max : 0;

  if (visible.length === 0 && overflow === 0) {
    return (
      <span className={cn('text-ink-muted text-sm', className)}>No one assigned</span>
    );
  }

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {visible.map((m) => (
        <div
          key={m.id}
          title={m.name ?? m.role ?? 'Unknown'}
          className={cn(
            'rounded-full border-2 border-[var(--glass-bg)] bg-stone/40 flex items-center justify-center font-medium text-ink overflow-hidden shrink-0',
            sizeClasses[size]
          )}
        >
          {m.avatarUrl ? (
            <img
              src={m.avatarUrl}
              alt={m.name ?? ''}
              className="size-full object-cover"
            />
          ) : (
            <span className="truncate">
              {(m.name ?? '?').slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            'rounded-full border-2 border-[var(--glass-bg)] bg-ink-muted/20 flex items-center justify-center text-ink-muted font-medium shrink-0',
            sizeClasses[size]
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
