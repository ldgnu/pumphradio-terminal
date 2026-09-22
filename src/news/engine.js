/**
 * news/engine.js — Noticias del lado cliente.
 * Carga public/news.json (generado en build-time por scripts/fetch-news.mjs)
 * del mismo origen (sin CORS), filtra por los géneros de la estación actual
 * y las renderiza en el shell.
 */
import { getState, on } from '../store.js'

const NEWS_URL = import.meta.env.BASE_URL + 'news.json'
const NEWS_FILTER_KEY = 'pumph.news.filter'
const NEWS_FILTERS = [
  { id: 'all', label: 'todos' },
  { id: 'hardcore', label: 'hardcore' },
  { id: 'hardstyle', label: 'hardstyle' },
  { id: 'deep-techno', label: 'deep techno' },
  { id: 'nujazz', label: 'nujazz' },
]
let allItems = []
let loaded = false
let manualFilter = loadFilter()

function loadFilter() {
  try {
    const v = localStorage.getItem(NEWS_FILTER_KEY)
    return NEWS_FILTERS.some((f) => f.id === v) ? v : 'auto'
  } catch { return 'auto' }
}
function saveFilter(v) {
  try { localStorage.setItem(NEWS_FILTER_KEY, v) } catch { /* noop */ }
}
function setFilter(v) {
  manualFilter = v
  saveFilter(v)
  renderForStation(getState().station)
  renderFilterChips()
}

function $(sel) { return document.querySelector(sel) }

export async function initNews() {
  // Re-render al cambiar de estación
  on('station', renderForStation)

  try {
    const res = await fetch(NEWS_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    allItems = data.items || []
    loaded = true
  } catch (e) {
    console.warn('[news] no se pudo cargar news.json:', e.message)
    allItems = []
  }
  renderForStation(getState().station)
  renderFilterChips()
}

function itemsForStation(station) {
  // Filtro manual de género (chips): tiene prioridad sobre la estación activa.
  if (manualFilter && manualFilter !== 'auto') {
    if (manualFilter === 'all') return allItems
    const matched = allItems.filter((it) => (it.genres || []).some((g) => g.includes(manualFilter) || manualFilter.includes(g)))
    return matched.length ? matched : allItems
  }
  if (!station || !allItems.length) return allItems
  const genres = station.subgenres || station.genres || []
  const key = genres.join('|')
  // coincidencia: el item pertenece a al menos uno de los géneros/subgéneros de la estación
  const matched = allItems.filter((it) =>
    (it.genres || []).some((g) => key.includes(g) || station.id.includes(g))
  )
  return matched.length ? matched : allItems
}

function renderFilterChips() {
  const bar = $('#news-filter')
  if (!bar) return
  const counts = { all: allItems.length }
  for (const f of NEWS_FILTERS) {
    if (f.id === 'all') continue
    counts[f.id] = allItems.filter((it) => (it.genres || []).some((g) => g.includes(f.id) || f.id.includes(g))).length
  }
  bar.innerHTML = NEWS_FILTERS.map((f) => {
    const active = manualFilter === f.id
    return `<button class="news-chip ${active ? 'active' : ''}" role="tab" aria-selected="${active}" data-filter="${f.id}" title="${f.label} (${counts[f.id] ?? 0})">${escapeHtml(f.label)}${counts[f.id] ? ` <span class="nf-count">${counts[f.id]}</span>` : ''}</button>`
  }).join('') + '<button class="news-chip nf-auto ' + (manualFilter === 'auto' ? 'active' : '') + '" role="tab" aria-selected="' + (manualFilter === 'auto') + '" data-filter="auto" title="Seguir la estación activa">auto</button>'
  bar.querySelectorAll('.news-chip').forEach((el) => {
    el.addEventListener('click', () => setFilter(el.dataset.filter))
  })
}

function cleanTitle(t) {
  // decodificar entidades HTML antes (&#8211; → –, &amp; → &, etc.)
  let s = decodeEntities(t)
  // prettify títulos de feeds de releases (underscores → espacios, quitar catálogo)
  s = s.replace(/_/g, ' ')
  s = s.replace(/\s*[-–—]\s*[A-Z]{2,6}-?\d{2,4}.*$/i, '') // quitar "-(LABELxxx)-WEB-2026"
  return s.trim()
}

function decodeEntities(s) {
  const d = document.createElement('textarea')
  d.innerHTML = String(s)
  return d.value
}

export function renderForStation(station) {
  const wrap = $('#news-list')
  if (!wrap) return
  // Estilo distinto por género: deep techno/nujazz ≠ hardstyle/hardcore
  const newsSec = wrap.closest('.news')
  if (newsSec) {
    newsSec.dataset.station = station?.id || ''
    newsSec.dataset.genre = station?.subgenres?.[0] || station?.genres?.[0] || ''
  }
  const items = itemsForStation(station).slice(0, 8)
  if (!items.length) {
    wrap.innerHTML = '<div class="news-empty dim">— no signal —</div>'
    return
  }
  wrap.innerHTML = items.map((it, i) => `
    <div class="news-item" data-idx="${i}">
      <span class="ni-time">${fmtDate(it.date)}</span>
      <span class="ni-title">${escapeHtml(cleanTitle(it.title))}</span>
      ${it.genres?.[0] ? `<span class="ni-tag">${escapeHtml(it.genres[0])}</span>` : ''}
      ${freshness(it.date) ? `<span class="ni-fresh ${freshness(it.date).cls}">${freshness(it.date).label}</span>` : ''}
      <span class="ni-src dim">${escapeHtml(it.source)}</span>
    </div>
  `).join('')

  // click → abrir pane tmux con el artículo
  wrap.querySelectorAll('.news-item').forEach((el, i) => {
    el.style.animationDelay = (i * 0.03) + 's'
    el.addEventListener('click', () => openPane(items[i]))
  })
}

function openPane(item) {
  const pane = $('#news-pane')
  const scrim = $('#pane-scrim')
  if (!pane) return
  paneTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  setTextEl('#pane-source', item.source)
  setTextEl('#pane-title', cleanTitle(item.title))
  const langLabel = item.lang === 'es' ? 'ES' : 'EN'
  setTextEl('#pane-meta', `${fmtFullDate(item.date)} · ${langLabel} · ${item.genres?.[0] || ''}`)
  setTextEl('#pane-summary', stripHtml(item.summary || '(sin resumen)'))
  const open = $('#pane-open')
  if (open) {
    if (item.link) {
      open.href = item.link
      open.hidden = false
    } else {
      open.hidden = true // sin link real, no ofrecer botón que abre '#'
    }
  }
  pane.classList.add('open')
  pane.setAttribute('aria-hidden', 'false')
  if (scrim) scrim.classList.add('show')
  document.getElementById('cmd-line')?.classList.add('dimmed')
  $('#pane-close')?.focus({ preventScroll: true })
}

let paneTrigger = null

function closePane() {
  const pane = $('#news-pane')
  const scrim = $('#pane-scrim')
  if (pane) {
    pane.classList.remove('open')
    pane.setAttribute('aria-hidden', 'true')
  }
  if (scrim) scrim.classList.remove('show')
  document.getElementById('cmd-line')?.classList.remove('dimmed')
  paneTrigger?.focus({ preventScroll: true })
  paneTrigger = null
}

export function initPaneControls() {
  const close = $('#pane-close')
  const scrim = $('#pane-scrim')
  const open = $('#pane-open')
  if (close) close.addEventListener('click', closePane)
  if (scrim) scrim.addEventListener('click', closePane)
  if (open) open.addEventListener('click', () => { /* deja que abra en otra pestaña */ })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePane()
  })
}

