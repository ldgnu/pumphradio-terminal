/**
 * audio.js — Player global persistente.
 *
 * Singleton a nivel de módulo: el <audio> se crea una vez y NUNCA se destruye
 * al cambiar de vista o de estación (se reusa). Esto garantiza que el audio
 * no se corte al navegar por la interfaz.
 *
 * Metadata:
 *  - "zeno-sse": EventSource a api.zeno.fm/mounts/metadata/subscribe/<id>
 *  - "icy":      parseo de headers ICY (cuando el stream lo permite)
 *  - "none":     sin metadata
 *
 * Reconexión con backoff exponencial.
 */
import { setPlaying, setLoading, setNow, getState, setVolume as storeSetVolume } from '../store.js'
import { parseStreamTitle } from './metadata.js'

class AudioEngine {
  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'none'
    this.station = null
    this.eventSource = null
    this.reconnectTimer = null
    this.reconnectAttempts = 0
    this.maxReconnect = 5
    this.baseDelay = 3000
    this.bindEvents()
  }

  bindEvents() {
    this.audio.onplay = () => setPlaying(true)
    this.audio.onpause = () => setPlaying(false)
    this.audio.onwaiting = () => setLoading(true)
    this.audio.onplaying = () => setLoading(false)
    this.audio.onerror = () => {
      setLoading(false)
      this.scheduleReconnect()
    }
  }

  loadStation(station) {
    if (!station?.streamUrl) return
    if (this.eventSource) { this.eventSource.close(); this.eventSource = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.reconnectAttempts = 0
    this.station = station

    this.audio.src = station.streamUrl
    this.audio.volume = getState().volume / 100
    setLoading(true)
    this.audio.load()
    this.audio.play().catch(() => setLoading(false))

    this.connectMetadata(station)
  }

  connectMetadata(station) {
    if (station.metaType === 'zeno-sse' && station.metadataUrl) {
      try {
        this.eventSource = new EventSource(station.metadataUrl)
        this.eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            if (data.streamTitle) this.handleTitle(data.streamTitle)
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    } else if (station.metaType === 'none') {
      // sin metadata — mostrar el nombre de la estación
      setNow({ artist: station.name, track: '', streamTitle: '', source: 'none' })
    }
  }

  handleTitle(streamTitle) {
    if (streamTitle === this.lastTitle) return
    this.lastTitle = streamTitle
    const meta = parseStreamTitle(streamTitle, this.station?.name)
    setNow(meta)
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnect) return
    this.reconnectAttempts++
    const delay = this.baseDelay * Math.pow(1.5, this.reconnectAttempts - 1)
    this.reconnectTimer = setTimeout(() => {
      if (!this.station?.streamUrl) return
      setLoading(true)
      this.audio.src = this.station.streamUrl
      this.audio.load()
      this.audio.play().catch(() => setLoading(false))
    }, delay)
  }

  play() { if (this.audio.src) this.audio.play().catch(() => {}) }
  pause() { this.audio.pause() }
  toggle() { this.audio.paused ? this.play() : this.pause() }

  setVolume(v) {
    const vol = Math.max(0, Math.min(100, v))
    this.audio.volume = vol / 100
    storeSetVolume(vol)
    localStorage.setItem('pumphradio_volume', String(vol))
  }

  initVolume() {
    const saved = parseInt(localStorage.getItem('pumphradio_volume') || '80', 10)
    this.setVolume(saved)
  }
}

// Singleton global — nunca se recrea.
export const audio = new AudioEngine()
