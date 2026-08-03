/**
 * news/engine.js — Noticias del lado cliente.
 * Carga public/news.json (generado en build-time por scripts/fetch-news.mjs)
 * del mismo origen (sin CORS), filtra por los géneros de la estación actual
 * y las renderiza en el shell.
 */
import { getState, on } from '../store.js'

const NEWS_URL = import.meta.env.BASE_URL + 'news.json'
let allItems = []
let loaded = false

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
}

function itemsForStation(station) {
  if (!station || !allItems.length) return allItems
  const genres = station.subgenres || station.genres || []
  const key = genres.join('|')
  // coincidencia: el item pertenece a al menos uno de los géneros/subgéneros de la estación
  const matched = allItems.filter((it) =>
    (it.genres || []).some((g) => key.includes(g) || station.id.includes(g))
  )
  return matched.length ? matched : allItems
}

function cleanTitle(t) {
  // prettify títulos de feeds de releases (underscores → espacios, quitar catálogo)
  let s = t.replace(/_/g, ' ')
  s = s.replace(/\s*[-–—]\s*[A-Z]{2,6}-?\d{2,4}.*$/i, '') // quitar "-(LABELxxx)-WEB-2026"
  return s.trim()
}

export function renderForStation(station) {
  const wrap = $('#news-list')
  if (!wrap) return
  const items = itemsForStation(station).slice(0, 8)
  if (!items.length) {
    wrap.innerHTML = '<div class="news-empty dim">— no signal —</div>'
    return
  }
  wrap.innerHTML = items.map((it, i) => `
    <a class="news-item" href="${escapeAttr(it.link)}" target="_blank" rel="noopener noreferrer">
      <span class="ni-time">${fmtDate(it.date)}</span>
      <span class="ni-title">${escapeHtml(cleanTitle(it.title))}</span>
      <span class="ni-src dim">${escapeHtml(it.source)}</span>
    </a>
  `).join('')
  // stagger fade-in
  wrap.querySelectorAll('.news-item').forEach((el, i) => {
    el.style.animationDelay = (i * 0.03) + 's'
  })
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

function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}
function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
