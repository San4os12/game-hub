/* GG Zone — серверная часть: пуш-уведомления.
   Срабатывает на новые документы в Firestore и шлёт пуш получателю через Firebase Cloud Messaging.
   Учитывает: настройки пушей игрока, чёрный список, язык. */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const fn = functions.region('europe-west1');
const SITE = 'https://san4os12.github.io/game-hub/';

const TXT = {
  ru: {
    sticker: '🦊 Стикер', clanInv: '🛡️ Приглашение в клан', friendReq: 'Заявка в друзья', friendReqB: ' хочет добавить тебя в друзья',
    friendOk: 'Новый друг', friendOkB: ' принял(а) твою заявку', xo: ' вызывает тебя в крестики-нолики', rps: ' вызывает тебя в камень-ножницы-бумагу',
    turn: 'Твой ход', turnB: 'Партия против ', lfg: ' откликнулся на твоё объявление', lfgT: '🙋 Тиммейт нашёлся',
    clanReq: 'Новая заявка в клан', clanReqB: 'Кто-то хочет вступить в ', gift: '🎁 Подарок дня ждёт', giftB: 'Открой его, пока не наступила полночь!', game: 'Вызов'
  },
  en: {
    sticker: '🦊 Sticker', clanInv: '🛡️ Clan invitation', friendReq: 'Friend request', friendReqB: ' wants to add you as a friend',
    friendOk: 'New friend', friendOkB: ' accepted your request', xo: ' challenges you to tic-tac-toe', rps: ' challenges you to rock-paper-scissors',
    turn: 'Your turn', turnB: 'Match against ', lfg: ' responded to your post', lfgT: '🙋 Teammate found',
    clanReq: 'New clan request', clanReqB: 'Someone wants to join ', gift: '🎁 Your daily gift is waiting', giftB: 'Open it before midnight!', game: 'Challenge'
  },
  cs: {
    sticker: '🦊 Nálepka', clanInv: '🛡️ Pozvánka do klanu', friendReq: 'Žádost o přátelství', friendReqB: ' si tě chce přidat do přátel',
    friendOk: 'Nový přítel', friendOkB: ' přijal(a) tvou žádost', xo: ' tě vyzývá na piškvorky', rps: ' tě vyzývá na kámen-nůžky-papír',
    turn: 'Jsi na tahu', turnB: 'Hra proti ', lfg: ' reagoval na tvůj inzerát', lfgT: '🙋 Spoluhráč nalezen',
    clanReq: 'Nová žádost do klanu', clanReqB: 'Někdo chce vstoupit do ', gift: '🎁 Denní dárek čeká', giftB: 'Otevři ho do půlnoci!', game: 'Výzva'
  }
};

const s16 = (v) => (typeof v === 'string' ? v.slice(0, 16) : '') || '…';

function preview(m, L) {
  m = String(m || '');
  if (/^\[st:\d+\]$/.test(m)) return L.sticker;
  if (/^\[clan:[A-Za-z0-9_-]+\]$/.test(m)) return L.clanInv;
  return m.slice(0, 120);
}

async function isBlocked(to, from) {
  if (!from) return false;
  const b = await db.doc('blocks/' + to).get();
  return b.exists && Array.isArray(b.data().ids) && b.data().ids.includes(from);
}

async function nickOf(uid) {
  try { const p = await db.doc('presence/' + uid).get(); return p.exists ? s16(p.data().nick) : '…'; } catch (e) { return '…'; }
}

/* kind: dm | friend | game | lfg | clan | gift ; build(L) => {title, body} */
async function push(to, kind, build, sec, from) {
  if (!to || to === from) return null;
  const snap = await db.doc('push/' + to).get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = (Array.isArray(d.tokens) ? d.tokens : []).filter((t) => typeof t === 'string' && t.length > 20).slice(-10);
  if (!tokens.length) return null;
  if (d.prefs && d.prefs[kind] === false) return null;
  if (await isBlocked(to, from)) return null;
  const L = TXT[d.lang] || TXT.ru;
  const m = build(L);
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title: String(m.title).slice(0, 80), body: String(m.body || '').slice(0, 160), sec: sec, tag: 'gh-' + sec },
    webpush: { headers: { Urgency: 'high', TTL: '86400' }, fcmOptions: { link: SITE + '#' + sec } }
  });
  // убрать мёртвые токены
  const dead = [];
  res.responses.forEach((r, i) => {
    const c = r.error && r.error.code;
    if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token' || c === 'messaging/invalid-argument') dead.push(tokens[i]);
  });
  if (dead.length) await snap.ref.update({ tokens: admin.firestore.FieldValue.arrayRemove(...dead) }).catch(() => {});
  return res.successCount;
}

