'use client';

import * as React from 'react';
import { useActionState, useOptimistic } from 'react';
import { Textarea } from '@/shared/ui/textarea';
import { updateRelationshipNotes } from '@/features/network-data';

interface PrivateNotesProps {
  relationshipId: string | null;
  initialNotes: string | null;
}

export function PrivateNotes({ relationshipId, initialNotes }: PrivateNotesProps) {
  const [optimisticNotes, setOptimisticNotes] = useOptimistic(
    initialNotes ?? '',
    (_current, value: string) => value
  );

  const [state, submitAction] = useActionState(
    async (
      _prev: { ok: boolean; error?: string } | null,
      formData: FormData
    ): Promise<{ ok: boolean; error?: string } | null> => {
      const id = formData.get('relationshipId') as string;
      const notes = (formData.get('notes') as string) || null;
      const result = await updateRelationshipNotes(id, notes);
      return result.ok ? result : { ok: false, error: result.error };
    },
    null
  );

  if (!relationshipId) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
          Notes
        </h3>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Available for partners.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
        Notes
      </h3>
      <p className="text-[10px] text-[var(--color-ink-muted)] mb-2">
        Private. Auto-saves.
      </p>
      <form
        action={submitAction}
        className="space-y-2"
        onSubmit={(e) => {
          const form = e.currentTarget;
          const notes = (form.querySelector('[name="notes"]') as HTMLTextAreaElement)?.value ?? '';
          setOptimisticNotes(notes);
        }}
      >
        <input type="hidden" name="relationshipId" value={relationshipId} />
        <Textarea
          name="notes"
          defaultValue={initialNotes ?? ''}
          placeholder="Notes about this partner…"
          className="min-h-[100px] resize-y bg-white/5 border-[var(--color-mercury)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
          rows={4}
        />
        {state?.error && (
          <p className="text-xs text-[var(--color-signal-error)]">{state.error}</p>
        )}
        <button
          type="submit"
          className="text-xs font-medium text-[var(--color-silk)] hover:underline"
        >
          Save
        </button>
      </form>
    </div>
  );
}
