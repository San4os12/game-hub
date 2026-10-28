/* GG Squad — серверная часть: пуш-уведомления, сборы, топ недели (версия 2026-10-25b).
   Срабатывает на новые документы в Firestore и шлёт пуш получателю через Firebase Cloud Messaging.
   Учитывает: настройки пушей игрока, чёрный список, «без звука» для чатов и людей, «не беспокоить», язык. */
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
    clanReq: 'Новая заявка в клан', clanReqB: 'Кто-то хочет вступить в ', gift: '🎁 Подарок дня ждёт', giftB: 'Открой его, пока не наступила полночь!', game: 'Вызов',
    partyInv: '🎮 Приглашение в пати', partyT: '🎮 Пати', goT: '🚀 Заходим в игру!', goB: 'Пати стартует — открой GG Squad', partyJoin: ' теперь в твоём пати', partyFull: '🔥 Пати собрано!', partyFullB: 'Все в сборе — заходите в игру',
    endoT: '⭐ Новая оценка', endoB: ' оценил(а) тебя как тиммейта', good: '🤝 Надёжный', skill: '🎯 Скилл', fun: '😄 Весёлый',
    mtSoonT: '⏰ Через 10 минут: {g}', mtSoonB: 'Сбор в {t} — заходи в GG Squad', mtGoT: '🎮 Сбор начался!', mtGoB: 'Ты в пати {g} — открывай GG Squad', mtPt: 'Сбор в {t}',
    onT: '🟢 Друг в сети', onB: ' зашёл в GG Squad', wtT: '🏆 Ты в топе недели!', wtB: '{n}-е место по опыту — значок уже в профиле', ndT: '👋 GG Squad ждёт тебя', ndB: 'Открой приложение из Google Play — так засчитается тест'
  },
  en: {
    sticker: '🦊 Sticker', clanInv: '🛡️ Clan invitation', friendReq: 'Friend request', friendReqB: ' wants to add you as a friend',
    friendOk: 'New friend', friendOkB: ' accepted your request', xo: ' challenges you to tic-tac-toe', rps: ' challenges you to rock-paper-scissors',
    turn: 'Your turn', turnB: 'Match against ', lfg: ' responded to your post', lfgT: '🙋 Teammate found',
    clanReq: 'New clan request', clanReqB: 'Someone wants to join ', gift: '🎁 Your daily gift is waiting', giftB: 'Open it before midnight!', game: 'Challenge',
    partyInv: '🎮 Party invite', partyT: '🎮 Party', goT: '🚀 Jumping into the game!', goB: 'Your party is starting — open GG Squad', partyJoin: ' joined your party', partyFull: '🔥 Party is full!', partyFullB: 'Everyone is here — jump into the game',
    endoT: '⭐ New rating', endoB: ' rated you as a teammate', good: '🤝 Reliable', skill: '🎯 Skilled', fun: '😄 Fun',
    mtSoonT: '⏰ In 10 minutes: {g}', mtSoonB: 'Game night at {t} — open GG Squad', mtGoT: '🎮 Game night started!', mtGoB: 'You’re in the {g} party — open GG Squad', mtPt: 'Game night at {t}',
    onT: '🟢 Friend online', onB: ' just opened GG Squad', wtT: '🏆 You made the weekly top!', wtB: 'Place #{n} by XP — the badge is on your profile', ndT: '👋 GG Squad misses you', ndB: 'Open the app from Google Play so your test day counts'
  },
  cs: {
    sticker: '🦊 Nálepka', clanInv: '🛡️ Pozvánka do klanu', friendReq: 'Žádost o přátelství', friendReqB: ' si tě chce přidat do přátel',
    friendOk: 'Nový přítel', friendOkB: ' přijal(a) tvou žádost', xo: ' tě vyzývá na piškvorky', rps: ' tě vyzývá na kámen-nůžky-papír',
    turn: 'Jsi na tahu', turnB: 'Hra proti ', lfg: ' reagoval na tvůj inzerát', lfgT: '🙋 Spoluhráč nalezen',
    clanReq: 'Nová žádost do klanu', clanReqB: 'Někdo chce vstoupit do ', gift: '🎁 Denní dárek čeká', giftB: 'Otevři ho do půlnoci!', game: 'Výzva',
    partyInv: '🎮 Pozvánka do party', partyT: '🎮 Party', goT: '🚀 Jdeme do hry!', goB: 'Party startuje — otevři GG Squad', partyJoin: ' je teď v tvé party', partyFull: '🔥 Party je plná!', partyFullB: 'Všichni jsou tu — hurá do hry',
    endoT: '⭐ Nové hodnocení', endoB: ' tě ohodnotil(a) jako spoluhráče', good: '🤝 Spolehlivý', skill: '🎯 Skill', fun: '😄 Zábavný',
    mtSoonT: '⏰ Za 10 minut: {g}', mtSoonB: 'Sraz v {t} — otevři GG Squad', mtGoT: '🎮 Sraz začal!', mtGoB: 'Jsi v party {g} — otevři GG Squad', mtPt: 'Sraz v {t}',
    onT: '🟢 Kamarád je online', onB: ' právě otevřel GG Squad', wtT: '🏆 Jsi v top týdne!', wtB: '{n}. místo podle XP — odznak máš v profilu', ndT: '👋 GG Squad na tebe čeká', ndB: 'Otevři aplikaci z Google Play, ať se ti test počítá'
  }
};

