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
    appId: "1:687675519270:web:85021ad140f6db2f0ad1e7",
    databaseURL: "https://game-hub-f93c4-default-rtdb.europe-west1.firebasedatabase.app"
  };

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

  /* ---------- room: кто онлайн, чат, приглашения ----------
     Онлайн-статус живёт в Realtime Database (если она включена): она не тратит лимит
     чтений Firestore и сама убирает человека из «в сети», когда он закрыл приложение.
     Если Realtime Database недоступна — запасной режим на Firestore с редким сигналом. */
  var FS_BEAT = 120 * 1000, FS_ONLINE = 5 * 60 * 1000, FS_WINDOW = 6 * 60 * 1000;
  var IMPORTANT = ['nick', 'st', 'game', 'c', 'av', 'fav', 'cl', 'ct', 'bn', 'fr', 'bio', 'pg'];
  function makeRoom(ctx) {
    var fs = ctx.fs, me = ctx.uid, FV = firebase.firestore.FieldValue;
    var docs = {}, live = {}, peerCbs = [], topicCbs = {}, mine = {}, timer = null, timerAt = 0, connected = false;
    var connCbs = [], mode = 'fs', fsUnsub = null, rt = null, rtRef = null, lastFs = '';

    function online(id, d) {
      if (id === me) return true;
      if (mode === 'rt') return !!live[id];
      return d && Date.now() - ms(d.t) < FS_ONLINE;
    }
    function peers() {
      var out = [], src = mode === 'rt' ? live : docs;
      Object.keys(src).forEach(function (id) {
        var d = src[id];
        if (!online(id, d)) return;
        var pr = { nick: d.nick, st: d.st, game: d.game, c: d.c, vote: d.vote, av: d.av, fav: d.fav, sd: d.sd, br: d.br, ba: d.ba, cl: d.cl, ct: d.ct, xp: d.xp, ach: d.ach, bn: d.bn, fr: d.fr, bio: d.bio, pg: d.pg, ps: d.ps };
        if (id === me) Object.keys(mine).forEach(function (k) { pr[k] = mine[k]; });
        out.push({ peer: id, by: id, isMe: id === me, sameTab: id === me, kind: 'viewer', guest: false, presence: pr, updatedAt: typeof d.t === 'number' ? d.t : ms(d.t) });
      });
      if (!src[me]) out.push({ peer: me, by: me, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() });
      return out;
    }
    function firePeers() { peerCbs.forEach(function (f) { try { f({}); } catch (e) {} }); }
    function setConn(v) { if (v && !connected) { connected = true; connCbs.forEach(function (f) { f(true); }); } }

    function profile() {
      var d = {
        nick: str(mine.nick, 16), st: str(mine.st, 2) || '1', game: str(mine.game, 20),
        c: (mine.c >= 0 && mine.c < 32 && mine.c % 1 === 0) ? mine.c : 0,
        vote: str(mine.vote, 40), t: FV.serverTimestamp(),
        av: int(mine.av, 0, 199), fav: str(mine.fav, 60),
        cl: str(mine.cl, 24), ct: str(mine.ct, 4), xp: int(mine.xp, 0, 9999999), ach: int(mine.ach, 0, 1099511627775),
        sd: int(mine.sd, 0, 9999), br: int(mine.br, 0, 99999), ba: int(mine.ba, 0, 999),
        bn: int(mine.bn, 0, 40), fr: int(mine.fr, 0, 10), bio: str(mine.bio, 120),
        pg: str(mine.pg, 20), ps: int(mine.ps, 0, 9999999999999)
      };
      d.nl = d.nick.toLowerCase();
      return d;
    }
    // профиль в Firestore: сразу при важных изменениях, иначе не чаще раза в 45 с
    function write() {
      timer = null; timerAt = 0;
      var d = profile(), key = JSON.stringify(Object.assign({}, d, { t: 0 }));
      if (mode === 'rt' && key === lastFs) return;
      lastFs = key;
      fs.collection('presence').doc(me).set(d).catch(function () {});
    }
    function schedule(delay) {
      var at = Date.now() + delay;
      if (timer && timerAt <= at) return;
      clearTimeout(timer); timerAt = at; timer = setTimeout(write, delay);
    }
    var lastRt = '';
    function rtWrite(force) {
      if (!rtRef) return;
      var p = profile(), d = { t: firebase.database.ServerValue.TIMESTAMP };
      ['nick', 'st', 'game', 'c', 'vote', 'av', 'cl', 'ct', 'xp', 'ach', 'bn', 'fr', 'pg', 'ps'].forEach(function (k) { d[k] = p[k]; });
      var key = JSON.stringify(Object.assign({}, d, { t: 0 }));
      if (key === lastRt && !force) return;
      lastRt = key;
      rtRef.set(d).catch(function () { lastRt = ''; fallback(); });
    }

    // запасной режим: Firestore, только те, кто был активен недавно
    function fsListen() {
      if (fsUnsub) return;
      var since = firebase.firestore.Timestamp.fromMillis(Date.now() - FS_WINDOW);
      fsUnsub = fs.collection('presence').where('t', '>', since).orderBy('t', 'desc').limit(100).onSnapshot(function (snap) {
        docs = {}; snap.forEach(function (d) { docs[d.id] = d.data(); });
        setConn(true); if (mode === 'fs') firePeers();
      }, function () {});
    }
    var beat = setInterval(function () { if (mode === 'fs' && !document.hidden) { write(); firePeers(); } }, FS_BEAT);
    document.addEventListener('visibilitychange', function () { if (mode === 'fs' && !document.hidden) schedule(500); });
    setInterval(function () { if (mode === 'fs') firePeers(); }, 30000);
    function fallback() {
      if (mode !== 'rt') return;
      mode = 'fs'; try { if (rt) rt.ref('status').off(); } catch (e) {}
      fsListen(); schedule(300);
    }

    fsListen();
    // Realtime Database: включается, если подключилась за 6 секунд
    try {
      if (firebase.database && firebaseConfig.databaseURL) {
        rt = firebase.database();
        var okOnce = false;
        var wasConn = false;
        rt.ref('.info/connected').on('value', function (s) {
          var now = s.val() === true, was = wasConn; wasConn = now;
          if (!now || was) return;
          rtRef = rt.ref('status/' + me);
          rtRef.onDisconnect().remove().then(function () {
            rtWrite(true);
            if (okOnce) return; okOnce = true;
            rt.ref('status').on('value', function (snap) {
              var v = snap.val() || {}; live = {};
              Object.keys(v).forEach(function (id) { if (v[id] && typeof v[id] === 'object') live[id] = v[id]; });
              if (mode !== 'rt') { mode = 'rt'; if (fsUnsub) { fsUnsub(); fsUnsub = null; } }
              setConn(true); firePeers();
            }, function () { fallback(); });
          }).catch(function () {});
        });
      }
    } catch (e) { mode = 'fs'; }

    var loadedAt = Date.now();
    fs.collection('messages').orderBy('t', 'desc').limit(30).onSnapshot(function (snap) {
      snap.docChanges().filter(function (c) { return c.type === 'removed'; }).forEach(function (c) {
        (topicCbs.__del || []).forEach(function (f) { try { f({ id: c.doc.id }); } catch (e) {} });
      });
      var added = snap.docChanges().filter(function (c) { return c.type === 'added'; })
        .map(function (c) { var d = c.doc.data(); d.__id = c.doc.id; return d; })
        .sort(function (a, b) { return ms(a.t) - ms(b.t); });
      added.forEach(function (m) {
        if (m.topic === 'ping' && ms(m.t) < loadedAt - PING_MS) return;
        var cbs = topicCbs[m.topic] || [];
        var msg = { topic: m.topic, peer: m.uid, by: m.uid, isMe: m.uid === me, sameTab: m.uid === me,
          kind: 'viewer', guest: false, data: { n: str(m.n, 16), m: str(m.m, 200), c: m.c, t: ms(m.t), id: m.__id } };
        cbs.forEach(function (f) { try { f(msg); } catch (e) {} });
      });
    }, function () {});

    return {
      peers: peers,
      mode: function () { return mode; },
      onPeers: function (f) { peerCbs.push(f); setTimeout(function () { f({}); }, 0); return function () { peerCbs = peerCbs.filter(function (x) { return x !== f; }); }; },
      presence: function (patch) {
        var imp = false;
        Object.keys(patch || {}).forEach(function (k) {
          var v = patch[k] === null ? undefined : patch[k];
          if (mine[k] !== v && IMPORTANT.indexOf(k) >= 0) imp = true;
          if (patch[k] === null) delete mine[k]; else mine[k] = patch[k];
        });
        if (mode === 'rt') rtWrite();
        schedule(imp || !lastFs ? 800 : 45000); firePeers(); return Promise.resolve();
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
