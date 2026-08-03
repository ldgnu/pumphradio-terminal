/**
 * audio.js — Player global persistente con Web Audio.
 *
 * Singleton a nivel de módulo: el <audio> se crea una vez y NUNCA se destruye.
 * Para el visualizador real usa un grafo Web Audio:
 *   mediaElementSource → analyser → gain → destination
 * El stream de Zeno manda `access-control-allow-origin: *`, así que
 * crossOrigin='anonymous' permite que el AnalyserNode reciba audio real.
 * Si un stream NO manda CORS, hay fallback: se recarga sin analizador
 * (visualizer pasa a modo simulado) y el audio no se corta.
 *
 * Metadata:
 *  - "zeno-sse": EventSource a api.zeno.fm/mounts/metadata/subscribe/<id>
 *  - "none":     sin metadata
 */
import { setPlaying, setLoading, setNow, getState, setVolume as storeSetVolume } from '../store.js'
import { parseStreamTitle } from './metadata.js'
import { enrich } from './enrich.js'
import { AnalyserBridge } from '../visualizer/analyser.js'

class AudioEngine {
  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'none'
    this.audio.crossOrigin = 'anonymous' // permite analizador real (requiere CORS)
    this.station = null
    this.eventSource = null
    this.reconnectTimer = null
    this.reconnectAttempts = 0
    this.maxReconnect = 5
    this.baseDelay = 3000
    this.corsFallback = false
    this.bridge = new AnalyserBridge(this.audio)
    this.lastTitle = ''
    this.bindEvents()
  }

  bindEvents() {
    this.audio.onplay = () => { setPlaying(true); this.bridge.ensureRunning() }
    this.audio.onpause = () => setPlaying(false)
    this.audio.onwaiting = () => setLoading(true)
    this.audio.onplaying = () => setLoading(false)
    this.audio.onerror = () => {
      setLoading(false)
      // Si estábamos en modo CORS (analizador real) y falla, recargar sin él
      if (!this.corsFallback) {
        this.toFallback()
      }
      this.scheduleReconnect()
    }
  }

  // Pasa a modo sin-Web-Audio (stream sin CORS): audio sigue, visualizer simulado.
  toFallback() {
    this.corsFallback = true
    try { this.bridge.disconnect() } catch { /* ignore */ }
    try { if (this.bridge.ctx && this.bridge.ctx.state !== 'closed') this.bridge.ctx.close() } catch { /* ignore */ }
    // recrear audio sin crossOrigin
    this.audio.pause()
    const src = this.audio.src
    this.audio = new Audio()
    this.audio.preload = 'none'
    this.audio.volume = getState().volume / 100
    if (src) this.audio.src = src
    // rebind
    const that = this
    this.audio.onplay = () => setPlaying(true)
    this.audio.onpause = () => setPlaying(false)
    this.audio.onwaiting = () => setLoading(true)
    this.audio.onplaying = () => setLoading(false)
    this.audio.onerror = () => setLoading(false)
    if (src) { this.audio.load(); this.audio.play().catch(() => setLoading(false)) }
    console.warn('[audio] CORS fallback (sin analizador real)')
    that.bridge = null
  }

  loadStation(station) {
    if (!station?.streamUrl) return
    if (this.eventSource) { this.eventSource.close(); this.eventSource = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.reconnectAttempts = 0
    this.station = station

    this.audio.src = station.streamUrl
    this.applyVolume(getState().volume)
    setLoading(true)
    this.audio.load()
    this.bridge.ensureRunning()
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
      setNow({ artist: station.name, track: '', streamTitle: '', source: 'none' })
    }
  }

  handleTitle(streamTitle) {
    if (streamTitle === this.lastTitle) return
    this.lastTitle = streamTitle
    const meta = parseStreamTitle(streamTitle, this.station?.name)
    setNow(meta)
    // Enriquecer en background (no bloquea UI)
    if (meta.artist && meta.track) {
      enrich(meta.artist, meta.track).then((data) => {
        if (this.lastTitle !== streamTitle) return // otro track ganó la carrera
        setNow({ ...meta, ...data })
      }).catch(() => { /* ignore */ })
    }
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

  play() {
    if (this.bridge) this.bridge.ensureRunning()
    if (this.audio.src) this.audio.play().catch(() => {})
  }
  pause() { this.audio.pause() }
  toggle() { this.audio.paused ? this.play() : this.pause() }

  applyVolume(v) {
    const vol = Math.max(0, Math.min(100, v))
    if (this.bridge && this.bridge.gain) {
      this.bridge.gain.gain.value = vol / 100
    }
    this.audio.volume = vol / 100
  }

  setVolume(v) {
    const vol = Math.max(0, Math.min(100, v))
    this.applyVolume(vol)
    storeSetVolume(vol)
    localStorage.setItem('pumphradio_volume', String(vol))
  }

  initVolume() {
    const saved = parseInt(localStorage.getItem('pumphradio_volume') || '80', 10)
    this.setVolume(saved)
  }

  getAnalyser() {
    return this.corsFallback || !this.bridge ? null : this.bridge
  }
}

export const audio = new AudioEngine()
