import 'server-only';
import { getSystemClient } from '@/shared/api/supabase/system';

// Lazy-load web-push to avoid hard crash if not installed yet
// Install: npm install web-push @types/web-push
let webPush: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  webPush = require('web-push');
} catch {
  // web-push not installed — sendPushNotification will no-op with a warning
}

// Configured from env — set these in Vercel / .env.local:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT (mailto: or https:// URI)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@unusonic.com';

if (webPush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  /** Notification tag for grouping/replacing */
  tag?: string;
  /** URL to navigate to on click */
  url?: string;
}

/** Shape of a row from public.push_subscriptions (pre-type-generation) */
interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a push notification to all subscribed devices for a given user.
 *
 * Uses the system (service-role) client to look up subscriptions because
 * push sending happens server-side, outside a user session (e.g. from a
 * webhook or background job).
 *
 * Returns the count of successfully delivered notifications.
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!webPush) {
    console.warn('[push] web-push not installed — run: npm install web-push @types/web-push');
    return { sent: 0, failed: 0 };
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not configured — skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const supabase = getSystemClient();

  // Cast to bypass missing type generation for push_subscriptions table.
  // After running the migration and `npm run db:types`, remove the cast.
  const { data: subscriptions, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: PushSubscriptionRow[] | null; error: { message: string } | null }>;
      };
    };
  }).from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);

  if (error) {
    console.error('[push] Failed to fetch subscriptions:', error.message);
    return { sent: 0, failed: 0 };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const jsonPayload = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush!.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          jsonPayload,
          { TTL: 60 * 60 } // 1 hour TTL
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        // 404 or 410 means the subscription is no longer valid
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id);
        } else {
          console.error('[push] Failed to send to', sub.endpoint, err);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    await (supabase as unknown as {
      from: (table: string) => {
        delete: () => {
          in: (col: string, vals: string[]) => Promise<unknown>;
        };
      };
    }).from('push_subscriptions').delete().in('id', expiredIds);
  }

  return { sent, failed };
}

/**
 * Convenience: send a "new gig request" notification to a crew member.
 * Call this after inserting a crew assignment with status = 'requested'.
 */
export async function notifyNewGigRequest(
  userId: string,
  opts: { eventTitle: string; role: string }
): Promise<{ sent: number; failed: number }> {
  return sendPushNotification(userId, {
    title: 'New show request',
    body: `You have been requested as ${opts.role} for ${opts.eventTitle || 'an upcoming show'}.`,
    tag: 'gig-request',
    url: '/schedule',
  });
}
