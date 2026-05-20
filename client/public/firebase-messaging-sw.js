// Firebase Cloud Messaging service worker — receives push messages when the
// app is closed / backgrounded and surfaces them as system notifications.
//
// Must live at the site root (served from /firebase-messaging-sw.js) so the
// FCM SDK can register it with the right scope. Firebase Hosting serves
// client/public/* at the root, so this file is at the right place.

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

// Same config as the client bundle — public values, safe to embed.
firebase.initializeApp({
  apiKey: 'AIzaSyA4Yad3iMPyNGMiijucmJm5j4sa5O0I0E0',
  authDomain: 'skyelineos.firebaseapp.com',
  projectId: 'skyelineos',
  storageBucket: 'skyelineos.firebasestorage.app',
  messagingSenderId: '1062333414392',
  appId: '1:1062333414392:web:cd5b4ffa2d6345b3ca340d',
});

const messaging = firebase.messaging();

// Show a system notification for every backgrounded message. The default
// behaviour is good — but we set icon/badge explicitly so it looks like
// Skyeline branding on the lock screen.
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || payload.data?.title || 'Skyeline OS';
  const body  = payload.notification?.body  || payload.data?.body  || '';
  const url   = payload.fcmOptions?.link    || payload.data?.link  || '/';
  self.registration.showNotification(title, {
    body,
    icon: '/logos/logo-dark.png',
    badge: '/logos/logo-dark.png',
    data: { url },
    tag: payload.data?.tag || 'skyeline',
  });
});

// Tapping the notification opens (or focuses) the app at the deep link.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        try { await client.navigate(url); } catch {}
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
