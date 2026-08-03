/**
 * shell.js — Render del shell terminal.
 * Actualiza solo los nodos que cambian (no re-renderiza todo) para rendimiento.
 */
import { STATIONS, getState, on } from '../store.js'

function $(sel) { return document.querySelector(sel) }
let lastPbTrack = undefined

export function initShell() {
  renderStationList()
  renderHeader()

  // Suscripciones
  on('now', renderNow)
  on('station', () => { renderHeader(); renderStationList(); renderNow() })
  on('playing', () => { renderStatusBar(); renderNow(); renderPlayIcon() })
  on('loading', renderStatusBar)
  on('volume', renderStatusBar)
  on('volume', renderVolumeIcon)
  on('elapsed', () => { const el = $('#elapsed'); if (el) el.textContent = fmtElapsed(getState().elapsed) })
  on('booted', () => { startClock(); renderStatusBar() })

  startClock()
  renderNow()
  renderPlayIcon()
}

function renderPlayIcon() {
  const playing = getState().playing
  const p = $('#pb-icon-play')
  const ps = $('#pb-icon-pause')
  if (p) p.classList.toggle('hidden', playing)
  if (ps) ps.classList.toggle('hidden', !playing)
  const btn = $('#btn-play')
  if (btn) btn.classList.toggle('playing', playing)
  // FX: pulse del borde izquierdo del player bar
  const bar = document.querySelector('.player-bar')
  if (bar) bar.classList.toggle('playing', playing)
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
  setText('#np-release', st.now.release || '—')
  setText('#np-label', st.now.label || '—')
  setText('#np-year', st.now.year || '—')

  // Cover (Cover Art Archive). Solo mostrar cuando llega.
  const cover = $('#np-cover')
  const coverImg = $('#np-cover-img')
  if (cover && coverImg) {
    if (st.now.coverUrl) {
      cover.hidden = false
      if (coverImg.src !== st.now.coverUrl) coverImg.src = st.now.coverUrl
    } else {
      cover.hidden = true
    }
  }

  // Bio del artista (MusicBrainz + Wikidata). Highlight del nombre en negrita, no
  // de la primera frase entera — porque la 1ra frase suele ser "X is a..."
  // y destaca la palabra equivocada.
  const bioWrap = $('#np-bio-wrap')
  const bioText = $('#np-bio-text')
  if (bioWrap && bioText) {
    if (st.now.artistBio) {
      const raw = st.now.artistBio
      const desc = st.now.artistDesc || st.now.artist
      const headText = `— ${desc ? desc.toUpperCase() : 'ARTIST'} —`
      // Si la primera frase arranca con el nombre del artista, destácalo en negrita.
      let html = escapeHtml(raw)
      const name = st.now.artist?.trim()
      if (name && html.toLowerCase().startsWith(name.toLowerCase())) {
        html = `<b>${escapeHtml(name)}</b>` + html.slice(name.length)
      }
      bioText.innerHTML = html
      const head = $('#np-bio-head')
      if (head) head.textContent = headText
      bioWrap.hidden = false
    } else {
      bioWrap.hidden = true
    }
  }

  const el = $('#elapsed')
  if (el) el.textContent = fmtElapsed(st.elapsed)

  // player bar
  const newTrack = (st.now.display || st.now.track) ? ((st.now.display || st.now.track).slice(0, 40)) : '—'
  setText('#pb-track', newTrack)
  setText('#pb-station', station?.name || '—')
  // barra inferior fija: nombre del tema actual
  const bottomTrack = (st.now.display || st.now.track) ? `${st.now.artist || ''} — ${st.now.display || st.now.track}` : '— NO SIGNAL —'
  setText('#status-track', bottomTrack)

  // FX: flash de scanline cuando cambia el track
  if (lastPbTrack !== undefined && lastPbTrack !== newTrack) {
    const flash = $('#pb-track-flash')
    if (flash) {
      flash.classList.remove('flash')
      void flash.offsetWidth // reflow para reiniciar la animación
      flash.classList.add('flash')
    }
  }
  lastPbTrack = newTrack
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
      <span class="st-tag">${s.enabled ? (s.nickname ? `${s.nickname} — ${s.tagline}` : s.tagline) : 'no signal'}</span>
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
  const vlabel = $('#vol-label')
  if (vlabel) vlabel.textContent = st.volume + '%'
}

// Muestra el icono de volumen correcto (speaker vs speaker-muted) según estado.
function renderVolumeIcon() {
  const vol = getState().volume
  const iconVolume = $('#pb-icon-volume')
  const iconMuted = $('#pb-icon-muted')
  const btn = $('#btn-mute')
  if (vol === 0) {
    if (iconVolume) iconVolume.style.display = 'none'
    if (iconMuted) iconMuted.style.display = ''
    if (btn) { btn.setAttribute('aria-label', 'Activar sonido'); btn.setAttribute('title', 'Activar sonido (M)') }
  } else {
    if (iconVolume) iconVolume.style.display = ''
    if (iconMuted) iconMuted.style.display = 'none'
    if (btn) { btn.setAttribute('aria-label', 'Silenciar'); btn.setAttribute('title', 'Silenciar (M)') }
  }
}

export function setText(id, text) {
  const el = $(id)
  if (el && el.textContent !== text) el.textContent = text
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
