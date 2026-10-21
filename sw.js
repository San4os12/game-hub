/* Service worker GG Zone: только уведомления. Ничего не кэширует,
   поэтому обновления сайта всегда приходят сразу. */
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
