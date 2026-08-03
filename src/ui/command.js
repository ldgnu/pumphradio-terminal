/**
 * command.js — Command palette. Se abre con "/".
 * pumphradio > <comando>
 *
 * Comandos PHASE 1 (funcionales):
 *   play | pause | next | station <id|num> | stations
 *   volume <0-100> | help | quit
 * (artist/track/news/discover/visualizer se expanden en fases posteriores)
 */
import { STATIONS, getState, setStation, setVisualizer, setView } from '../store.js'
import { audio } from '../engine/audio.js'
import { renderForStation } from '../news/engine.js'
import { getHistory, getFavorites, toggleFavorite, getStats, fmtDuration, isFavorite } from '../session.js'
import { openHistory, openFavorites } from './views.js'
import { toggleAmbient, isAmbient } from './ambient.js'
import { openHelp } from './help.js'
import { setTheme, currentTheme, THEMES } from '../themes.js'

let input = null
let open = false

export function initCommand() {
  const line = document.getElementById('cmd-line')
  input = document.getElementById('cmd-input')
  if (!line || !input) return

  // Click en la línea de comando la abre
  line.addEventListener('click', () => { open = true; line.classList.add('open'); input.focus() })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim()
      run(val)
      input.value = ''
      close()
    } else if (e.key === 'Escape') {
      input.value = ''
      close()
    }
  })
}

export function openCommand() {
  if (!input) return
  open = true
  document.getElementById('cmd-line').classList.add('open')
  input.focus()
}

function close() {
  open = false
  document.getElementById('cmd-line').classList.remove('open')
  input.blur()
}

function log(txt) {
  const area = document.getElementById('cmd-log')
  if (area) {
    area.textContent = txt
    setTimeout(() => { if (area.textContent === txt) area.textContent = '' }, 4000)
  }
}

function run(cmd) {
  const [c, ...args] = cmd.split(/\s+/)
  const a = args.join(' ').toLowerCase()

  switch (c) {
    case 'play': audio.play(); log('> play'); break
    case 'pause': audio.pause(); log('> pause'); break
    case 'next': nextStation(); break
    case 'station': {
      const st = resolveStation(a)
      if (st) { audio.loadStation(st); setStation(st); log('> station ' + st.name) }
      else log('> station not found: ' + a)
      break
    }
    case 'stations':
      log('> ' + STATIONS.filter(s => s.enabled).map(s => `0${s.num} ${s.name}`).join(' | '))
      break
    case 'news':
      renderForStation(getState().station)
      log('> signal intelligence · ' + (getState().station?.name || 'all'))
      break
    case 'history':
    case 'log':
      openHistory()
      break
    case 'fav':
    case 'favorites':
    case '♥':
      openFavorites()
      break
    case 'ambient':
    case 'am':
      toggleAmbient()
      log(isAmbient() ? '> ambient ON' : '> ambient OFF')
      break
    case 'uptime':
      log('> session uptime: ' + fmtDuration(getStats().sessionSeconds) + ' · total: ' + fmtDuration(getStats().totalSeconds))
      break
    case 'stats':
      log('> stats · session ' + fmtDuration(getStats().sessionSeconds) + ' · total ' + fmtDuration(getStats().totalSeconds) + ' · tracks ' + getStats().totalTracks + ' · favs ' + getStats().favorites)
      break
    case 'theme': {
      const names = THEMES.map(t => t.id)
      if (a && names.includes(a)) {
        setTheme(a)
        log('> theme: ' + a)
      } else {
        log('> theme (' + currentTheme() + ') · ' + names.join(' | '))
      }
      break
    }
    case 'clear':
    case 'cls': {
      const area = document.getElementById('cmd-log')
      if (area) area.textContent = ''
      break
    }
    case 'whoami':
      log('> root@pumphradio:~$ underground listener · node ' + (getState().station?.node || '---'))
      break
    case 'time':
      log('> ' + new Date().toISOString().slice(11, 19) + ' UTC')
      break
    case 'ls':
    case 'status':
      log('> ' + (getState().station?.name || 'no station') + ' · ' + (getState().playing ? 'PLAYING' : 'PAUSED') + ' · vol ' + getState().volume + '%')
      break
    case 'signal':
      log('> SIGNAL ' + (88 + Math.floor(Math.random() * 12)) + '% · NODE ' + (getState().station?.node || '---') + ' · BPM ' + (getState().station?.bpmHint || '?') + ' · ' + (getState().playing ? 'LOCKED' : 'IDLE'))
      break
    case 'volume': {
      const v = parseInt(a, 10)
      if (!isNaN(v)) { audio.setVolume(v); log('> volume ' + v + '%') } else log('> usage: volume <0-100>')
      break
    }
    case 'visualizer':
    case 'viz':
      setVisualizer(a || 'spectrum'); log('> visualizer ' + (a || 'spectrum')); break
    case 'view':
      setView(a || 'nowplaying'); log('> view ' + (a || 'nowplaying')); break
    case 'help':
      openHelp()
      break
    case 'quit':
      close(); break
    case '': break
    default:
      log('> unknown command: ' + c + ' (try help)')
  }
}

function resolveStation(q) {
  if (!q) return null
  return STATIONS.find(s =>
    s.id === q ||
    s.name.toLowerCase() === q ||
    String(s.num) === q
  ) || null
}

function nextStation() {
  const enabled = STATIONS.filter(s => s.enabled)
  if (!enabled.length) return
  const cur = getState().station
  const idx = enabled.findIndex(s => s.id === cur?.id)
  const next = enabled[(idx + 1) % enabled.length]
  audio.loadStation(next)
  setStation(next)
}
