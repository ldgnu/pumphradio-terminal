/**
 * main.js — Bootstrap de PumphRadio.
 * Boot sequence → init shell + audio → atajos de teclado.
 */
import './css/tokens.css'
import './css/shell.css'
import './css/fx.css'
import { STATIONS, getState, setStation, on, setPreviousVolume } from './store.js'
import { audio } from './engine/audio.js'
import { initShell } from './ui/shell.js'
import { initBoot } from './ui/boot.js'
import { initCommand, openCommand } from './ui/command.js'
import { initNews, initPaneControls } from './news/engine.js'
import { Visualizer } from './visualizer/index.js'
import { getState as gs } from './store.js'
import { initSession, toggleFavorite, getStats, fmtDuration, isFavorite } from './session.js'
import { initOverlay, isOverlayOpen, closeOverlay } from './ui/overlay.js'
import { openHelp } from './ui/help.js'
import { openHistory, openFavorites, currentTrackLine } from './ui/views.js'
import { initAmbient, initAmbientControls, toggleAmbient, closeAmbient, openAmbient, isAmbient } from './ui/ambient.js'
import { initTheme, cycleTheme, setTheme, currentTheme } from './themes.js'

let viz = null
let commandOpen = false

function init() {
  audio.initVolume()
  initShell()
  initCommand()
  initNews()
  initPaneControls()
  initPlayerBar()
  initThemeSwitcher()
  initVisualizer()
  initIosUnlock()
  initSession()
  initOverlay()
  initAmbient()
  initAmbientControls()
  initFavButton()
  const helpBtn = document.getElementById('btn-help')
  if (helpBtn) helpBtn.addEventListener('click', () => openHelp())

  // Cargar estación inicial (la primera habilitada)
  const first = STATIONS.find(s => s.enabled)
  if (first) {
    setStation(first)
    audio.loadStation(first)
  }

  bindKeyboard()

  document.getElementById('app').classList.add('visible')
  // la app pasa de display:none a flex → re-dimensionar el canvas del visualizador
  setTimeout(() => { if (viz) viz.onResize() }, 60)
  setTimeout(() => { if (viz) viz.onResize() }, 400)
}

function initPlayerBar() {
  const $ = (id) => document.getElementById(id)
  $('btn-play').addEventListener('click', () => audio.toggle())
  $('btn-prev').addEventListener('click', () => prevStation())
  $('btn-next').addEventListener('click', () => nextStation())
  $('btn-vol-down').addEventListener('click', () => audio.setVolume(gs().volume - 5))
  $('btn-vol-up').addEventListener('click', () => audio.setVolume(gs().volume + 5))
  $('btn-mute').addEventListener('click', () => toggleMute())
  $('btn-viz-mode').addEventListener('click', () => { if (viz) viz.nextMode() })
}

// Mute/unmute recordando el volumen previo (no salta a un valor fijo).
function toggleMute() {
  const currentVol = gs().volume
  if (currentVol > 0) {
    setPreviousVolume(currentVol)
    audio.setVolume(0)
  } else {
    const restoreVol = gs().previousVolume > 0 ? gs().previousVolume : 80
    audio.setVolume(restoreVol)
  }
}

function initVisualizer() {
  const canvas = document.getElementById('viz-canvas')
  if (!canvas) return
  viz = new Visualizer(canvas, document.getElementById('viz-label'))
  viz.loop()
}

