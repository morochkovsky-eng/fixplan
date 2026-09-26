#!/usr/bin/env bash
# Воспроизведение synthetic-v1.1. Запускать из папки generator/.
set -euo pipefail
python3 -m pip install --requirement requirements.lock
python3 -m playwright install chromium
python3 build11.py                                   # html, png_clean, photo_telegram, literal/geometry oracle
# Semantic gold разрешается и проверяется вашим же ядром:
npx --yes esbuild@0.23.1 "$HOMORY_REPO/lib/server/receipt-core/index.ts" --bundle --platform=node --format=esm --outfile=core.mjs
node resolve_semantics.mjs ./core.mjs > /dev/null   # как есть
node rs_fix.mjs ./core.mjs > /dev/null              # диагностика: U+2212 -> '-'
python3 finalize11.py                                 # semantic/, manifest.json, reports/
python3 -c "import json,hashlib;m=json.load(open('out11/manifest.json'));print(all(hashlib.sha256(open('out11/'+f['clean']['png'],'rb').read()).hexdigest()==f['clean']['sha256'] for f in m['files']))"
