'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { GhostSeat } from './GhostSeat';
import { inviteEmployee } from '../api/actions';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';

export interface TeamAssemblerProps {
  className?: string;
}

/**
 * The Cockpit – empty seats, email input, optimistic seats, Skip / Continue.
 */
export function TeamAssembler({ className }: TeamAssemblerProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [invites, setInvites] = React.useState<{ email: string; status: 'sending' | 'filled' }[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      toast.error('Invalid frequency (email).');
      return;
    }
    if (invites.some((i) => i.email.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Already in the list.');
      return;
    }

    startTransition(async () => {
      setInvites((prev) => [...prev, { email: trimmed, status: 'sending' }]);
      setEmail('');

      const result = await inviteEmployee(trimmed);

      if (result?.ok === false) {
        toast.error(result.error);
        setInvites((prev) => prev.filter((e) => e.email !== trimmed));
      } else {
        toast.success(`Signal sent to ${trimmed}`);
        setInvites((prev) =>
          prev.map((e) => (e.email === trimmed ? { ...e, status: 'filled' as const } : e))
        );
      }
    });
  };

  const handleSkip = () => router.push('/network');
  const handleComplete = () => router.push('/network');

  return (
    <div className={cn('max-w-2xl mx-auto w-full text-center', className)}>
      <div className="mb-12">
        <h2 className="text-2xl font-light tracking-tight text-[var(--color-ink)]">
          Assemble The Core
        </h2>
        <p className="text-[var(--color-ink-muted)] mt-2">
          Who commands this vessel with you?
        </p>
      </div>

      <div className="flex justify-center gap-4 mb-12 flex-wrap min-h-[80px]">
        {invites.map((inv) => (
          <GhostSeat
            key={inv.email}
            email={inv.email}
            status={inv.status}
          />
        ))}
        <GhostSeat status="empty" />
      </div>

      <div className="relative max-w-md mx-auto mb-16 group">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder="colleague@example.com"
          className={cn(
            'w-full rounded-xl border bg-white/5 border-[var(--color-mercury)] py-4 px-4 text-center text-lg font-light',
            'text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/50',
            'focus:border-[var(--color-silk)]/50 focus:ring-2 focus:ring-[var(--color-silk)]/20 outline-none transition-colors'
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleAdd}
            disabled={!email.trim() || isPending}
            className="text-xs uppercase tracking-widest text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Add
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-8">
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          I am flying solo for now
        </Button>
        <Button
          onClick={handleComplete}
          className="group relative px-6 gap-2"
        >
          {invites.length > 0 ? 'Complete Assembly' : 'Continue'}
          <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
