// ===================================================================
// Service Worker: frontend/public/sw.js
// Handles background browser push notifications and notifications clicks.
// ===================================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'TEMBUS Update';
    const options = {
      body: payload.body || 'Ada pembaruan untuk kiriman Anda.',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: {
        url: payload.url || '/orders'
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    // Handling non-JSON data fallback
    const textData = event.data.text();
    const options = {
      body: textData,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: '/orders' }
    };
    event.waitUntil(
      self.registration.showNotification('TEMBUS Update', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If window client is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
