'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { savePushSubscription } from '@/features/ops/actions/save-push-subscription';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

const DISMISSED_KEY = 'unusonic_push_prompt_dismissed';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * Converts a base64 VAPID key to a Uint8Array for the pushManager subscribe call.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/**
 * Subtle banner prompting the employee to enable push notifications.
 * Only renders when:
 *  - The browser supports push
 *  - Permission is not already granted or denied
 *  - The user has not dismissed the prompt in this browser
 *  - VAPID public key is configured
 */
export function PushPrompt() {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    // Guard: no push support, no VAPID key, or already decided
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !VAPID_PUBLIC_KEY
    ) {
      return;
    }

    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    setVisible(true);
  }, []);

  const handleEnable = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setSubscribing(true);

    try {
      // Register the service worker first
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setVisible(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const json = subscription.toJSON();
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await savePushSubscription({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        });
      }

      setVisible(false);
    } catch (err) {
      console.error('[push] Subscription failed:', err);
    } finally {
      setSubscribing(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={STAGE_MEDIUM}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]"
        >
          <Bell className="size-4 shrink-0 text-[var(--stage-text-secondary)]" />
          <p className="flex-1 text-sm text-[var(--stage-text-secondary)]">
            Get notified when you are assigned to a show.
          </p>
          <button
            type="button"
            onClick={handleEnable}
            disabled={subscribing}
            className="shrink-0 px-3 py-1 text-xs font-medium rounded-lg bg-[oklch(0.88_0_0)] text-[oklch(0.13_0_0)] hover:bg-[oklch(0.92_0_0)] transition-colors disabled:opacity-[0.45]"
          >
            {subscribing ? 'Enabling...' : 'Enable'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded-md text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
