/**
 * main.js — Bootstrap de PumphRadio.
 * Boot sequence → init shell + audio → atajos de teclado.
 */
import './css/tokens.css'
import './css/shell.css'
import './css/fx.css'
import { STATIONS, getState, setStation, on, setPreviousVolume } from './store.js'
import { audio } from './engine/audio.js'
import { initShell, syncActiveStationIntoView } from './ui/shell.js'
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
  initStreamState()
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

  // Restaurar la estación elegida en la visita anterior; si no hay, la
  // primera habilitada. Warm-up: bufferiza el stream SIN play (solo buffer).
  const savedId = (() => { try { return localStorage.getItem('pumphradio_station') } catch { return null } })()
  const first = (savedId && STATIONS.find(s => s.enabled && s.id === savedId)) || STATIONS.find(s => s.enabled)
  if (first) {
    setStation(first)
    audio.warm(first)
    // AUTOSTART: arranca muteado con la estación guardada (o deep-techno,
    // la primera habilitada) y suena al primer gesto — cero demora.
    audio.tryAutostart(first)
    const unmute = () => { audio.unmuteAutostart() }
    document.addEventListener('pointerdown', unmute, { passive: true })
    document.addEventListener('keydown', unmute, { passive: true })
    document.addEventListener('touchend', unmute, { passive: true })
  }

  bindKeyboard()

  // PRECARGA EN EL BOOT: calentar los streams mientras el usuario todavía no
  // tocó play. Al arrancar la app no hay ninguna conexión a Zeno, así que el
  // primer play tardaba 3-6s en sonar. Con los preloaders listos (elementos
  // descartables, nunca el activo) el buffer ya está armado.
  // Prioridad: la estación guardada primero; las otras después y sin apuro.
  // En conexiones con ahorro de datos precargamos SOLO la activa.
  const saveData = (() => {
    try { return !!(navigator.connection && (navigator.connection.saveData ||
      /^(slow-2g|2g|3g)$/.test(navigator.connection.effectiveType || ''))) } catch { return false }
  })()

  const warmOthers = () => {
    if (saveData) return
    STATIONS.filter(s => s.enabled && s.id !== first?.id)
      .forEach((s, i) => setTimeout(() => audio.prefetch(s), 800 + i * 700))
  }
  if ('requestIdleCallback' in window) requestIdleCallback(warmOthers, { timeout: 2500 })
  else setTimeout(warmOthers, 1200)

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
  // Hook de QA (headless): estado del visualizer y del motor de audio.
  window.__viz = { get: () => viz }
  window.__audio = audio
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

// Indicador visible del estado del stream: CONECTANDO → BUFFERING → EN VIVO.
// El objetivo es que nadie se quede esperando una radio muda sin saber si está
// cargando o está rota. Si tras 12s no hay audio, pasa a "SIN SEÑAL" en vez de
// quedarse en "cargando" para siempre.
function initStreamState() {
  const el = document.getElementById('pb-stream-state')
  if (!el) return
  const text = el.querySelector('.pb-ss-text')
  let slowTimer = null

  const paint = (state, label) => {
    el.hidden = state === 'idle'
    el.classList.remove('is-connecting', 'is-buffering', 'is-live', 'is-error')
    if (state !== 'idle') el.classList.add('is-' + state)
    if (text) text.textContent = label
  }

  const update = () => {
    const st = getState()
    if (st.loading) {
      // Ya sonó alguna vez esta sesión y ahora bufferea → está reconectando.
      paint('buffering', audio.audio && audio.audio.currentTime > 0 ? 'BUFFERING' : 'CONECTANDO')
    } else if (st.playing) {
      paint('live', 'EN VIVO')
    } else {
      paint('idle')
    }
  }

  on('loading', () => { update(); armSlowWatchdog() })
  on('playing', update)
  on('station', () => { paint('connecting', 'CONECTANDO'); armSlowWatchdog() })

  // Watchdog: si quedó "cargando" demasiado, avisar en vez de mentir.
  function armSlowWatchdog() {
    if (slowTimer) clearTimeout(slowTimer)
    slowTimer = setTimeout(() => {
      const st = getState()
      if (st.loading && !st.playing) paint('error', 'SIN SEÑAL · reintentando')
    }, 12000)
  }

  update()
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    // si otro handler ya procesó la tecla (ej. Enter/Space sobre una fila de
    // estación enfocada), no re-interpretarla a ciegas con atajos globales
    if (e.defaultPrevented) return
    // si el comando está abierto, no interceptar
    const cmdInput = document.getElementById('cmd-input')
    if (document.activeElement === cmdInput) return

    // no robar atajos del navegador/OS: Ctrl+F (find), Cmd+T (tab), Alt+Tab, etc.
    if (e.metaKey || e.ctrlKey || e.altKey) return

    const key = e.key.toLowerCase()
    // Escape: cerrar overlays/ambient antes que nada
    if (e.key === 'Escape') {
      if (isAmbient()) { closeAmbient(); e.preventDefault(); return }
      if (isOverlayOpen()) { closeOverlay(); e.preventDefault(); return }
      return
    }

    // Con un overlay abierto (ayuda/historial/favoritos), no interceptar el
    // resto de los atajos: cambiar tema/estación "a ciegas" detrás de la
    // ventana confunde. Escape ya la cerró arriba.
    if (isOverlayOpen()) return

    // Pane de noticias abierto: es un modal de lectura → no interceptar.
    // Evita mutear/cambiar tema/estación "a ciegas" detrás del artículo, y
    // deja que ↑/↓ scrolleen el contenido con teclado (caso contrario,
    // el preventDefault del volumen se los roba).
    const pane = document.getElementById('news-pane')
    if (pane?.classList.contains('open')) return

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
        // A11y: si el foco está en un botón, Space debe activarlo nativamente.
        // El preventDefault global se lo robaba y encima toggleaba la radio.
        if (document.activeElement instanceof HTMLButtonElement) break
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
  // Precarga en pointerdown: gana ~100-300ms (el buffer arranca antes del click)
  document.getElementById('stations-list').addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.station-row')
    if (!row || !row.classList.contains('enabled')) return
    const st = STATIONS.find(s => s.id === row.dataset.station)
    if (st) audio.prefetch(st)
  })
  // Las filas de estación son focuseables (role=button, tabindex=0): activarlas
  // con Enter o Space. Enter/Space marcan e.defaultPrevented… evitando que el
  // atajo global Space (play/pausa) dispare encima de la selección.
  document.getElementById('stations-list').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const row = e.target.closest('.station-row')
    if (!row || !row.classList.contains('enabled')) return
    e.preventDefault()
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
// (sin gesto) es bloqueado. Un "unlock" resume el contexto en CUALQUIER
// toque/click — permanente (no se desregistra) porque iOS puede re-suspender
// el contexto tras una interrupción (Siri, llamada, screen lock).
function initIosUnlock() {
  function unlock() {
    const br = audio.bridge
    if (br && br.ctx) br.ensureRunning()
  }
  document.addEventListener('touchend', unlock, { passive: true })
  document.addEventListener('click', unlock, { passive: true })
  document.addEventListener('touchstart', unlock, { passive: true })
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
// El render inicial de la lista de estaciones corre con la app en display:none
// (layout 0), así que su scrollIntoView no midió nada. Al terminar el boot la
// app ya es visible: re-sincronizar la fila activa, o queda bajo la barra fija.
initBoot(() => { syncActiveStationIntoView() })
init()
