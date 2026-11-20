#!/usr/bin/env bash
# Сборка GG Squad для Google Play (.aab) в GitHub Actions.
# Ключ загрузки (upload key) создаётся при первом запуске и хранится ТОЛЬКО в зашифрованном виде
# в ветке android-signing. Пароль выводится из секрета GGKEY и нигде не печатается.
set -euo pipefail

[ -n "${SA:-}" ] || { echo "Нет секрета GGKEY — собрать не могу"; exit 1; }
# пароль нигде не печатается (лог публикуется в ветку ci-logs-android)
PASS=$(printf 'gg-squad-upload-v2:%s' "$SA" | sha256sum | cut -c1-48)
export PASS
unset SA

VCODE=${GITHUB_RUN_NUMBER}
VNAME="1.0.${GITHUB_RUN_NUMBER}"
export VCODE VNAME
KS="$RUNNER_TEMP/upload.jks"; export KS
REPO_URL="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

echo "=== ключ загрузки ==="
if git fetch -q origin android-signing 2>/dev/null && git cat-file -e FETCH_HEAD:upload-v2.jks.enc 2>/dev/null; then
  git show FETCH_HEAD:upload-v2.jks.enc > "$RUNNER_TEMP/k.enc"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:PASS -in "$RUNNER_TEMP/k.enc" -out "$KS"
  echo "ключ взят из ветки android-signing"
else
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass:env PASS -keypass:env PASS \
    -alias upload -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=GG Squad, O=GG Squad, C=CZ" >/dev/null 2>&1
  D="$RUNNER_TEMP/sig"; mkdir -p "$D"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:PASS -in "$KS" -out "$D/upload-v2.jks.enc"
  printf '# GG Squad upload key\n\nЗашифрованный ключ загрузки для Google Play. Расшифровывается только в GitHub Actions (пароль выводится из секрета GGKEY).\nЕсли ключ потерян — в Play Console: Целостность приложения → Сбросить ключ загрузки.\n' > "$D/README.md"
  ( cd "$D" && git init -q && git checkout -q -b android-signing && git add . \
    && git -c user.email=actions@github.com -c user.name="GitHub Actions" commit -q -m "encrypted upload key" \
    && git push -q -f "$REPO_URL" android-signing )
  echo "создан новый ключ и сохранён (зашифрованным) в ветку android-signing"
fi
echo "--- отпечаток ключа загрузки ---"
keytool -list -v -keystore "$KS" -storepass:env PASS -alias upload 2>/dev/null | grep -E 'SHA256:|SHA-256' | head -1

echo "=== генерация проекта ==="
BW="$RUNNER_TEMP/bw"; mkdir -p "$BW"
( cd "$BW" && npm init -y >/dev/null && npm i --no-audit --no-fund @bubblewrap/core@latest >/dev/null )
echo "bubblewrap core: $(node -p "require('$BW/node_modules/@bubblewrap/core/package.json').version")"
P="$RUNNER_TEMP/twa"
BW_CORE="$BW/node_modules/@bubblewrap/core" node android/gen.cjs "$P"
[ -f "$P/gradlew" ] || { echo "проект не создан"; exit 1; }

echo "=== SDK 36 ==="
cd "$P"
sed -i -E 's/(compileSdkVersion|targetSdkVersion|compileSdk|targetSdk)( =)? [0-9]+/\1\2 36/; s/(minSdkVersion|minSdk)( =)? [0-9]+/\1\2 24/' app/build.gradle
sed -i 's/jcenter()/mavenCentral()/g' build.gradle app/build.gradle settings.gradle 2>/dev/null || true
grep -q suppressUnsupportedCompileSdk gradle.properties 2>/dev/null || echo 'android.suppressUnsupportedCompileSdk=36' >> gradle.properties
SDKM=$(ls "$ANDROID_HOME"/cmdline-tools/*/bin/sdkmanager | head -1)
"$SDKM" --install "platforms;android-36" "build-tools;36.0.0" >/dev/null 2>&1 || true
echo "--- app/build.gradle ---"; cat app/build.gradle
echo "--- build.gradle ---"; cat build.gradle
echo "--- gradle wrapper ---"; cat gradle/wrapper/gradle-wrapper.properties

echo "=== сборка ==="
chmod +x gradlew
./gradlew --no-daemon -q bundleRelease
AAB=$(ls app/build/outputs/bundle/release/*.aab | head -1)
OUT="$RUNNER_TEMP/GG-Squad-$VNAME.aab"
jarsigner -keystore "$KS" -storepass:env PASS -keypass:env PASS -sigalg SHA256withRSA -digestalg SHA-256 \
  -signedjar "$OUT" "$AAB" upload >/dev/null
jarsigner -verify "$OUT" | tail -1
ls -la "$OUT"
echo "--- AndroidManifest (из проекта) ---"; cat app/src/main/AndroidManifest.xml | head -80

echo "=== релиз на GitHub ==="
cd "$GITHUB_WORKSPACE"
gh release create "android-v$VCODE" "$OUT" --repo "$GITHUB_REPOSITORY" --title "GG Squad Android $VNAME" \
  --notes "Файл для Google Play (versionCode $VCODE). Загружать в Play Console → Тестирование → Закрытое тестирование." --latest=false
echo "ГОТОВО: android-v$VCODE"
