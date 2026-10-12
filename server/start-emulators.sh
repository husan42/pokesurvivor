#!/usr/bin/env bash
# 啟動 Firebase 模擬器（auth / firestore / database），資料存在 server/emu-data。
# 啟動時載入上次的資料，關閉時自動匯出；另外由 export-emulators.sh 定時匯出。
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/opt/temurin-21-jre}"
export PATH="$JAVA_HOME/bin:$PATH"
# firebase-tools 不接受專案資料夾外的規則檔：每次啟動前從 repo 根目錄複製一份。
mkdir -p rules emu-data
cp ../firestore.rules ../firestore.indexes.json ../database.rules.json rules/
IMPORT=()
[ -f emu-data/firebase-export-metadata.json ] && IMPORT=(--import=emu-data)
exec "$PWD/node_modules/.bin/firebase" emulators:start --only auth,firestore,database --project demo-pokesurvivor \
  "${IMPORT[@]}" --export-on-exit=emu-data
