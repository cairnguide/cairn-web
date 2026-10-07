/*
 * Browser notifications for Cairn (UC-REG-15). Only installed after the person
 * chose browser notifications and the browser said yes.
 *
 * Cairn's pushes are empty on purpose: a notification never names the person
 * who died, a circumstance, or anything else personal. It only says there is
 * something waiting, and opens Cairn, where the person signs in to see it.
 */
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Cairn', {
      body: 'You have something waiting in Cairn.',
      icon: '/favicon.svg',
      tag: 'cairn',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/home'));
});
