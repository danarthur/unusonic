/**
 * Unusonic Portal — Push Notification Service Worker
 *
 * Handles push events from the server and notification click navigation.
 * Registered by the portal layout for employee users only.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Unusonic', body: event.data.text() };
  }

  const title = payload.title || 'Unusonic';
  const options = {
    body: payload.body || '',
    icon: '/phase-mark.svg',
    badge: '/phase-mark.svg',
    tag: payload.tag || 'unusonic-portal',
    data: {
      url: payload.url || '/schedule',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/schedule';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing portal tab if one is open
        for (const client of clientList) {
          if (client.url.includes('/schedule') || client.url.includes('/portal')) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(targetUrl);
      })
  );
});
