#!/usr/bin/env node
/**
 * fetch-news.mjs — Agregador RSS build-time.
 *
 * Corre server-side (en el build/CI, sin CORS). Baja los feeds de
 * data/feeds.json, los parsea (RSS/Atom), dedupe por link, clasifica por
 * género y escribe public/news.json (que Vite copia a dist/ y el cliente
 * lee del mismo origen → sin CORS en runtime, 100% confiable).
 *
 * Uso:  node scripts/fetch-news.mjs   (escribe public/news.json)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const feeds = JSON.parse(readFileSync(join(ROOT, 'data/feeds.json'), 'utf8')).feeds

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const MAX_ITEMS = 25

// Un solo intento depende de un timeout de 12s por feed: si cae (abort por red
// lenta, HTTP transitorio) se pierde TODO el lote (caso real 2026-10-29: los 3
// feeds de We Rave You abortaron en la misma corrida). Reintentamos una vez.
async function fetchFeed(feed) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12000)
    try {
      const res = await fetch(feed.url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const xml = await res.text()
      return parseItemsRegex(xml, feed)
    } catch (e) {
      if (attempt < 2) {
        console.warn(`  [warn] ${feed.name}: ${e.message} — reintento en 2s`)
        await new Promise((r) => setTimeout(r, 2000))
      } else {
        console.warn(`  [warn] ${feed.name}: ${e.message}`)
      }
    } finally {
      clearTimeout(t)
    }
  }
  return []
}

function el(parent, tag) { return parent?.getElementsByTagName(tag)[0] || null }
function text(node) { return (node?.textContent || '').replace(/\s+/g, ' ').trim() }

// Parser regex para RSS/Atom (suficiente y sin deps).
function parseItemsRegex(xml, feed) {
  const isAtom = /<feed[\s>]/.test(xml)
  const items = []
  const itemRe = isAtom ? /<entry[\s>]([\s\S]*?)<\/entry>/g : /<item[\s>]([\s\S]*?)<\/item>/g
  let m
  while ((m = itemRe.exec(xml)) && items.length < MAX_ITEMS) {
    const block = m[1]
    const pick = (tag) => {
      const r = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'))
      return r ? cleanField(r[1]) : ''
    }
    const title = pick(isAtom ? 'title' : 'title')
    const rawLink = (block.match(/<link[^>]*href="([^"]*)"/i) || [])[1]
      || (block.match(/<link>([^<]*)<\/link>/i) || [])[1] || ''
    const link = decodeEntities(rawLink)
    const desc = pick(isAtom ? 'summary' : 'description')
    const dateRaw = pick(isAtom ? 'published' : 'pubDate') || pick('updated')
    if (!title) continue
    const item = {
      title,
      link: link.trim(),
      summary: desc.slice(0, 4000),
      date: normalizeDate(dateRaw),
      source: feed.name,
      lang: feed.lang || '',
      genres: [], // se completa abajo con classifyItem
    }
    item.genres = classifyItem(item, feed)
    items.push(item)
  }
  return items
}

// --- Clasificador de género por CONTENIDO -----------------------------------
// Los feeds generalistas (DJ Mag, We Rave You) marcan todo como "hardstyle" y
// "deep" a la vez → hardcore aparecía en nujazz. Acá cada noticia se clasifica
// mirando su título + resumen, y si no hay señal clara NO se etiqueta (mejor
// vacío que mal etiquetado). Los feeds de nicho conservan su etiqueta como
// fallback cuando el texto no alcanza.
const GENRE_KEYWORDS = {
  hardcore: [
    'hardcore', 'gabber', 'uptempo', 'frenchcore', 'terrorcore', 'speedcore',
    'rawstyle', 'raw hardstyle', 'defqon', 'dominator', 'masters of hardcore',
    'q-dance', 'qdance', 'thunderdome', 'angerfist',
    'miss k8', 'peacock', 'scooter', 'hakkuh', 'hakken', 'harder styles',
    'mad dog', 'dogfight', 'industrial hardcore', 'millennium hardcore',
  ],
  hardstyle: [
    'hardstyle', 'euphoric', 'reverse bass', 'rawstyle', 'raw hardstyle',
    'headhunterz', 'da tweekaz', 'showtek', 'hard dance',
    'defqon', 'qlimax', 'q-dance', 'harder styles', 'd-block', 's-te-fan',
    'coone', 'wildstylez', 'brennan heart', 'hardstyle mag',
  ],
  deep: [
    'deep techno', 'hypnotic', 'dub techno', 'minimal techno', 'atmospheric',
    'birmingham', 'detroit', 'berghain', 'tresor', 'ostgut',
    'sven vath', 'richie hawtin', 'ben klock', 'marcel dettmann', 'dixon',
    'innervisions', 'afterlife', 'ambient techno', 'techno', 'rave',
  ],
  nujazz: [
    'nu jazz', 'nujazz', 'acid jazz', 'broken beat', 'future jazz', 'jazztronica',
    'jazz', 'soul', 'funk', 'blue note', 'brainfeeder', 'flying lotus',
    'robert glasper', 'kamasi', 'thundercat', 'kaytranada', 'badbadnotgood',
    'shabaka', 'makaya', 'downtempo', 'neo soul', 'jazz cafe', 'jazzfest',
  ],
  // Bolsa común para medios generalistas: si no hay señal de nicho pero la nota
  // es de escena electrónica, igual entra al pool general (chip "todos").
  electronica: [
    'electronic', 'electronica', 'edm', 'festival', 'dj', 'club', 'nightclub',
    'line-up', 'lineup', 'set', 'track', 'single', 'album', 'ep ', 'release',
    'label', 'remix', 'tour', 'arena', 'venue', 'boiler room', 'ibiza',
    'tomorrowland', 'awakenings', 'ultra', 'edc', 'creamfields',
  ],
}

// Peso: hardcore/hardstyle son más específicos que "techno" genérico, así que
// ante empate gana el más específico (evita que "hardstyle" se coma la noticia).
const GENRE_PRIORITY = ['hardcore', 'hardstyle', 'nujazz', 'deep']
// "electronica" es la bolsa general: solo se usa si NINGÚN género de nicho matchea.
const NICHE_GENRES = ['hardcore', 'hardstyle', 'nujazz', 'deep']

function countHits(text, kw) {
  // palabra/frase completa: evita que "hard" matchee "hardware"
  const re = new RegExp('(^|[^a-z0-9])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'g')
  const m = text.match(re)
  return m ? m.length : 0
}

// Falsos positivos conocidos: "hardcore" y "techno" se usan coloquialmente
// ("power of hardcore", "hardcore punk", "hardcore fans"). Si el texto tiene
// señales fuertes de otro género, ese gana aunque el otro tenga 1 hit.
const CONTEXT_OVERRIDES = [
  {
    // jazz experimental / improv / punk-jazz: Cafe Oto, CafeOTO, improv, trio...
    when: /\b(jazz|improv|improvis|free jazz|quartet|trio|sextet|saxophone|sax|drums|double bass|bassist|guitarist|pianist|ensemble|bluenote|blue note|cafe oto|cafeoto|gig|concert hall|recital)\b/,
    genre: 'nujazz',
    // solo si el texto huele a jazz de verdad (2+ señales) y no es hard dance
    requireAtLeast: 2,
  },
]

function applyContextOverride(text, winner) {
  const t = ' ' + String(text || '').toLowerCase() + ' '
  // si ya ganó nujazz, no hay nada que corregir
  if (winner === 'nujazz') return winner
  let hits = 0
  const m = t.match(CONTEXT_OVERRIDES[0].when)
  if (m) hits = m.length
  // hard dance real siempre gana: evita robar noticias de hardcore/hardstyle legítimas
  const hardSignals = countHits(t, 'hardcore') + countHits(t, 'hardstyle') + countHits(t, 'hard dance') + countHits(t, 'harder styles') + countHits(t, 'gabber')
  if (hits >= 2 && hardSignals <= 1) return 'nujazz'
  return winner
}

function classifyByContent(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' '

  // 1) géneros de nicho: el que más keywords pegue gana
  const scores = {}
  for (const genre of NICHE_GENRES) {
    let hits = 0
    for (const kw of GENRE_KEYWORDS[genre]) hits += countHits(t, kw)
    if (hits) scores[genre] = hits
  }
  const found = Object.keys(scores)
  if (found.length) {
    const max = Math.max(...Object.values(scores))
    const top = found.filter((g) => scores[g] === max)
    // desempate: el más específico primero
    top.sort((a, b) => GENRE_PRIORITY.indexOf(a) - GENRE_PRIORITY.indexOf(b))
    return [applyContextOverride(t, top[0])]
  }

  // 2) sin nicho claro → bolsa general si es escena electrónica
  let generalHits = 0
  for (const kw of GENRE_KEYWORDS.electronica) generalHits += countHits(t, kw)
  if (generalHits >= 2) return ['electronica']

  // 3) nada → sin etiqueta (mejor vacío que mal etiquetado)
  return []
}

function classifyItem(item, feed) {
  const content = classifyByContent(`${item.title} ${item.summary}`)
  if (content.length) return content
  // Sin señal en el texto: solo confiar en el feed si es de nicho puro.
  const niche = (feed.genres || []).filter((g) => NICHE_GENRES.includes(g))
  if (niche.length === 1) return niche
  // feed generalista sin señal → sin etiqueta (no inventar)
  return []
}

function stripTags(s) {
  return s.replace(/<!\[CDATA\[|\]\]>/g, ' ').replace(/<[^>]*>/g, ' ')
}


// DJ Mag (y otros) escapan su propio HTML DENTRO del RSS: la description
// llega como &lt;div class="..."&gt;&lt;p&gt;texto&lt;/p&gt;. Sin decodificar,
// stripTags no ve nada: el markup queda adentro del summary, el traductor se
// lo come y el news.json termina con tags crudos. Decodificamos ANTES de
// stripTags y otra vez después (caso &amp;lt; / &amp;amp;).
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', hellip: '…', middot: '·',
}
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
    if (body[0] === '#') {
      const code = (body[1] === 'x' || body[1] === 'X') ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? m
  })
}
function cleanField(s) {
  const decoded = decodeEntities(String(s))
  return decodeEntities(stripTags(decoded)).replace(/\s+/g, ' ').trim()
}

// Node/V8 no parsea abreviaturas de timezone tipo "BST"/"CEST" en Date.parse
// (caso real: djmag.com). Las normalizamos a offset numérico antes de guardar.
const TZ_OFFSETS = {
  BST: '+0100', CEST: '+0200', EET: '+0200', IST: '+0530',
  EDT: '-0400', EST: '-0500', CDT: '-0500', CST: '-0600',
  MDT: '-0600', MST: '-0700', PDT: '-0700', PST: '-0800',
  AEDT: '+1100', AEST: '+1000', JST: '+0900', KST: '+0900',
}
function normalizeDate(s) {
  const raw = String(s || '').trim()
  return raw.replace(/\b([A-Z]{2,4})\b$/, (m) =>
    TZ_OFFSETS[m] ? `${TZ_OFFSETS[m]}` : m
  ).replace(/(\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/, '$1 $2')
}

function dedupe(items) {
  const seen = new Set()
  return items.filter((it) => {
    const k = (it.title + it.link).toLowerCase().replace(/\s+/g, '')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function sortByDate(items) {
  return items.sort((a, b) => {
    const da = Date.parse(a.date) || 0
    const db = Date.parse(b.date) || 0
    return db - da
  })
}

async function main() {
  console.log('PumphRadio · fetch-news')
  const enabled = feeds.filter((f) => f.enabled)
  const perFeed = await Promise.all(enabled.map(fetchFeed))

  // Noticias manuales curadas (data/manual-news.json): se mergean SIEMPRE arriba.
  let manual = []
  try {
    manual = JSON.parse(readFileSync(join(ROOT, 'data', 'manual-news.json'), 'utf8')).items || []
    if (manual.length) console.log(`  · ${manual.length} noticia(s) manual(es) incluida(s)`)
  } catch { /* sin manuales, OK */ }

  // Ventana de frescura POR GÉNERO: los géneros de nicho publican poco
  // (hardstyle/hardcore pueden pasar semanas sin notas). Una ventana única de
  // 14 días vaciaba esos apartados. Los generalistas sí se filtran parejo.
  const AGE_BY_GENRE = {
    hardstyle: 60 * 24 * 3600 * 1000, // 60 días: publica a cuentagotas
    hardcore: 45 * 24 * 3600 * 1000,
    nujazz: 30 * 24 * 3600 * 1000,
    deep: 30 * 24 * 3600 * 1000,
    _default: 14 * 24 * 3600 * 1000, // generalistas: fresco o nada
  }
  const now = Date.now()
  const fresh = (it) => {
    const ts = Date.parse(it.date)
    if (!it.date || Number.isNaN(ts)) return false
    const g = (it.genres || [])[0]
    const maxAge = AGE_BY_GENRE[g] ?? AGE_BY_GENRE._default
    return now - ts <= maxAge
  }

  // Log por feed: cuántas traen y cuántas sobreviven al filtro (debug de feeds muertos).
  enabled.forEach((f, i) => {
    const got = perFeed[i]
    const kept = got.filter(fresh)
    const flag = kept.length === 0 ? ' ⚠ SIN NOTICIAS RECIENTES' : ''
    console.log(`  · ${f.name}: ${got.length} items, ${kept.length} frescos${flag}`)
  })

  const all = dedupe([...manual, ...perFeed.flat().filter(fresh)])
  const sorted = sortByDate(all).slice(0, 80)
  // Las manuales curadas van fijas al tope (pinned), el resto por fecha.
  const manualKeys = new Set(manual.map((it) => (it.title + it.link).toLowerCase().replace(/\s+/g, '')))
  const final = [...sorted.filter((it) => manualKeys.has((it.title + it.link).toLowerCase().replace(/\s+/g, ''))),
                 ...sorted.filter((it) => !manualKeys.has((it.title + it.link).toLowerCase().replace(/\s+/g, '')))]

  const out = {
    generated: new Date().toISOString(),
    total: sorted.length,
    items: final,
  }
  const file = join(ROOT, 'public', 'news.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`  ✓ ${sorted.length} noticias únicas → public/news.json`)
  if (!sorted.length) {
    console.warn('  ⚠ 0 noticias frescas — revisar data/feeds.json (feeds caídos?)')
  }
}

main().catch((e) => { console.error('fetch-news error:', e); process.exit(1) })
