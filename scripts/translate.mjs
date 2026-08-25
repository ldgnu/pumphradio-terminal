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

// --- Capa 3: FreeLLMAPI (gateway OpenAI-compatible) -------------------------
// El endpoint gtx de Google bloquea IPs de datacenter con captcha "Sorry...".
// Fallback: batches de items al gateway (modelo auto) que devuelve JSON
// traducido. Se activa sola si gtx falla para algún item.
const LLM_BASE = process.env.LLM_BASE_URL || ''
const LLM_KEY = process.env.LLM_API_KEY || ''

async function llmTranslateBatch(items, srcLang) {
  if (!LLM_BASE || !LLM_KEY || !items.length) return null
  const payload = items.map((it, i) => ({ i, title: it.title, summary: (it.summary || '').slice(0, 1200) }))
  const body = {
    model: 'auto',
    messages: [
      {
        role: 'system',
        content:
          'Sos un traductor al español rioplatense neutro especializado en música electrónica (hardcore, gabber, hardstyle, techno). ' +
          'Devolvés SOLO un array JSON válido, sin markdown ni texto extra, con la misma forma de entrada: [{"i":<int>,"title":"...","summary":"..."}]. ' +
          'No agregues comentarios ni inventes datos: traducí exactamente lo que llega.',
      },
      { role: 'user', content: `Idioma origen: ${srcLang || 'auto'}. Traducí title y summary de cada item:\n${JSON.stringify(payload)}` },
    ],
    max_tokens: 4000,
  }
  for (let t = 1; t <= 3; t++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 180000)
      const res = await fetch(`${LLM_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      const txt = data?.choices?.[0]?.message?.content || ''
      // tolerar fences ```json ... ```
      const clean = txt.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
      const start = clean.indexOf('[')
      const end = clean.lastIndexOf(']')
      if (start === -1 || end === -1) throw new Error('sin array JSON en respuesta')
      const arr = JSON.parse(clean.slice(start, end + 1))
      return arr
    } catch (e) {
      console.warn(`  [llm-batch] intento ${t} falló: ${e.message}`)
      await sleep(2000 * t)
    }
  }
  return null
}

// Devuelve true si tradujo (marca lang='es'), false si no pudo.
async function translateItemViaLlm(item, srcLang) {
  const arr = await llmTranslateBatch([item], srcLang)
  const r = Array.isArray(arr) && arr.find((x) => x && x.i === 0)
  if (r && r.title) {
    item.title = String(r.title).trim()
    if (r.summary) item.summary = String(r.summary).trim()
    item.lang = 'es'
    return true
  }
  return false
}

let hitApi = 0
let hitCur = 0
let hitLlm = 0
let failed = 0
const pending = [] // items que gtx no pudo → capa 3 (FreeLLMAPI)

for (const item of news.items) {
  // Capa 1: mapa curado
  const cur = Object.keys(T).find((k) => item.title.includes(k))
  if (cur) {
    item.title = T[cur]
    item.lang = 'es'
    hitCur++
    continue
  }
  // Capa 2: API gtx para todo lo demás que no esté en español
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
      // no se pudo con gtx (IP bloqueada / rate-limit) → cola para la capa 3
      pending.push({ item, srcLang })
    }
  }
}

// Capa 3: FreeLLMAPI en batches de 5 (título + summary por item).
if (pending.length) {
  if (LLM_BASE && LLM_KEY) {
    console.log(`· gtx falló para ${pending.length} items → traduciendo vía FreeLLMAPI (${Math.ceil(pending.length / 5)} batches)...`)
    for (let i = 0; i < pending.length; i += 5) {
      const chunk = pending.slice(i, i + 5)
      const arr = await llmTranslateBatch(chunk.map((p) => p.item), chunk[0].srcLang)
      if (Array.isArray(arr)) {
        for (let j = 0; j < chunk.length; j++) {
          const r = arr.find((x) => x && x.i === j)
          if (r && r.title) {
            chunk[j].item.title = String(r.title).trim()
            if (r.summary) chunk[j].item.summary = String(r.summary).trim()
            chunk[j].item.lang = 'es'
            hitLlm++
          } else failed++
        }
      } else {
        chunk.forEach(() => failed++)
      }
    }
  } else {
    pending.forEach(() => failed++)
  }
}

writeFileSync(FILE, JSON.stringify(news, null, 2))
console.log(`✓ ${hitCur} curadas + ${hitApi} gtx + ${hitLlm} freellm · ${failed} sin traducir → ${news.items.length} items`)
if (failed > 0) process.exitCode = 2
