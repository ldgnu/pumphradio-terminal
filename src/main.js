/**
 * main.js — Bootstrap de PumphRadio.
 * Boot sequence → init shell + audio → atajos de teclado.
 */
import './css/tokens.css'
import './css/shell.css'
import './css/fx.css'
import { STATIONS, getState, setStation } from './store.js'
import { audio } from './engine/audio.js'
import { initShell } from './ui/shell.js'
import { initBoot } from './ui/boot.js'
import { initCommand, openCommand } from './ui/command.js'
import { initNews, initPaneControls } from './news/engine.js'
import { Visualizer } from './visualizer/index.js'
import { getState as gs } from './store.js'

let viz = null
let commandOpen = false

function init() {
  audio.initVolume()
  initShell()
  initCommand()
  initNews()
  initPaneControls()
  initPlayerBar()
  initVisualizer()

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
  $('btn-mute').addEventListener('click', () => audio.setVolume(gs().volume > 0 ? 0 : 80))
  $('btn-viz-mode').addEventListener('click', () => { if (viz) viz.nextMode() })
}

function initVisualizer() {
  const canvas = document.getElementById('viz-canvas')
  if (!canvas) return
  viz = new Visualizer(canvas, document.getElementById('viz-label'))
  viz.loop()
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    // si el comando está abierto, no interceptar
    const cmdInput = document.getElementById('cmd-input')
    if (document.activeElement === cmdInput) return

    const key = e.key.toLowerCase()

    switch (key) {
      case '/':
        e.preventDefault()
        openCommand()
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
      case 'arrowup':
        e.preventDefault()
        audio.setVolume(getState().volume + 5)
        break
      case 'arrowdown':
        e.preventDefault()
        audio.setVolume(getState().volume - 5)
        break
      case 'm':
        audio.setVolume(getState().volume > 0 ? 0 : 80)
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

// Arranque
initBoot(() => {})
init()
