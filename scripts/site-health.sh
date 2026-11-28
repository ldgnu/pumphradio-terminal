#!/usr/bin/env bash
# PumphRadio · probe de salud rápida: sitios, streams y frescura de noticias.
# Uso: bash scripts/site-health.sh
#
# Nota 2026-11-26: stream.zeno.fm redirige a un host que IGNORA el header Range
# (stream vivo) → `curl -r 0-65535` queda colgado para siempre. Todas las
# mediciones de stream acá usan --max-time y miden bytes reales recibidos:
# 200 + audio/mpeg + bytes > 100KB en ~8s = mount vivo con datos.

set -u

HARDSTYLE="https://stream.zeno.fm/gpv2kgzwum0uv"
HARDCORE="https://stream.zeno.fm/nv74sz7wum0uv"
DEEP_TECHNO="https://stream.zeno.fm/fpfejm9r55vuv"
NUJAZZ="https://stream.zeno.fm/s3ag9f75buqvv"

SITE_URL="https://pumphradio.com.ar"
NEWS_JSON="public/news.json"

fail=0

echo "== Sitio =="
for url in "$SITE_URL" "$SITE_URL/sw.js"; do
  printf '%s → ' "$url"
  curl -sL -m 15 -o /dev/null -w "%{http_code} %{content_type} %{size_download}B\n" "$url" || { echo "FALLÓ (curl exit $?)"; fail=1; }
done

echo "== Streams (máx 8s cada uno, se miden bytes reales) =="
for url in "$HARDSTYLE" "$HARDCORE" "$DEEP_TECHNO" "$NUJAZZ"; do
  printf '%s → ' "$url"
  out=$(curl -sL -m 8 -o /dev/null -w "%{http_code} %{content_type} %{size_download}B" "$url")
  code=${out%% *}
  bytes=${out##* }
  bytes=${bytes%B}
  if [[ "$out" == *"audio/mpeg"* && "$bytes" =~ ^[0-9]+$ && "$bytes" -gt 100000 ]]; then
    echo "OK ($out)"
  else
    echo "ALERTA ($out)"
    fail=1
  fi
done

echo "== Frescura de noticias =="
if [[ -f "$NEWS_JSON" ]]; then
  node -e '
    const d = require("./'"$NEWS_JSON"'");
    const items = d.items;
    const dayMs = 86400000;
    const now = Date.now();
    const fresh = items.filter(i => { const t = new Date(i.date).getTime(); return !Number.isNaN(t) && (now - t) < 14 * dayMs; }).length;
    const es = items.filter(i => i.lang === "es").length;
    console.log(`${items.length} items · ${fresh} <= 14 días · ${es}/${items.length} en es`);
    if (items.length < 40 || es !== items.length) process.exitCode = 1;
  ' || fail=1
else
  echo "FALTA $NEWS_JSON"
  fail=1
fi

echo
if (( fail )); then
  echo "RESULTADO: ALERTA"
  exit 1
fi
echo "RESULTADO: OK"
