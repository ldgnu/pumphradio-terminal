/**
 * shell.js — Render del shell terminal.
 * Actualiza solo los nodos que cambian (no re-renderiza todo) para rendimiento.
 */
import { STATIONS, getState, on } from '../store.js'

function $(sel) { return document.querySelector(sel) }

export function initShell() {
  renderStationList()
  renderHeader()

  // Suscripciones
  on('now', renderNow)
  on('station', () => { renderHeader(); renderStationList(); renderNow() })
  on('playing', () => { renderStatusBar(); renderNow() })
  on('loading', renderStatusBar)
  on('volume', renderStatusBar)
  on('elapsed', () => { const el = $('#elapsed'); if (el) el.textContent = fmtElapsed(getState().elapsed) })
  on('booted', () => { startClock(); renderStatusBar() })

  startClock()
  renderNow()
}

function renderHeader() {
  const s = getState().station
  const node = $('#node')
  if (node) node.textContent = s?.node || '---'
}

export function renderNow() {
  const st = getState()
  const track = st.now.display || st.now.track || '— NO SIGNAL —'
  const artist = st.now.artist || st.now.source === 'none' ? st.now.artist || st.station?.name : st.now.artist
  const station = st.station

  setText('#np-track', track)
  setText('#np-artist', artist || '—')
  setText('#np-station', station?.name || '—')
  setText('#np-node', station?.node || '—')
  setText('#np-genre', (station?.genres?.[0] || '—'))
  setText('#np-freq', station?.freq ? station.freq + ' FM' : '—')
  // Campo de release/label: en PHASE 1 solo metadata de stream (se enriquece en PHASE 2)
  setText('#np-release', st.now.release || '—')
  setText('#np-label', st.now.label || '—')
  setText('#np-year', st.now.year || '—')

  const el = $('#elapsed')
  if (el) el.textContent = fmtElapsed(st.elapsed)
}

function renderStationList() {
  const wrap = $('#stations-list')
  if (!wrap) return
  const cur = getState().station?.id
  wrap.innerHTML = STATIONS.map(s => `
    <div class="station-row ${s.enabled ? 'enabled' : 'disabled'} ${s.id === cur ? 'active' : ''}"
         data-station="${s.id}">
      <span class="st-num">0${s.num}</span>
      <span class="st-name">${s.name}</span>
      <span class="st-tag">${s.enabled ? s.genres.slice(0, 2).join(' · ') : 'no signal'}</span>
      ${s.enabled ? '<span class="st-live">●</span>' : ''}
    </div>
  `).join('')
}

function renderStatusBar() {
  const st = getState()
  const play = $('#status-play')
  const buf = $('#status-buffer')
  const vol = $('#status-vol')
  if (play) play.textContent = st.loading ? 'BUFFERING' : (st.playing ? 'PLAYING' : 'PAUSED')
  if (buf) buf.textContent = st.loading ? 'BUFFER ' + (70 + Math.random() * 30 | 0) + '%' : 'BUFFER 100%'
  if (vol) vol.textContent = 'VOL ' + st.volume + '%'
}

export function setText(id, text) {
  const el = $(id)
  if (el && el.textContent !== text) el.textContent = text
}

export function fmtElapsed(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

function startClock() {
  const clock = $('#clock')
  if (!clock) return
  const tick = () => {
    const d = new Date()
    clock.textContent = d.toISOString().slice(11, 19) + ' UTC'
  }
  tick()
  setInterval(tick, 1000)
}