function setTextEl(sel, text) {
  const el = document.querySelector(sel)
  if (el) el.textContent = text
}

function stripHtml(s) {
  // Sin innerHTML con contenido remoto (riesgo XSS): remover tags con regex + decodificar entidades
  return decodeEntities(
    String(s)
      .replace(/<!\[CDATA\[|\]\]>/g, '') // artefactos CDATA de feeds (DJ Mag/WeRaveYou)
      .replace(/<[^>]*>/g, '')
  ).trim()
}

function fmtDate(d) {
  if (!d) return '--:--'
  const ts = Date.parse(d)
  if (isNaN(ts)) return String(d).slice(0, 5)
  const dt = new Date(ts)
  const now = new Date()
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  if (dt.toDateString() === now.toDateString()) return hh + ':' + mm
  return (dt.getMonth() + 1) + '/' + dt.getDate()
}

/** Frescura relativa: NUEVO < 6h, HACE < 24h, else '' */
function freshness(d) {
  if (!d) return ''
  const ts = Date.parse(d)
  if (isNaN(ts)) return ''
  const hours = (Date.now() - ts) / 3600000
  if (hours < 6) return { label: 'NUEVO', cls: 'fresh-new' }
  if (hours < 24) return { label: 'HACE ' + Math.floor(hours) + 'h', cls: 'fresh-warm' }
  return ''
}

function fmtFullDate(d) {
  if (!d) return ''
  const ts = Date.parse(d)
  if (isNaN(ts)) return ''
  const dt = new Date(ts)
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}
function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
