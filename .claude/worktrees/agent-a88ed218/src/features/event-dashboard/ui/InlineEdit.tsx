'use client';

import React, { useState, useTransition } from 'react';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/utils';

type InlineEditBaseProps = {
  value: string | number | null | undefined;
  onSave: (value: string | number) => Promise<{ ok: boolean; error?: string }>;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
};

export function InlineEditText({
  value,
  onSave,
  placeholder = '—',
  className,
  displayClassName,
}: InlineEditBaseProps & { maxLength?: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useState<string>(String(value ?? ''));

  const display = value ?? '';
  const show = editing ? optimisticValue : String(display);

  const handleSubmit = (raw: string) => {
    const v = raw.trim();
    startTransition(async () => {
      setOptimisticValue(v);
      const res = await onSave(v);
      if (res.ok) setEditing(false);
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={show}
        className={cn(
          'w-full min-w-0 rounded-lg border border-[var(--glass-border)] bg-ceramic/10 px-2 py-1 text-ink outline-none focus:ring-2 focus:ring-[var(--ring)]',
          className
        )}
        onBlur={(e) => handleSubmit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setOptimisticValue(String(display));
            setEditing(false);
          }
        }}
        disabled={pending}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'w-full text-left rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-ceramic/5 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
        !display && 'text-ink-muted',
        displayClassName ?? className
      )}
    >
      {String(display || placeholder)}
    </button>
  );
}

export function InlineEditNumber({
  value,
  onSave,
  placeholder = '—',
  className,
  displayClassName,
}: InlineEditBaseProps & { min?: number; max?: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const num = typeof value === 'number' ? value : (value != null ? Number(value) : null);
  const [optimisticValue, setOptimisticValue] = useState<string>(num != null ? String(num) : '');

  const display = num ?? '';
  const show = editing ? optimisticValue : (num != null ? String(num) : '');

  const handleSubmit = (raw: string) => {
    const parsed = raw.trim() === '' ? 0 : parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    startTransition(async () => {
      setOptimisticValue(String(parsed));
      const res = await onSave(parsed);
      if (res.ok) setEditing(false);
    });
  };

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        defaultValue={show}
        className={cn(
          'w-full min-w-0 rounded-lg border border-[var(--glass-border)] bg-ceramic/10 px-2 py-1 text-ink outline-none focus:ring-2 focus:ring-[var(--ring)]',
          className
        )}
        onBlur={(e) => handleSubmit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setOptimisticValue(String(display));
            setEditing(false);
          }
        }}
        disabled={pending}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'w-full text-left rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-ceramic/5 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
        num == null && 'text-ink-muted',
        displayClassName ?? className
      )}
    >
      {display === '' ? placeholder : String(display)}
    </button>
  );
}

export function InlineEditTextarea({
  value,
  onSave,
  placeholder = '—',
  className,
  displayClassName,
}: InlineEditBaseProps & { rows?: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const str = value != null ? String(value) : '';
  const [optimisticValue, setOptimisticValue] = useState(str);

  const handleSubmit = (raw: string) => {
    startTransition(async () => {
      setOptimisticValue(raw);
      const res = await onSave(raw);
      if (res.ok) setEditing(false);
    });
  };

  if (editing) {
    return (
      <Textarea
        autoFocus
        defaultValue={optimisticValue}
        rows={3}
        className={cn(
          'w-full min-w-0 rounded-lg border border-[var(--glass-border)] bg-ceramic/10 text-ink resize-y',
          className
        )}
        onBlur={(e) => handleSubmit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOptimisticValue(str);
            setEditing(false);
          }
        }}
        disabled={pending}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'w-full text-left rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-ceramic/5 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] whitespace-pre-wrap',
        !str && 'text-ink-muted',
        displayClassName ?? className
      )}
    >
      {str || placeholder}
    </button>
  );
}
