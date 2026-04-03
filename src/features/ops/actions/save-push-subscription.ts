'use server';

import 'server-only';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

type SavePushResult = { success: true } | { success: false; error: string };

/**
 * Save a Web Push subscription for the current user.
 * Upserts on (user_id, endpoint) to avoid duplicates when the browser
 * re-subscribes with the same endpoint but rotated keys.
 */
export async function savePushSubscription(
  input: z.infer<typeof PushSubscriptionSchema>
): Promise<SavePushResult> {
  const parsed = PushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid subscription data' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Cast: push_subscriptions not in generated types until migration runs + db:types.
  // Remove cast after type regeneration.
  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, string>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
  }).from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    },
    { onConflict: 'user_id,endpoint' }
  );

  if (error) {
    console.error('[push] savePushSubscription:', error.message);
    return { success: false, error: 'Failed to save subscription' };
  }

  return { success: true };
}

/**
 * Remove a push subscription for the current user by endpoint.
 */
export async function removePushSubscription(endpoint: string): Promise<SavePushResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Cast: push_subscriptions not in generated types until migration runs + db:types.
  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  }).from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);

  if (error) {
    console.error('[push] removePushSubscription:', error.message);
    return { success: false, error: 'Failed to remove subscription' };
  }

  return { success: true };
}
