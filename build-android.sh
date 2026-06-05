#!/usr/bin/env bash
# TxTt Android - bygg APK paa Mac/Linux
# Kjorer: npm install -> vite build -> cap add/sync
# Krever: Node.js og Android Studio (Android SDK + JDK) installert
set -e

cd "$(dirname "$0")"

echo "============================================"
echo " TxTt Android - bygg APK"
echo " Mappe: $(pwd)"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[FEIL] Node.js er ikke installert. Hent den fra https://nodejs.org"
  exit 1
fi

echo "[1/5] npm install ..."
npm install

echo "[2/5] Bygger web-appen (vite build) ..."
npm run build

echo "[3/5] Legger til Android-plattform (hvis den mangler) ..."
if [ ! -d android ]; then
  npx cap add android
else
  echo "  android-mappen finnes allerede - hopper over cap add."
fi

echo "[4/5] Setter SDK-nivaa: minSdk 33 (Android 13), target/compile 34 (Android 14) ..."
if [ -f android/variables.gradle ]; then
  sed -i.bak \
    -e 's/minSdkVersion = [0-9]*/minSdkVersion = 33/' \
    -e 's/compileSdkVersion = [0-9]*/compileSdkVersion = 34/' \
    -e 's/targetSdkVersion = [0-9]*/targetSdkVersion = 34/' \
    android/variables.gradle && rm -f android/variables.gradle.bak
fi

echo "[5/5] Synker web-appen inn i Android-prosjektet (cap sync) ..."
npx cap sync android

echo
echo "============================================"
echo " FERDIG med oppsett. Bygg APK paa en av to maater:"
echo
echo "  A) Android Studio:   npx cap open android"
echo "     ...og: Build > Build Bundle(s)/APK(s) > Build APK(s)"
echo
echo "  B) Kommandolinje:    cd android && ./gradlew assembleDebug"
echo
echo " Ferdig APK: android/app/build/outputs/apk/debug/app-debug.apk"
echo "============================================"