// 💬 личное сообщение (и приглашение в клан)
exports.onDm = fn.firestore.document('dms/{id}').onCreate((s) => {
  const d = s.data();
  const clan = /^\[clan:/.test(String(d.m || ''));
  return push(d.to, clan ? 'clan' : 'dm', (L) => ({ title: s16(d.n), body: preview(d.m, L) }), 'chat', d.from);
});

// 🤝 заявка в друзья / заявку приняли
exports.onFriendReq = fn.firestore.document('freq/{id}').onCreate((s) => {
  const d = s.data();
  if (d.st !== 'p') return null;
  return push(d.to, 'friend', (L) => ({ title: L.friendReq, body: s16(d.fn) + L.friendReqB }), 'friends', d.from);
});
exports.onFriendOk = fn.firestore.document('freq/{id}').onUpdate(async (ch) => {
  const a = ch.before.data(), b = ch.after.data();
  if (a.st === 'a' || b.st !== 'a') return null;
  const n = await nickOf(b.to);
  return push(b.from, 'friend', (L) => ({ title: L.friendOk, body: n + L.friendOkB }), 'friends', b.to);
});

// ⚔️ вызовы и «твой ход»
exports.onXoNew = fn.firestore.document('xo/{id}').onCreate((s) => {
  const d = s.data();
  return push(d.o, 'game', (L) => ({ title: L.game, body: s16(d.xn) + L.xo }), 'xo', d.x);
});
exports.onXoMove = fn.firestore.document('xo/{id}').onUpdate((ch) => {
  const a = ch.before.data(), b = ch.after.data();
  if (b.w || a.turn === b.turn) return null;
  const to = b.turn === 'x' ? b.x : b.o, from = b.turn === 'x' ? b.o : b.x, opp = b.turn === 'x' ? b.on : b.xn;
  return push(to, 'game', (L) => ({ title: L.turn, body: L.turnB + s16(opp) }), 'xo', from);
});
exports.onRpsNew = fn.firestore.document('rps/{id}').onCreate((s) => {
  const d = s.data();
  return push(d.b, 'game', (L) => ({ title: L.game, body: s16(d.an) + L.rps }), 'xo', d.a);
});

// 🙋 отклик на объявление
exports.onLfgReply = fn.firestore.document('lfgr/{id}').onCreate((s) => {
  const d = s.data();
  return push(d.to, 'lfg', (L) => ({ title: L.lfgT, body: s16(d.n) + L.lfg }), 'lfg', d.from);
});

// 🛡️ новая заявка в закрытый клан — главе
exports.onClanReq = fn.firestore.document('clans/{id}').onUpdate((ch) => {
  const a = ch.before.data(), b = ch.after.data();
  const ra = Array.isArray(a.req) ? a.req : [], rb = Array.isArray(b.req) ? b.req : [];
  const added = rb.filter((u) => !ra.includes(u));
  if (!added.length) return null;
  const name = String(b.name || '').slice(0, 20);
  return push(b.owner, 'clan', (L) => ({ title: L.clanReq, body: L.clanReqB + name }), 'clan', added[0]);
});

// 🎁 напоминание о подарке дня — каждый вечер в 19:00 по Праге
exports.giftReminder = fn.pubsub.schedule('0 19 * * *').timeZone('Europe/Prague').onRun(async () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  const today = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
  const q = await db.collection('push').where('gr', '==', true).limit(500).get();
  const jobs = [];
  q.forEach((doc) => { if (doc.data().gd !== today) jobs.push(push(doc.id, 'gift', (L) => ({ title: L.gift, body: L.giftB }), 'home', null).catch(() => null)); });
  await Promise.all(jobs);
  return null;
});
