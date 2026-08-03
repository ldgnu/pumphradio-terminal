/**
 * views.js — Vistas que se renderizan dentro del overlay genérico.
 *  - history: últimos tracks (getHistory)
 *  - favorites: ♥ guardados, con toggle para quitar
 */
import { getHistory, getFavorites, toggleFavorite } from '../session.js'
import { getState } from '../store.js'
import { setOverlayContent, openOverlay } from './overlay.js'

function esc(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML
}

export function openHistory() {
  const items = getHistory(14)
  let rows
  if (!items.length) {
    rows = '<div class="dim">— empty. play some tracks first —</div>'
  } else {
    rows = items.map((h, i) => `
      <div class="hist-row">
        <span class="hist-num dim">${String(items.length - i).padStart(2, '0')}</span>
        <span class="hist-artist">${esc(h.artist || '—')}</span>
        <span class="hist-track dim">${esc(h.track)}</span>
        <span class="hist-st dim">${esc(h.station || '')}</span>
      </div>`).join('')
  }
  setOverlayContent('TRACK HISTORY — LOG', `
    <div class="ov-h">LAST ${items.length} TRANSMISSIONS</div>
    ${rows}
  `)
  openOverlay()
}

export function openFavorites() {
  const items = getFavorites()
  let rows
  if (!items.length) {
    rows = '<div class="dim">— no favorites yet. press F on a track —</div>'
  } else {
    rows = items.map((f, i) => `
      <div class="hist-row fav-row">
        <span class="hist-artist">${esc(f.artist || '—')}</span>
        <span class="hist-track dim">${esc(f.track)}</span>
        <button class="fav-del" data-i="${i}">✕</button>
      </div>`).join('')
  }
  setOverlayContent('FAVORITES ♥', `
    <div class="ov-h">${items.length} SAVED TRACKS</div>
    ${rows}
  `)
  openOverlay()
  // quitar favorito por índice (sin incrustar texto en atributos)
  document.querySelectorAll('.fav-del').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      const fav = getFavorites()[parseInt(b.dataset.i, 10)]
      if (fav) toggleFavorite(fav)
      openFavorites() // re-render
    })
  })
}

/** Rendering compartido de "now" como texto plano para el log. */
export function currentTrackLine() {
  const st = getState()
  const t = st.now.display || st.now.track || '—'
  return `${st.now.artist || st.station?.name || '—'} — ${t}`
}