const s16 = (v) => (typeof v === 'string' ? v.slice(0, 16) : '') || '…';

function preview(m, L) {
  m = String(m || '');
  if (/^\[st:\d+\]$/.test(m)) return L.sticker;
  if (/^\[clan:[A-Za-z0-9_-]+\]$/.test(m)) return L.clanInv;
  if (/^\[party:[A-Za-z0-9_-]+\]$/.test(m)) return L.partyInv;
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

/* kind: dm | friend | game | lfg | party | clan | gift ; build(L) => {title, body} ; chat — id чата (party), который можно выключить */
async function push(to, kind, build, sec, from, chat) {
  if (!to || to === from) return null;
  const snap = await db.doc('push/' + to).get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = (Array.isArray(d.tokens) ? d.tokens : []).filter((t) => typeof t === 'string' && t.length > 20).slice(-10);
  if (!tokens.length) return null;
  const P = d.prefs || {};
  if (P[kind] === false) return null;
  if (typeof P.dnd === 'number' && Date.now() < P.dnd) return null; // «не беспокоить»
  const mu = Array.isArray(P.mu) ? P.mu : [];
  if ((from && mu.includes(from)) || (chat && mu.includes(chat))) return null; // «без звука»
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
  const clan = /^\[clan:/.test(String(d.m || '')), party = /^\[party:/.test(String(d.m || ''));
  return push(d.to, clan ? 'clan' : party ? 'party' : 'dm', (L) => ({ title: s16(d.n), body: preview(d.m, L) }), 'chat', d.from);
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

// 🎮 пати: новый игрок — создателю; пати собрано — всем участникам
const members = (p) => (p && p.m && typeof p.m === 'object' ? Object.keys(p.m) : []);
const partySize = (p) => ([2, 3, 4, 5, 6, 10].includes(p && p.sz) ? p.sz : 5);
exports.onPartyUpdate = fn.firestore.document('party/{id}').onUpdate((ch) => {
  const a = ch.before.data(), b = ch.after.data(), ma = members(a), mb = members(b);
  const added = mb.filter((u) => !ma.includes(u));
  const jobs = [];
  // лидер нажал «Погнали!» — всем остальным
  const gta = a.gt && a.gt.toMillis ? a.gt.toMillis() : 0, gtb = b.gt && b.gt.toMillis ? b.gt.toMillis() : 0;
  if (gtb && gtb !== gta) mb.forEach((u) => { if (u !== b.o) jobs.push(push(u, 'party', (L) => ({ title: L.goT, body: L.goB }), 'lfg', b.o, 'party').catch(() => null)); });
  if (!added.length) return Promise.all(jobs);
  added.forEach((u) => {
    if (u === b.o) return;
    const n = s16(b.m[u] && b.m[u].n);
    jobs.push(push(b.o, 'party', (L) => ({ title: L.partyT, body: n + L.partyJoin }), 'lfg', u).catch(() => null));
  });
  if (ma.length < partySize(b) && mb.length >= partySize(b)) {
    mb.forEach((u) => { if (!added.includes(u)) jobs.push(push(u, 'party', (L) => ({ title: L.partyFull, body: L.partyFullB }), 'lfg', added[0]).catch(() => null)); });
  }
  return Promise.all(jobs);
});
// 💬 сообщение в чате пати — остальным участникам
exports.onPartyMsg = fn.firestore.document('pmsg/{id}').onCreate(async (s) => {
  const d = s.data();
  const p = await db.doc('party/' + d.p).get();
  if (!p.exists) return null;
  return Promise.all(members(p.data()).filter((u) => u !== d.uid).map((u) =>
    push(u, 'party', (L) => ({ title: '🎮 ' + s16(d.n), body: preview(d.m, L) }), 'chat', d.uid, 'party').catch(() => null)));
});

// ⭐ новая оценка тиммейта
exports.onEndo = fn.firestore.document('endo/{id}').onCreate(async (s) => {
  const d = s.data();
  const n = await nickOf(d.from);
  const k = (Array.isArray(d.k) ? d.k : []).filter((x) => ['good', 'skill', 'fun'].includes(x));
  return push(d.to, 'friend', (L) => ({ title: L.endoT, body: n + L.endoB + (k.length ? ': ' + k.map((x) => L[x]).join(', ') : '') }), 'me', d.from);
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

// ===== Сборы на время: напоминание за 10 минут и пати в момент старта (каждую минуту) =====
const SZ = [2, 3, 4, 5, 6, 10];
const hm = (ms) => new Date(ms).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
const gName = (m) => (typeof m.g === 'string' && m.g && m.g !== '—' ? m.g.slice(0, 20) : 'GG Squad');
const okc = (c) => (Number.isInteger(c) && c >= 20 && c <= 33 ? c : 20);
function going(m) { const y = m.y && typeof m.y === 'object' ? m.y : {}; return Object.keys(y).filter((u) => y[u] && typeof y[u] === 'object'); }

async function meetStart(doc, m, at) {
  const ids = going(m); if (!ids.includes(m.o)) ids.unshift(m.o);
  const ref = db.doc('party/' + m.o), ps = await ref.get(), now = Date.now();
  const p = ps.exists ? ps.data() : null;
  const pt = p && p.t && p.t.toMillis ? p.t.toMillis() : 0, ph = [1, 3, 6].includes(p && p.h) ? p.h : 3;
  const alive = p && p.m && typeof p.m === 'object' && pt && now - pt < ph * 3600e3;
  const ent = (u, i) => { const e = (m.y && m.y[u]) || {}; return { n: s16(u === m.o ? (e.n || m.n) : e.n), av: Number.isInteger(e.av) ? e.av : 0, c: okc(e.c), j: now + i }; };
  let added = [];
  if (!alive) {
    const sz = SZ.find((x) => x >= Math.max(2, ids.length)) || 10, mm = {};
    ids.slice(0, sz).forEach((u, i) => { mm[u] = ent(u, i); });
    added = Object.keys(mm);
    await ref.set({ o: m.o, n: s16(m.n), game: gName(m) === 'GG Squad' ? '—' : gName(m), text: TXT.ru.mtPt.replace('{t}', hm(at)), sz, h: 3, mic: false, m: mm,
      t: admin.firestore.FieldValue.serverTimestamp(), u: admin.firestore.FieldValue.serverTimestamp() });
  } else {
    const have = Object.keys(p.m), sz = SZ.includes(p.sz) ? p.sz : 5, u = { u: admin.firestore.FieldValue.serverTimestamp() };
    ids.filter((x) => !have.includes(x)).slice(0, Math.max(0, sz - have.length)).forEach((x, i) => { u['m.' + x] = ent(x, i); added.push(x); });
    if (added.length) await ref.update(u);
    added = added.concat(have.filter((x) => ids.includes(x)));
  }
  await doc.ref.update({ st: true, pm: added });
  const g = gName(m);
  return Promise.all(added.map((u) => push(u, 'party', (L) => ({ title: L.mtGoT, body: L.mtGoB.replace('{g}', g) }), 'lfg', u === m.o ? null : m.o).catch(() => null)));
}

exports.meetTick = fn.pubsub.schedule('every 1 minutes').onRun(async () => {
  const now = Date.now(), TSm = admin.firestore.Timestamp;
  const q = await db.collection('meet').where('at', '<=', TSm.fromMillis(now + 10 * 60e3)).limit(200).get();
  const jobs = [];
  for (const doc of q.docs) {
    const m = doc.data(), at = m.at && m.at.toMillis ? m.at.toMillis() : 0;
    if (!at) { jobs.push(doc.ref.delete()); continue; }
    if (now > at + 2 * 3600e3) { // сбор прошёл: ежедневный переносим на завтра, разовый удаляем
      if (m.rp) {
        let nx = at; while (nx < now + 60e3) nx += 864e5;
        const y = {}; if (m.y && m.y[m.o]) y[m.o] = m.y[m.o];
        jobs.push(doc.ref.update({ at: TSm.fromMillis(nx), y, rm: false, st: false, pm: [] }));
      } else jobs.push(doc.ref.delete());
      continue;
    }
    const g = gName(m), tt = hm(at);
    if (at > now && !m.rm) {
      jobs.push(doc.ref.update({ rm: true }));
      going(m).forEach((u) => jobs.push(push(u, 'party', (L) => ({ title: L.mtSoonT.replace('{g}', g), body: L.mtSoonB.replace('{t}', tt) }), 'home', u === m.o ? null : m.o).catch(() => null)));
    }
    if (at <= now && !m.st) jobs.push(meetStart(doc, m, at).catch((e) => console.error('meetStart', doc.id, e)));
  }
  await Promise.all(jobs);
  return null;
});

// ===== «Сообщить, когда зайдёт»: игрок вернулся после 20+ минут — пуш тем, кто следит =====
exports.onSeen = fn.firestore.document('seen/{uid}').onWrite(async (ch, ctx) => {
  if (!ch.after.exists) return null;
  const a = ch.before.exists ? ch.before.data() : {}, b = ch.after.data();
  const ta = a.t && a.t.toMillis ? a.t.toMillis() : 0, tb = b.t && b.t.toMillis ? b.t.toMillis() : 0;
  if (!tb || tb === ta) return null;               // это наша же запись поля n
  if (ta && tb - ta < 20 * 60e3) return null;      // и так был в сети
  const n0 = b.n && b.n.toMillis ? b.n.toMillis() : 0;
  if (n0 && Date.now() - n0 < 3 * 3600e3) return null; // не чаще раза в 3 часа
  const uid = ctx.params.uid;
  const q = await db.collection('push').where('prefs.wf', 'array-contains', uid).limit(100).get();
  if (q.empty) return null;
  await ch.after.ref.update({ n: admin.firestore.FieldValue.serverTimestamp() });
  const nick = await nickOf(uid);
  return Promise.all(q.docs.map((d) => push(d.id, 'friend', (L) => ({ title: L.onT, body: nick + L.onB }), 'friends', uid).catch(() => null)));
});

// ===== Напоминание тестеру от админа =====
exports.onNudge = fn.firestore.document('nudge/{id}').onCreate(async (s) => {
  const d = s.data();
  const adm = await db.doc('admins/' + d.from).get();
  if (adm.exists && typeof d.to === 'string') await push(d.to, 'gift', (L) => ({ title: L.ndT, body: L.ndB }), 'home', null).catch(() => null);
  return s.ref.delete();
});

// ===== Топ недели: в понедельник ночью — три лучших прошлой недели получают значок =====
function weekId(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), dy = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dy);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)), w = Math.ceil(((x - y0) / 864e5 + 1) / 7);
  return x.getUTCFullYear() + '-W' + (w < 10 ? '0' : '') + w;
}
exports.weekTop = fn.pubsub.schedule('5 0 * * 1').timeZone('Europe/Prague').onRun(async () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  const wk = weekId(new Date(now.getTime() - 2 * 864e5));
  const q = await db.collection('scores').where('w', '==', wk).limit(1000).get();
  const rows = [];
  q.forEach((d) => { const x = d.data(); if (Number.isInteger(x.wx) && x.wx > 0) rows.push({ id: d.id, wx: x.wx, n: s16(x.nick) }); });
  rows.sort((a, b) => b.wx - a.wx);
  const top = rows.slice(0, 3);
  await db.doc('config/wtop').set({ w: wk, ids: top.map((r) => r.id), wx: top.map((r) => r.wx), n: top.map((r) => r.n), t: admin.firestore.FieldValue.serverTimestamp() });
  return Promise.all(top.map((r, i) => push(r.id, 'gift', (L) => ({ title: L.wtT, body: L.wtB.replace('{n}', String(i + 1)) }), 'react', null).catch(() => null)));
});
