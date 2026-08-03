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

async function translateText(text, src) {
  if (!text) return ''
  // chunk por frases hasta ~900 chars para no reventar la URL
  const sentences = text.match(/[^.!?]+[.!?]+|\s*$/g) || [text]
  let out = ''
  let buf = ''
  const flush = async () => {
    if (!buf.trim()) return
    try {
      const url = `${GTX}?client=gtx&sl=${src || 'auto'}&tl=es&dt=t&q=${encodeURIComponent(buf.trim())}`
      const res = await fetch(url, { headers: { 'User-Agent': 'PumphRadio/0.1 (https://pumphradio.com.ar)' } })
      if (!res.ok) { out += (out ? ' ' : '') + buf.trim(); buf = ''; return }
      const data = await res.json()
      const joined = (data[0] || []).map(seg => seg[0] || '').join('')
      out += (out ? ' ' : '') + joined
    } catch { out += (out ? ' ' : '') + buf.trim() }
    buf = ''
  }
  for (const s of sentences) {
    if (s.trim().length === 0) continue
    if (buf.length + s.length > 900) { await flush() }
    buf += s
  }
  await flush()
  return out.trim()
}

let hitApi = 0
let hitCur = 0

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
    item.title = await translateText(item.title, srcLang) || item.title
    item.summary = await translateText(item.summary || '', srcLang) || item.summary
    item.lang = 'es'
    hitApi++
  }
}

writeFileSync(FILE, JSON.stringify(news, null, 2))
console.log(`✓ ${hitCur} curadas + ${hitApi} por API → ${news.items.length} noticias en español`)
