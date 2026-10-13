#!/usr/bin/env bash
# 定時匯出模擬器資料到 emu-data（先匯出到暫存資料夾，成功才換上），每天另存一份備份（保留 14 天）。
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/opt/temurin-21-jre}"
export PATH="$JAVA_HOME/bin:$PATH"
tmp="emu-data.tmp"
rm -rf "$tmp"
npx firebase emulators:export "$tmp" --force --project demo-pokesurvivor >/dev/null
[ -f "$tmp/firebase-export-metadata.json" ] || { echo "匯出失敗：沒有 metadata"; exit 1; }
rm -rf emu-data.prev
[ -d emu-data ] && mv emu-data emu-data.prev
mv "$tmp" emu-data
rm -rf emu-data.prev
mkdir -p backups
day="backups/emu-data-$(date +%F).tar.gz"
[ -f "$day" ] || tar czf "$day" emu-data
ls -1t backups/emu-data-*.tar.gz | tail -n +15 | xargs -r rm -f
# 每小時一份快照（保留 48 份＝2 天），出事時可以回到任何一個小時前
mkdir -p backups/hourly
hour="backups/hourly/emu-data-$(date +%F-%H).tar.gz"
[ -f "$hour" ] || tar czf "$hour" emu-data
ls -1t backups/hourly/emu-data-*.tar.gz | tail -n +49 | xargs -r rm -f
echo "匯出完成 $(date '+%F %T')"
