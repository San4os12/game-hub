/* Подключение сайта к Firebase: онлайн, друзья, чат, голосование.
   Даёт странице тот же интерфейс window.claude.use('room'|'user'|'db'),
   который она использовала внутри Claude, но работает на Firebase. */
(function () {
  if (window.claude && window.claude.use) return;

  var firebaseConfig = {
    apiKey: "AIzaSyDYW37AnTDxd7uPg27p-0AQJHVUiAFIWMU",
    authDomain: "game-hub-f93c4.firebaseapp.com",
    projectId: "game-hub-f93c4",
    storageBucket: "game-hub-f93c4.firebasestorage.app",
    messagingSenderId: "687675519270",
    appId: "1:687675519270:web:85021ad140f6db2f0ad1e7"
  };

  var ONLINE_MS = 90 * 1000;   // сколько считать человека «в сети» после последнего сигнала
  var BEAT_MS = 30 * 1000;     // как часто отправлять сигнал «я здесь»
  var PING_MS = 10 * 60 * 1000; // приглашения старше 10 минут не показываем

  var ready = null;
  function start() {
    if (ready) return ready;
    ready = new Promise(function (resolve) {
      try {
        if (!window.firebase) { resolve(null); return; }
        var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
        var auth = firebase.auth(app), fs = firebase.firestore(app);
        // Анонимный вход только если никто не вошёл: иначе вход через Google слетел бы
        auth.onAuthStateChanged(function (u) {
          if (u) resolve({ fs: fs, uid: u.uid, auth: auth });
          else auth.signInAnonymously().catch(function () { resolve(null); });
        });
        setTimeout(function () { resolve(null); }, 15000);
      } catch (e) { resolve(null); }
    });
    return ready;
  }

  function ms(ts) { return ts && ts.toMillis ? ts.toMillis() : Date.now(); }
  function str(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
  function int(v, lo, hi) { return (typeof v === 'number' && v % 1 === 0 && v >= lo && v <= hi) ? v : lo; }

  /* ---------- room: кто онлайн, чат, приглашения ---------- */
  function makeRoom(ctx) {
    var fs = ctx.fs, me = ctx.uid, FV = firebase.firestore.FieldValue;
    var docs = {}, peerCbs = [], topicCbs = {}, mine = {}, timer = null, connected = false;
    var connCbs = [];

    function peers() {
      var now = Date.now(), out = [];
      Object.keys(docs).forEach(function (id) {
        var d = docs[id];
        if (id === me || now - ms(d.t) < ONLINE_MS) {
          var pr = { nick: d.nick, st: d.st, game: d.game, c: d.c, vote: d.vote, av: d.av, fav: d.fav, sd: d.sd, br: d.br, ba: d.ba };
          if (id === me) Object.keys(mine).forEach(function (k) { pr[k] = mine[k]; });
          out.push({ peer: id, by: id, isMe: id === me, sameTab: id === me, kind: 'viewer', guest: false, presence: pr, updatedAt: ms(d.t) });
        }
      });
      if (!docs[me]) out.push({ peer: me, by: me, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() });
      return out;
    }
    function firePeers() { peerCbs.forEach(function (f) { try { f({}); } catch (e) {} }); }

    function write() {
      var d = {
        nick: str(mine.nick, 16), st: str(mine.st, 2) || '1', game: str(mine.game, 20),
        c: (mine.c >= 0 && mine.c < 32 && mine.c % 1 === 0) ? mine.c : 0,
        vote: str(mine.vote, 40), t: FV.serverTimestamp(),
        av: int(mine.av, 0, 23), fav: str(mine.fav, 60),
        sd: int(mine.sd, 0, 9999), br: int(mine.br, 0, 99999), ba: int(mine.ba, 0, 999)
      };
      d.nl = d.nick.toLowerCase();
      fs.collection('presence').doc(me).set(d).catch(function () {});
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(write, 600); }

    fs.collection('presence').orderBy('t', 'desc').limit(200).onSnapshot(function (snap) {
      docs = {};
      snap.forEach(function (d) { docs[d.id] = d.data(); });
      if (!connected) { connected = true; connCbs.forEach(function (f) { f(true); }); }
      firePeers();
    }, function () {});
    setInterval(function () { write(); firePeers(); }, BEAT_MS);

    var loadedAt = Date.now();
    fs.collection('messages').orderBy('t', 'desc').limit(40).onSnapshot(function (snap) {
      var added = snap.docChanges().filter(function (c) { return c.type === 'added'; })
        .map(function (c) { return c.doc.data(); })
        .sort(function (a, b) { return ms(a.t) - ms(b.t); });
      added.forEach(function (m) {
        if (m.topic === 'ping' && ms(m.t) < loadedAt - PING_MS) return;
        var cbs = topicCbs[m.topic] || [];
        var msg = { topic: m.topic, peer: m.uid, by: m.uid, isMe: m.uid === me, sameTab: m.uid === me,
          kind: 'viewer', guest: false, data: { n: str(m.n, 16), m: str(m.m, 200), c: m.c } };
        cbs.forEach(function (f) { try { f(msg); } catch (e) {} });
      });
    }, function () {});

    return {
      peers: peers,
      onPeers: function (f) { peerCbs.push(f); setTimeout(function () { f({}); }, 0); return function () { peerCbs = peerCbs.filter(function (x) { return x !== f; }); }; },
      presence: function (patch) {
        Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; });
        schedule(); firePeers(); return Promise.resolve();
      },
      emit: function (topic, data) {
        data = data || {};
        return fs.collection('messages').add({
          topic: topic, uid: me, n: str(data.n, 16), m: str(data.m, 200),
          c: (data.c >= 0 && data.c < 32 && data.c % 1 === 0) ? data.c : 0, t: FV.serverTimestamp()
        }).then(function () {});
      },
      on: function (topic, f) { (topicCbs[topic] = topicCbs[topic] || []).push(f); return function () { topicCbs[topic] = topicCbs[topic].filter(function (x) { return x !== f; }); }; },
      connected: function () { return connected; },
      onConnection: function (f) { connCbs.push(f); setTimeout(function () { f(connected); }, 0); return function () {}; }
    };
  }

  /* ---------- user: ник как имя, поиск друзей ---------- */
  function makeUser(ctx) {
    var fs = ctx.fs, me = ctx.uid;
    function prof(id, d) { return { id: id, name: str(d && d.nick, 16), avatarUrl: '', color: '', email: null, isMe: id === me, guest: false }; }
    return {
      id: function () { return Promise.resolve(me); },
      profiles: function (ids) {
        ids = [].concat(ids || []);
        return Promise.all(ids.map(function (id) {
          return fs.collection('presence').doc(id).get().then(function (s) { return prof(id, s.data()); }, function () { return prof(id, null); });
        })).then(function (list) { var o = {}; list.forEach(function (p) { o[p.id] = p; }); return o; });
      },
      search: function (q) {
        q = String(q || '').trim().toLowerCase().slice(0, 16);
        if (!q) return Promise.resolve([]);
        return fs.collection('presence').where('nl', '>=', q).where('nl', '<=', q + '').limit(10).get()
          .then(function (s) { var out = []; s.forEach(function (d) { out.push(prof(d.id, d.data())); }); return out; }, function () { return []; });
      }
    };
  }

  /* ---------- db: личный список друзей ---------- */
  function makeDb(ctx) {
    var fs = ctx.fs, me = ctx.uid;
    function ref(path) {
      var m = /^data\/users\/([^/]+)\/friends$/.exec(path);
      return (m && m[1] === me) ? fs.collection('friends').doc(me) : null;
    }
    return {
      doc: function (path) {
        var r = ref(path);
        return {
          get: function () {
            if (!r) return Promise.resolve({ exists: false, data: function () { return undefined; } });
            return r.get().then(function (s) { return { exists: s.exists, data: function () { return s.data(); } }; });
          },
          set: function (data) {
            if (!r) return Promise.reject(new Error('not_granted'));
            var ids = (data && Array.isArray(data.ids) ? data.ids : []).filter(function (x) { return typeof x === 'string'; }).slice(0, 100);
            return r.set({ ids: ids });
          }
        };
      }
    };
  }

  /* прямой доступ для новых функций: рекорды, личка, тиммейты, крестики-нолики */
  window.hubFirebase = start;

  var cache = {};
  window.claude = {
    use: function (name) {
      if (cache[name]) return cache[name];
      cache[name] = start().then(function (ctx) {
        if (!ctx) return null;
        if (name === 'room') return makeRoom(ctx);
        if (name === 'user') return makeUser(ctx);
        if (name === 'db') return makeDb(ctx);
        return null;
      });
      return cache[name];
    }
  };
})();
