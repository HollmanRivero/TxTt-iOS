#!/usr/bin/env bash
# TxTt iOS - klargjor Xcode-prosjekt paa Mac
# Kjorer: npm install -> vite build -> cap add/sync ios -> aapner Xcode
# Krever: Node.js, Xcode og CocoaPods installert
set -e

cd "$(dirname "$0")"

echo "============================================"
echo " TxTt iOS - klargjor for iPhone"
echo " Mappe: $(pwd)"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[FEIL] Node.js er ikke installert. Hent den fra https://nodejs.org"
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "[FEIL] Xcode er ikke installert. Hent den gratis fra App Store."
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "[INFO] CocoaPods mangler - installerer via Homebrew ..."
  if command -v brew >/dev/null 2>&1; then
    brew install cocoapods
  else
    echo "[FEIL] Installer CocoaPods forst:  sudo gem install cocoapods"
    exit 1
  fi
fi

echo "[1/4] npm install ..."
npm install

echo "[2/4] Bygger web-appen (vite build) ..."
npm run build

echo "[3/4] Legger til iOS-plattform (hvis den mangler) ..."
if [ ! -d ios ]; then
  npx cap add ios
else
  echo "  ios-mappen finnes allerede - hopper over cap add."
fi

echo "[4/4] Synker web-appen inn i iOS-prosjektet (cap sync) ..."
npx cap sync ios

echo
echo "============================================"
echo " FERDIG med oppsett. Aapner Xcode ..."
echo " Se 'Instruks for iOS bygg.txt' for signering"
echo " og installasjon paa iPhone."
echo "============================================"
npx cap open ios 
