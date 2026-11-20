// Генерирует Android-проект (Trusted Web Activity) для GG Squad через @bubblewrap/core.
// Запуск: node android/gen.cjs <папка-проекта>   (env: VCODE, VNAME, KS)
const core = require(process.env.BW_CORE || '@bubblewrap/core');
const { TwaManifest, TwaGenerator, ConsoleLog } = core;

(async () => {
  const out = process.argv[2];
  const m = await TwaManifest.fromWebManifest('https://san4os12.github.io/game-hub/manifest.webmanifest');
  m.packageId = 'io.github.san4os12.ggsquad';
  m.name = 'GG Squad';
  m.launcherName = 'GG Squad';
  m.appVersionCode = parseInt(process.env.VCODE, 10);
  m.appVersionName = process.env.VNAME;
  m.enableNotifications = true;
  m.fallbackType = 'customtabs';
  m.display = 'standalone';
  m.orientation = 'portrait';
  m.minSdkVersion = 24;
  m.signingKey = { path: process.env.KS, alias: 'upload' };
  const json = m.toJson ? m.toJson() : m;
  console.log('twa-manifest: package', json.packageId, 'host', json.host, 'start', json.startUrl, 'v', json.appVersionCode, json.appVersionName, 'minSdk', json.minSdkVersion);
  const v = m.validate ? m.validate() : null;
  if (v) console.log('validate:', v);
  await new TwaGenerator().createTwaProject(out, m, new ConsoleLog('gen'));
  console.log('generated', out);
})().catch((e) => { console.error(e); process.exit(1); });
