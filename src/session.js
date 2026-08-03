/**
 * session.js — Estado de sesión persistente.
 *  - history: últimos N tracks reproducidos (localStorage, dedupe de tracks repetidos)
 *  - favorites: ♥ tracks guardados (localStorage)
 *  - uptime: tiempo total de escucha (sesión + acumulado persistido)
 *  - stats: tracks escuchados, máx de tracks por sesión
 *
 * Todo local — cero backend. Datos reales del stream (artist/track), nunca inventados.
 */
import { on, getState } from './store.js'

const LS_HIST = 'pumphradio_history'
const LS_FAV = 'pumphradio_favorites'
const LS_TIME = 'pumphradio_listen_seconds'
const LS_COUNT = 'pumphradio_track_count'

const MAX_HISTORY = 30

let history = []
let favorites = []
let sessionSeconds = 0
let totalSeconds = 0
let totalTracks = 0
let sessionTracks = 0
let startedAt = null

function load() {
  try { history = JSON.parse(localStorage.getItem(LS_HIST)) || [] } catch { history = [] }
  try { favorites = JSON.parse(localStorage.getItem(LS_FAV)) || [] } catch { favorites = [] }
  totalSeconds = parseInt(localStorage.getItem(LS_TIME) || '0', 10) || 0
  totalTracks = parseInt(localStorage.getItem(LS_COUNT) || '0', 10) || 0
}
function persistHistory() {
  try { localStorage.setItem(LS_HIST, JSON.stringify(history.slice(0, MAX_HISTORY))) } catch {}
}
function persistFavs() {
  try { localStorage.setItem(LS_FAV, JSON.stringify(favorites)) } catch {}
}
function persistTime() {
  try { localStorage.setItem(LS_TIME, String(totalSeconds)) } catch {}
  try { localStorage.setItem(LS_COUNT, String(totalTracks)) } catch {}
}

function key(meta) {
  return (meta.artist + '|' + meta.track).toLowerCase().trim()
}

/** Llamado cuando cambia el track (desde store). Registra en history y contadores. */
export function initSession() {
  load()
  startedAt = Date.now()
  on('now', (meta) => {
    if (!meta.track) return
    const k = key(meta)
    if (!k) return
    // historial (sin duplicados consecutivos)
    const last = history[0]
    if (!last || key(last) !== k) {
      history.unshift({
        artist: meta.artist || '',
        track: meta.track,
        display: meta.display || meta.track,
        station: meta.stationName || getState().station?.name || '',
        ts: Date.now(),
      })
      persistHistory()
      totalTracks++
      sessionTracks++
      persistTime()
    }
  })

  // uptime: cuenta solo mientras suena
  on('playing', (playing) => {
    if (playing) { startedAt = Date.now(); return }
    if (startedAt) { totalSeconds += Math.floor((Date.now() - startedAt) / 1000); startedAt = null }
  })
  // cada 5s suma el delta de la sesión activa
  setInterval(() => {
    if (getState().playing) {
      const now = Date.now()
      if (startedAt) {
        sessionSeconds += Math.floor((now - startedAt) / 1000)
        totalSeconds += Math.floor((now - startedAt) / 1000)
        startedAt = now
        persistTime()
      }
    }
  }, 5000)
}

export function getHistory(n = 10) {
  return history.slice(0, n)
}

export function isFavorite(meta) {
  return favorites.some(f => key(f) === key(meta))
}
export function getFavorites() {
  return favorites
}
export function toggleFavorite(meta) {
  const k = key(meta)
  const i = favorites.findIndex(f => key(f) === k)
  if (i >= 0) { favorites.splice(i, 1) } else { favorites.unshift({ artist: meta.artist, track: meta.track, display: meta.display || meta.track, ts: Date.now() }) }
  persistFavs()
  return isFavorite(meta)
}

export function getUptime() {
  let total = totalSeconds
  if (getState().playing && startedAt) total += Math.floor((Date.now() - startedAt) / 1000)
  return total
}
export function getSessionSeconds() { return sessionSeconds }
export function getStats() {
  return { totalSeconds: getUptime(), sessionSeconds, totalTracks, sessionTracks, history: history.length, favorites: favorites.length }
}

export function fmtDuration(sec) {
  sec = Math.floor(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}
