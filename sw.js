/* Service worker GG Zone: только уведомления. Ничего не кэширует,
   поэтому обновления сайта всегда приходят сразу.
   Версию меняем при каждом заметном обновлении — браузер переустановит воркер. */
var SW_VERSION = '2026-10-28-fox';
var OFF = 'gg-offline-1';

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
/* Сохраняем только экран «Нет интернета» и лису для него — всё остальное всегда берётся из сети. */
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(OFF).then(function (c) { return c.addAll(['offline.html', 'mascot/offline.webp']); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('gg-offline-') === 0 && k !== OFF; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(function () {
      return caches.open(OFF).then(function (c) { return c.match('offline.html'); }).then(function (res) { return res || Response.error(); });
    }));
    return;
  }
  if (/\/mascot\/offline\.webp$/.test(new URL(r.url).pathname)) {
    e.respondWith(fetch(r).catch(function () { return caches.open(OFF).then(function (c) { return c.match('mascot/offline.webp'); }).then(function (res) { return res || Response.error(); }); }));
  }
});
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
