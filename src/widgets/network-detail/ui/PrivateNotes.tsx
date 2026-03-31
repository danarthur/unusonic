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
        <h3 className="text-sm font-medium tracking-wide text-[var(--stage-text-secondary)]">
          Notes
        </h3>
        <p className="text-xs text-[var(--stage-text-secondary)]">
          Available for partners.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium tracking-wide text-[var(--stage-text-secondary)]">
        Notes
      </h3>
      <p className="text-[10px] text-[var(--stage-text-secondary)] mb-2">
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
          className="min-h-[100px] resize-y bg-[oklch(1_0_0/0.05)] border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]"
          rows={4}
        />
        {state?.error && (
          <p className="text-xs text-[var(--color-unusonic-error)]">{state.error}</p>
        )}
        <button
          type="submit"
          className="text-xs font-medium text-[var(--stage-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-sm"
        >
          Save
        </button>
      </form>
    </div>
  );
}
