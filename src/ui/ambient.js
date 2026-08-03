/**
 * ambient.js — Modo AMBIENT: now-playing a pantalla completa.
 * Se abre con "A" o `ambient`. Cover grande + visualizer + metadata.
 * Toda la vista del shell se oculta (clase .ambient en el <body>).
 */
import { getState, on } from '../store.js'
import { audio } from '../engine/audio.js'
import { openOverlay, closeOverlay } from './overlay.js'

export function initAmbient() {
  on('now', () => render())
  on('station', () => render())
  on('playing', () => {
    const p = document.getElementById('am-play')
    if (p) p.textContent = getState().playing ? '▮▮' : '▶'
  })
}

export function isAmbient() {
  return document.body.classList.contains('ambient')
}
export function openAmbient() {
  closeOverlay()
  document.body.classList.add('ambient')
  document.getElementById('app')?.classList.add('ambient')
  render()
}
export function closeAmbient() {
  document.body.classList.remove('ambient')
  document.getElementById('app')?.classList.remove('ambient')
}
export function toggleAmbient() {
  isAmbient() ? closeAmbient() : openAmbient()
}

function render() {
  const st = getState()
  const artistEl = document.getElementById('am-artist')
  const trackEl = document.getElementById('am-track')
  const stationEl = document.getElementById('am-station')
  const coverEl = document.getElementById('am-cover-img')
  const coverWrap = document.getElementById('am-cover')

  if (artistEl) artistEl.textContent = st.now.artist || '—'
  if (trackEl) trackEl.textContent = st.now.display || st.now.track || '— NO SIGNAL —'
  if (stationEl) stationEl.textContent = `${st.station?.name || '—'} · ${st.station?.freq || ''} FM`
  if (coverWrap) coverWrap.hidden = !st.now.coverUrl
  if (coverEl && st.now.coverUrl && coverEl.src !== st.now.coverUrl) coverEl.src = st.now.coverUrl
}

export function initAmbientControls() {
  const play = document.getElementById('am-play')
  const close = document.getElementById('am-close')
  const viz = document.getElementById('am-viz')
  if (play) play.addEventListener('click', () => audio.toggle())
  if (close) close.addEventListener('click', closeAmbient)
  if (viz) viz.addEventListener('click', () => {
    // reenvía al botón real para cambiar modo
    document.getElementById('btn-viz-mode')?.click()
  })
  // click en cover = toggle play
  const cover = document.getElementById('am-cover')
  if (cover) cover.addEventListener('click', () => audio.toggle())
}
