/**
 * store.js — Estado central de PumphRadio.
 * Única fuente de verdad. La UI se suscribe con on(evt, fn).
 * El audio vive en un singleton separado (engine/audio.js) que nunca se
 * destruye al cambiar de vista → player persistente.
 */
import stationsJson from '../data/stations.json'

export const STATIONS = stationsJson.stations

const state = {
  station: STATIONS.find(s => s.enabled) || null,
  playing: false,
  loading: false,
  volume: 80,
  previousVolume: 80,
  now: { artist: '', track: '', streamTitle: '' },
  elapsed: 0,
  booted: false,
  view: 'nowplaying',
  visualizer: 'spectrum',
}

const listeners = new Map()
let elapsedTimer = null

export function getState() {
  return state
}

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set())
  listeners.get(evt).add(fn)
  return () => listeners.get(evt).delete(fn)
}

function emit(evt, payload) {
  if (listeners.has(evt)) for (const fn of listeners.get(evt)) fn(payload)
}

export function setStation(station) {
  state.station = station
  emit('station', station)
}

export function setNow(meta) {
  state.now = meta
  state.elapsed = 0
  emit('now', meta)
}

export function setPlaying(v) {
  state.playing = v
  emit('playing', v)
}

export function setLoading(v) {
  state.loading = v
  emit('loading', v)
}

export function setVolume(v) {
  state.volume = v
  emit('volume', v)
}

export function setPreviousVolume(v) {
  state.previousVolume = v
}

export function setView(v) {
  state.view = v
  emit('view', v)
}

export function setVisualizer(v) {
  state.visualizer = v
  emit('visualizer', v)
}

export function boot() {
  state.booted = true
  emit('booted')
  // tick del elapsed de escucha del track actual
  elapsedTimer = setInterval(() => {
    if (state.playing && state.now.track) {
      state.elapsed++
      emit('elapsed', state.elapsed)
    }
  }, 1000)
}
