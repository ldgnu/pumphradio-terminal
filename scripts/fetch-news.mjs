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

async function fetchFeed(feed) {
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
    console.warn(`  [warn] ${feed.name}: ${e.message}`)
    return []
  } finally {
    clearTimeout(t)
  }
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
      return r ? stripTags(r[1]).replace(/\s+/g, ' ').trim() : ''
    }
    const title = pick(isAtom ? 'title' : 'title')
    const link = (block.match(/<link[^>]*href="([^"]*)"/i) || [])[1]
      || (block.match(/<link>([^<]*)<\/link>/i) || [])[1] || ''
    const desc = pick(isAtom ? 'summary' : 'description')
    const dateRaw = pick(isAtom ? 'published' : 'pubDate') || pick('updated')
    if (!title) continue
    items.push({
      title,
      link: link.trim(),
      summary: desc.slice(0, 4000),
      date: normalizeDate(dateRaw),
      source: feed.name,
      lang: feed.lang || '',
      genres: feed.genres,
    })
  }
  return items
}

function stripTags(s) { return s.replace(/<[^>]*>/g, ' ') }

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

  // Filtro anti-noticias-viejas: fuera todo lo que tenga >14 días o fecha
  // inválida/vacía (feeds muertos tipo wordpress abandonado ya no pudren el listado).
  const MAX_AGE_MS = 14 * 24 * 3600 * 1000
  const now = Date.now()
  const fresh = (it) => {
    const ts = Date.parse(it.date)
    if (!it.date || Number.isNaN(ts)) return false
    return now - ts <= MAX_AGE_MS
  }

  // Log por feed: cuántas traen y cuántas sobreviven al filtro (debug de feeds muertos).
  enabled.forEach((f, i) => {
    const got = perFeed[i]
    const kept = got.filter(fresh)
    const flag = kept.length === 0 ? ' ⚠ SIN NOTICIAS RECIENTES' : ''
    console.log(`  · ${f.name}: ${got.length} items, ${kept.length} frescos${flag}`)
  })

  const all = dedupe(perFeed.flat().filter(fresh))
  const sorted = sortByDate(all).slice(0, 80)

  const out = {
    generated: new Date().toISOString(),
    total: sorted.length,
    items: sorted,
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
