/* Service worker GG Zone: только уведомления. Ничего не кэширует,
   поэтому обновления сайта всегда приходят сразу.
   Версию меняем при каждом заметном обновлении — браузер переустановит воркер. */
var SW_VERSION = '2026-10-23-glow';

/* Пуш-уведомления через Firebase Cloud Messaging: приходят, даже когда приложение закрыто. */
try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp({ apiKey: 'AIzaSyDYW37AnTDxd7uPg27p-0AQJHVUiAFIWMU', projectId: 'game-hub-f93c4', messagingSenderId: '687675519270', appId: '1:687675519270:web:85021ad140f6db2f0ad1e7' });
  firebase.messaging().onBackgroundMessage(function (p) {
    var d = (p && p.data) || {};
    if (!d.title) return;
    return self.registration.showNotification(d.title, { body: d.body || '', icon: 'apple-touch-icon.png', badge: 'apple-touch-icon.png', tag: d.tag || 'gh-push', data: { sec: d.sec || 'home' } });
  });
} catch (e) { /* без пушей сайт работает как обычно */ }
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* сеть как обычно */ });
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var sec = (e.notification.data && e.notification.data.sec) || 'home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ('focus' in c) { c.postMessage({ sec: sec }); return c.focus(); }
    }
    return self.clients.openWindow('./#' + sec);
  }));
});
