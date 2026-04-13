'use client';

import * as React from 'react';
import { useActionState, useOptimistic } from 'react';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
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
        <h3 className="stage-label text-[var(--stage-text-secondary)]">
          Notes
        </h3>
        <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
          Available for partners.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="stage-label text-[var(--stage-text-secondary)]">
        Notes
      </h3>
      <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mb-2">
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
          className="stage-input min-h-[100px] resize-y"
          rows={4}
        />
        {state?.error && (
          <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{state.error}</p>
        )}
        <Button type="submit" variant="ghost" size="sm">
          Save
        </Button>
      </form>
    </div>
  );
}
