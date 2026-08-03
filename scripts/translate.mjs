#!/usr/bin/env node
/**
 * translate.mjs — Traducción a español (arg neutro) de TODAS las noticias.
 *
 * Estrategia en 2 capas:
 *   1. Mapa curado a mano (traducción experta verificada) — se aplica primero.
 *   2. API Google Translate (endpoint gtx, gratis sin key) para el resto —
 *      traduce title + summary al español. Determinístico, corre en CI.
 *
 * Nunca inventa datos: traduce el contenido EXISTENTE, no genera nuevo.
 * Uso: node scripts/translate.mjs   (reescribe public/news.json)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'public', 'news.json')
const news = JSON.parse(readFileSync(FILE, 'utf8'))

const GTX = 'https://translate.googleapis.com/translate_a/single'

// --- Capa 1: traducción curada experta (se aplica antes que la API) ---
const T = {
  'Spotgoedkope TicketSwap-tickets': 'El reinado de las entradas baratas en TicketSwap podría estar llegando a su fin',
  'Pat B scoort Tomorrowland-hit': 'Pat B consigue el hit de Tomorrowland junto a Dimitri Vegas: "Turn The Tide"',
  'Hardstyle maakt steeds meer indruk': 'El hardstyle impone cada vez más presencia en Tomorrowland',
  'Burgemeester over afgelast Defqon.1': 'El alcalde de Dronten rompe el silencio tras la cancelación de Defqon.1',
  'Lekkerfaces tovert': 'Lekkerfaces saca de la galera el line-up de LET\'S GET HYPER',
  'Dominator trapt af': 'Dominator arranca a pleno sol con un hosting demoledor',
  'REBELLiON Indoor onthult': 'REBELLiON Indoor presenta un programa cargado de battles exclusivas y shows en vivo',
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Divide en chunks de <= ~800 chars por límites de palabra (robusto, no
// depende de puntuación — títulos sin '.'/'!'/'?' antes se perdían).
function chunkText(text, size = 800) {
  const out = []
  let cur = ''
  for (const part of text.split(/(\s+)/)) {
    if (cur.length + part.length > size && cur.trim()) {
      out.push(cur.trim())
      cur = part
    } else cur += part
  }
  if (cur.trim()) out.push(cur.trim())
  return out.length ? out : [text.trim()]
}

// Traduce un texto con delay + retry (gtx rate-limitea en ráfagas).
// Devuelve '' si no pudo (para que el caller decida el fallback).
async function translateText(text, src) {
  if (!text) return ''
  const chunks = chunkText(text)
  let out = ''
  let ok = true
  for (const c of chunks) {
    let done = false
    for (let t = 1; t <= 3 && !done; t++) {
      try {
        await sleep(200 * t) // espaciar: evita rate-limit
        const url = `${GTX}?client=gtx&sl=${src || 'auto'}&tl=es&dt=t&q=${encodeURIComponent(c)}`
        const res = await fetch(url, { headers: { 'User-Agent': 'PumphRadio/0.1 (https://pumphradio.com.ar)' } })
        if (!res.ok) continue
        const data = await res.json()
        const joined = (data[0] || []).map(seg => seg[0] || '').join('').trim()
        if (joined) { out += (out ? ' ' : '') + joined; done = true }
        else continue
      } catch { /* retry */ }
    }
    if (!done) { ok = false; break }
  }
  return ok ? out.trim() : ''
}

let hitApi = 0
let hitCur = 0
let failed = 0

for (const item of news.items) {
  // Capa 1: mapa curado
  const cur = Object.keys(T).find((k) => item.title.includes(k))
  if (cur) {
    item.title = T[cur]
    item.lang = 'es'
    hitCur++
    continue
  }
  // Capa 2: API para todo lo demás que no esté en español
  if (item.lang !== 'es') {
    const srcLang = item.lang === 'nl' ? 'nl' : 'auto'
    const newTitle = await translateText(item.title, srcLang)
    if (newTitle) {
      item.title = newTitle
      const newSummary = await translateText(item.summary || '', srcLang)
      if (newSummary) item.summary = newSummary
      item.lang = 'es'
      hitApi++
    } else {
      // no se pudo traducir → se deja en idioma original (honesto, no miente lang)
      failed++
    }
  }
}

writeFileSync(FILE, JSON.stringify(news, null, 2))
console.log(`✓ ${hitCur} curadas + ${hitApi} por API · ${failed} sin traducir → ${news.items.length} items`)
if (failed > 0) process.exitCode = 2
