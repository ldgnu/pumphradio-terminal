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
  // Crea el <audio> y lo cuelga del DOM (oculto). Antes era un Audio()
  // huérfano: querySelector('audio') devolvía null y complicaba QA/tests
  // externos y APIs de medios (MediaSession, etc.).
  static _makeAudio() {
    const el = new Audio()
    el.preload = 'none'
    try {
      if (typeof document !== 'undefined' && !el.parentNode) {
        el.setAttribute('aria-hidden', 'true')
        el.style.display = 'none'
        ;(document.body || document.documentElement).appendChild(el)
      }
    } catch { /* sin DOM (SSR/tests): igual funciona como Audio huérfano */ }
    return el
  }

  constructor() {
    this.audio = new AudioEngine._makeAudio()
    this.audio.preload = 'none'
    this.audio.crossOrigin = 'anonymous' // permite analizador real (requiere CORS)
    this.station = null
    this.eventSource = null
    this.reconnectTimer = null
    this.reconnectAttempts = 0
    this.maxReconnect = 5
    this.baseDelay = 3000
    this.corsFallback = false
    // FIX visualizador: el grafo Web Audio se construye PEREZOSO, en el primer
    // gesto del usuario (no acá). Si se construye al cargar la página, el
    // AudioContext arranca suspended; cuando el elemento ya suena (autoplay
    // muteado) y recién después se hace resume(), Chrome/Safari dejan el
    // MediaElementSourceNode en silencio para siempre (energía 0 → visualizer
    // en SIM eterno). Construir el grafo DENTRO del gesto reproduce el orden
    // resume→play que sí funciona (verificado con repro headless).
    this.bridge = null
    this._rebuilds = 0
    this.lastTitle = ''
    this.bindEvents()
  }

  // Construye el grafo la primera vez que hay un gesto real (click/tecla).
  // NO llama a este método desde código que corre sin gesto: el ctx nacería
  // suspended y el elemento sonando → silencio permanente en el analyser.
  ensureBridge() {
    if (this.corsFallback || this.bridge) return this.bridge
    try {
      this.bridge = new AnalyserBridge(this.audio)
      this.bridge.ensureRunning()
    } catch (e) {
      console.warn('[audio] no se pudo construir el grafo Web Audio:', e.message)
      this.bridge = null
    }
    return this.bridge
  }

  bindEvents() {
    this.audio.onplay = () => { setPlaying(true); this.bridge?.ensureRunning() }
    this.audio.onpause = () => setPlaying(false)
    this.audio.onwaiting = () => setLoading(true)
    this.audio.onplaying = () => {
      setLoading(false)
      this.logTimeToAudio()
    }
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
    this.audio = new AudioEngine._makeAudio()
    this.audio.volume = getState().volume / 100
    if (src) this.audio.src = src
    // rebind
    const that = this
    this.audio.onplay = () => setPlaying(true)
    this.audio.onpause = () => setPlaying(false)
    this.audio.onwaiting = () => setLoading(true)
    this.audio.onplaying = () => setLoading(false)
    // Sin reconexión el stream queda muerto para siempre en este modo.
    this.audio.onerror = () => {
      setLoading(false)
      this.scheduleReconnect()
    }
    if (src) { this.audio.load(); this.audio.play().catch(() => setLoading(false)) }
    console.warn('[audio] CORS fallback (sin analizador real)')
    that.bridge = null
  }

  // Reintenta el modo con analizador: recrea el <audio> con crossOrigin y
  // reconstruye el grafo Web Audio. Para recuparse de toFallback() cuando el
  // stream vuelve a mandar CORS (p.ej. Zeno cambió de backend).
  restoreCors() {
    if (!this.corsFallback) return false
    const src = this.audio.src
    this.audio.pause()
    this.audio = new AudioEngine._makeAudio()
    this.audio.crossOrigin = 'anonymous'
    this.audio.volume = getState().volume / 100
    if (src) this.audio.src = src
    this.bridge = new AnalyserBridge(this.audio)
    this.corsFallback = false
    this.bindEvents()
    if (src) { this.audio.load(); this.audio.play().catch(() => setLoading(false)) }
    console.info('[audio] CORS restaurado (analizador real de vuelta)')
    return true
  }

  // Autostart: autoplay MUTEADO (los browsers lo permiten sin gesto).
  // Bufferiza Y reproduce en silencio; al primer gesto del usuario se
  // desmutea → la radio ya suena al instante en vez de arrancar de cero.
  tryAutostart(station) {
    if (!station?.streamUrl) return false
    if (this._autostarted) return true
    this._autostarted = true
    this.loadStation(station)
    this.audio.muted = true // clave: muteado el autoplay no se bloquea
    this.playWithRetry()
    // si el navegador igual lo bloquea, limpiar el flag muteado para no
    // desmutear una reproducción que nunca arrancó
    this.audio.play().catch(() => { this.audio.muted = false })
    return true
  }

  // Desmutea el autostart en el primer gesto (click/touch/tecla).
  unmuteAutostart() {
    if (!this._autostarted || !this.audio.muted) return
    this.audio.muted = false
    // primer gesto: acá sí (y es el momento clave) para construir el grafo
    this.ensureBridge()
    // si el autoplay muteado quedó pausado (algunos browsers), reanudar ya
    // con el gesto del usuario como desbloqueo
    if (this.audio.paused && this.audio.src) this.playWithRetry()
  }

  loadStation(station) {
    if (!station?.streamUrl) return
    if (this.eventSource) { this.eventSource.close(); this.eventSource = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.reconnectAttempts = 0
    this.station = station

    // Fast path: ya es la estación actual. Si suena, nada; si está pausada,
    // solo play() (el buffer vivo sigue conectado → arranque inmediato).
    if (this.audio.src === station.streamUrl) {
      if (this.audio.paused) { this.play() } else { setLoading(false) }
      this.connectMetadata(station)
      return
    }

    this.audio.src = station.streamUrl
    this.applyVolume(getState().volume)
    setLoading(true)
    this.audio.load()
    // OJO: sin ensureBridge() acá — loadStation() también corre sin gesto
    // (tryAutostart al boot). El grafo lo arman play()/unmuteAutostart,
    // que siempre son gesto.
    this.audio.play().catch(() => setLoading(false))

    this.connectMetadata(station)
  }

  // Precarga temprana: se llama en pointerdown del selector de estación
  // (~100-300ms antes del click). load() bufferiza sin reproducir; cuando el
  // click llega y llama a loadStation(), el stream ya está cargando → play seco.
  prefetch(station) {
    if (!station?.streamUrl) return
    if (this.station?.id === station.id && this.audio.src) return
    if (this._prefetchId === station.id && this.audio.src) return
    this._prefetchId = station.id
    this.audio.src = station.streamUrl
    this.audio.load()
  }

  // Warm-up al abrir la página: bufferiza el stream de la estación
  // seleccionada SIN play() (autoplay está bloqueado sin gesto de todos
  // modos). Conecta metadata para que "now playing" ya esté al tocar play.
  // Con audio.src ya puesto, loadStation() cae en el fast path → play seco.
  warm(station) {
    if (!station?.streamUrl) return
    if (this.station?.id === station.id && this.audio.src) return
    this.station = station
    this._prefetchId = station.id
    this.audio.src = station.streamUrl
    this.audio.load()
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

  // Métrica time-to-audio (prioridad 3 de Javi): tiempo desde el gesto de play
  // hasta el evento 'playing' real. Log + expuesto en window.__pumph.ttfa
  // para poder medirlo desde QA externo sin tocar el DOM.
  logTimeToAudio() {
    if (!this._playRequestedAt) return
    const ms = Math.round(performance.now() - this._playRequestedAt)
    this._playRequestedAt = null
    console.info(`[audio] time-to-audio ${ms}ms (${this.station?.id || '?'})`)
    window.__pumph = window.__pumph || {}
    window.__pumph.ttfa = ms
    window.__pumph.ttfa_station = this.station?.id || null
  }

  play() {
    this.ensureBridge() // dentro del gesto → resume/build en el orden correcto
    if (!this.audio.src) {
      const st = getState().station || this.station
      if (st?.streamUrl) { this.loadStation(st); return }
    }
    if (this.audio.src) this.playWithRetry()
  }

  // play() con reintento: en el primer click, la load() del warm-up puede
  // seguir en curso → play() rechaza con AbortError y muere en silencio.
  // Reintentar cuando el stream esté listo (canplay) en vez de tragarse el error.
  playWithRetry() {
    const a = this.audio
    if (!this._playRequestedAt) this._playRequestedAt = performance.now()
    const p = a.play()
    if (!p) return
    p.catch((err) => {
      if (err?.name === 'AbortError') {
        const retry = () => {
          a.removeEventListener('canplay', retry)
          a.play().catch(() => setLoading(false))
        }
        a.addEventListener('canplay', retry)
        // techo de seguridad: si nunca llega canplay, liberar el "loading"
        setTimeout(() => a.removeEventListener('canplay', retry), 10000)
      } else {
        // NotAllowedError (sin gesto), NotSupportedError, red: feedback al usuario
        setLoading(false)
      }
    })
  }
  pause() { this.audio.pause() }
  toggle() { this.audio.paused ? this.play() : this.pause() }

  applyVolume(v) {
    const vol = Math.max(0, Math.min(100, v))
    if (this.bridge && this.bridge.gain) {
      // iOS ignora audio.volume — usamos SOLO el GainNode para controlar volumen.
      // No tocar this.audio.volume para evitar doble-atenuación en desktop.
      // setValueAtTime evita glitches/ramps en iOS.
      const now = this.bridge.ctx.currentTime
      this.bridge.gain.gain.setValueAtTime(vol / 100, now)
    } else {
      // Fallback: sin bridge (CORS fallback), usar audio.volume nativo
      this.audio.volume = vol / 100
    }
  }

  setVolume(v) {
    const vol = Math.max(0, Math.min(100, v))
    const currentVol = getState().volume
    // Si estamos muteando (vol=0) y habia volumen > 0, guardar como previo
    if (vol === 0 && currentVol > 0) {
      localStorage.setItem('pumphradio_previous_volume', String(currentVol))
    }
    // OJO: acá NO va ensureBridge(). setVolume() también corre al boot vía
    // initVolume() SIN gesto del usuario → construiría el grafo suspended
    // con el elemento ya sonando → MediaElementSource mudo para siempre
    // (bug del visualizador en SIM). El grafo lo construyen las rutas con
    // gesto real: unmuteAutostart (pointerdown/keydown global) y play().
    this.applyVolume(vol)
    storeSetVolume(vol)
    localStorage.setItem('pumphradio_volume', String(vol))
  }

  initVolume() {
    const saved = parseInt(localStorage.getItem('pumphradio_volume') || '80', 10)
    // Si el volumen guardado es 0 (quedo muteado en una sesion anterior),
    // arrancar con el volumen previo (o default 80) para no iniciar mudo.
    if (saved === 0) {
      const prev = parseInt(localStorage.getItem('pumphradio_previous_volume') || '80', 10)
      this.setVolume(prev)
    } else {
      this.setVolume(saved)
    }
  }

  // Reconstruye el grafo COMPLETO (elemento nuevo + ctx nuevo) para escapar
  // del estado "source en silencio permanente" de Chrome/Safari: si el
  // elemento arrancó a sonar con el AudioContext suspendido, el resume()
  // tardío no recupera el MediaElementSource. La única salida sana es
  // re-crear el <audio> y el grafo dentro de un contexto ya desbloqueado.
  // La llama el visualizer cuando detecta energía 0 sostenida sonando.
  rebuildGraph() {
    if (this.corsFallback) return false
    if (this._rebuilds >= 3) return false // techo: no rebuild infinito
    const src = this.audio.src
    if (!src) return false
    console.warn('[audio] rebuild del grafo Web Audio (source en silencio)')
    try { this.bridge?.disconnect() } catch { /* ignore */ }
    try { if (this.bridge?.ctx && this.bridge.ctx.state !== 'closed') this.bridge.ctx.close() } catch { /* ignore */ }
    const wasPlaying = !this.audio.paused
    this.audio.pause()
    this.audio = new AudioEngine._makeAudio()
    this.audio.crossOrigin = 'anonymous'
    this.audio.volume = getState().volume / 100
    this.audio.src = src
    this.bindEvents()
    this.bridge = new AnalyserBridge(this.audio)
    this._rebuilds++
    if (wasPlaying || this.station) {
      this.audio.load()
      // el rebuild lo dispara el visualizer (rAF) tras un gesto previo del
      // usuario: el ctx nuevo arranca resume-able. Si el play falla, cae al
      // flujo normal de loading/reconnect.
      this.bridge.ensureRunning()
      this.audio.play().catch(() => setLoading(false))
    }
    return true
  }

  getAnalyser() {
    return this.corsFallback || !this.bridge ? null : this.bridge
  }
}

export const audio = new AudioEngine()
