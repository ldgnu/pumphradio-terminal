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

let commandOpen = false

function init() {
  audio.initVolume()
  initShell()
  initCommand()

  // Cargar estación inicial (la primera habilitada)
  const first = STATIONS.find(s => s.enabled)
  if (first) {
    setStation(first)
    audio.loadStation(first)
  }

  bindKeyboard()

  document.getElementById('app').classList.add('visible')
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
  const cur = getState().station
  const idx = enabled.findIndex(s => s.id === cur?.id)
  const next = enabled[(idx + 1) % enabled.length]
  setStation(next)
  audio.loadStation(next)
}

// Arranque
initBoot(() => {})
init()