function initFavButton() {
  const b = document.getElementById('btn-fav')
  if (!b) return
  const update = () => {
    const st = getState()
    const key = { artist: st.now.artist, track: st.now.track || st.now.display }
    const on = !!(st.now.artist || st.now.track) && isFavorite(key)
    b.classList.toggle('on', on)
    b.title = on ? 'Quitar favorito (F)' : 'Guardar favorito (F)'
  }
  b.addEventListener('click', () => {
    const st = getState()
    if (st.now.artist || st.now.track) {
      toggleFavorite({ artist: st.now.artist, track: st.now.track, display: st.now.display })
      update()
      const l = document.getElementById('cmd-log')
      if (l) l.textContent = isFavorite({ artist: st.now.artist, track: st.now.track }) ? '♥ favorited' : '♥ removed'
    }
  })
  // actualizar estado del botón cuando cambia el track
  on('now', update)
  on('playing', update)
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    // si el comando está abierto, no interceptar
    const cmdInput = document.getElementById('cmd-input')
    if (document.activeElement === cmdInput) return

    const key = e.key.toLowerCase()
    // Escape: cerrar overlays/ambient antes que nada
    if (e.key === 'Escape') {
      if (isAmbient()) { closeAmbient(); e.preventDefault(); return }
      if (isOverlayOpen()) { closeOverlay(); e.preventDefault(); return }
      return
    }

    switch (key) {
      case '/':
        e.preventDefault()
        openCommand()
        break
      case '?':
        e.preventDefault()
        openHelp()
        break
      case ' ':
        e.preventDefault()
        audio.toggle()
        break
      case '1': case '2': case '3': case '4': {
        const st = STATIONS.find(s => s.enabled && s.num === parseInt(key, 10))
        if (st) { setStation(st); audio.loadStation(st) }
        break
      }
      case 'n':
        nextStation()
        break
      case 'v':
        if (viz) { viz.nextMode(); logMode() }
        break
      case 'p':
        audio.pause()
        break
      case 'h':
        openHistory()
        break
      case 'f': {
        const st = gs()
        if (st.now.artist || st.now.track) {
          toggleFavorite({ artist: st.now.artist, track: st.now.track, display: st.now.display })
          document.getElementById('btn-fav')?.classList.toggle('on', isFavorite({ artist: st.now.artist, track: st.now.track }))
        }
        break
      }
      case 'a':
        toggleAmbient()
        if (viz) setTimeout(() => viz.onResize(), 80)
        break
      case 't':
        cycleTheme()
        break
      case 'arrowup':
        e.preventDefault()
        audio.setVolume(getState().volume + 5)
        break
      case 'arrowdown':
        e.preventDefault()
        audio.setVolume(getState().volume - 5)
        break
      case 'm':
        toggleMute()
        break
    }
  })

  // Clic en filas de estación
  document.getElementById('stations-list').addEventListener('click', (e) => {
    const row = e.target.closest('.station-row')
    if (!row || !row.classList.contains('enabled')) return
    const st = STATIONS.find(s => s.id === row.dataset.station)
    if (st) { setStation(st); audio.loadStation(st) }
  })
}

function nextStation() {
  const enabled = STATIONS.filter(s => s.enabled)
  if (!enabled.length) return
  const cur = gs().station
  const idx = enabled.findIndex(s => s.id === cur?.id)
  const next = enabled[(idx + 1) % enabled.length]
  setStation(next)
  audio.loadStation(next)
}

function prevStation() {
  const enabled = STATIONS.filter(s => s.enabled)
  if (!enabled.length) return
  const cur = gs().station
  const idx = enabled.findIndex(s => s.id === cur?.id)
  const prev = enabled[(idx - 1 + enabled.length) % enabled.length]
  setStation(prev)
  audio.loadStation(prev)
}

function logMode() {
  if (viz) {
    const l = document.getElementById('cmd-log')
    if (l) { l.textContent = '> visualizer: ' + viz.mode.toUpperCase() }
  }
}

// iOS Safari: el AudioContext arranca suspended y el primer play() del boot
// (sin gesto) es bloqueado. Un "unlock" resume el contexto en el primer
// toque/click — requisito para que el visualizador reciba audio real en iPhone.
function initIosUnlock() {
  function unlock() {
    const br = audio.bridge
    if (br && br.ctx && br.ctx.state === 'suspended') br.ctx.resume().catch(() => {})
    document.removeEventListener('touchend', unlock)
    document.removeEventListener('click', unlock)
  }
  document.addEventListener('touchend', unlock)
  document.addEventListener('click', unlock)
}

function initThemeSwitcher() {
  // Aplica el theme guardado al arrancar (persistencia: se recuerda al reabrir)
  initTheme()
  const btn = document.getElementById('btn-theme')
  if (!btn) return
  // un solo botón: tocar cicla los themes y cambia los colores
  btn.addEventListener('click', () => {
    const id = cycleTheme()
    const l = document.getElementById('cmd-log')
    if (l) l.textContent = '> theme: ' + id
  })
}

// Arranque
initBoot(() => {})
init()
