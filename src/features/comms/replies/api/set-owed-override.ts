'use server';

/**
 * setOwedOverride — flip the manual "owed" override on a thread.
 *
 * Fork C from the v2 design doc. Three semantic states map to this action:
 *   - 'flag'   — p_override = true  (force the thread into "owed" list)
 *   - 'dismiss'— p_override = false (force the thread OUT of "owed" list,
 *                                    for false positives like "Thanks!")
 *   - 'clear'  — p_override = null  (revert to heuristic)
 *
 * @module features/comms/replies/api/set-owed-override
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';

export type OwedAction = 'flag' | 'dismiss' | 'clear';

const inputSchema = z.object({
  threadId: z.string().uuid(),
  action: z.enum(['flag', 'dismiss', 'clear']),
});

export type SetOwedOverrideResult =
  | { success: true; override: boolean | null }
  | { success: false; error: string };

function mapAction(action: OwedAction): boolean | null {
  if (action === 'flag') return true;
  if (action === 'dismiss') return false;
  return null;
}

export async function setOwedOverride(input: {
  threadId: string;
  action: OwedAction;
}): Promise<SetOwedOverrideResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' };
  }

  const override = mapAction(parsed.data.action);

  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas
    const opsClient: any = supabase.schema('ops');

    const { error } = await opsClient.rpc('set_owed_override', {
      p_thread_id: parsed.data.threadId,
      p_override: override,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/crm', 'layout');

    return { success: true, override };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error while setting owed override',
    };
  }
}
