/**
 * visualizer/analyser.js — Puente Web Audio.
 * Conecta el <audio> a un AnalyserNode real (requiere CORS en el stream).
 * Expone frecuencia y forma de onda para el visualizador.
 */
const FFT = 256

export class AnalyserBridge {
  constructor(audioElement) {
    this.audio = audioElement
    this.ctx = null
    this.analyser = null
    this.gain = null
    this.freq = null
    this.wave = null
    this.ok = false
    try {
      this.build()
    } catch (e) {
      console.warn('[analyser] no se pudo construir el grafo Web Audio:', e.message)
    }
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC({ latencyHint: 'playback' })
    this.source = this.ctx.createMediaElementSource(this.audio)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FFT
    this.analyser.smoothingTimeConstant = 0.8
    this.gain = this.ctx.createGain()
    this.gain.gain.value = 0.8

    // source → analyser → gain → destination
    this.source.connect(this.analyser)
    this.analyser.connect(this.gain)
    this.gain.connect(this.ctx.destination)

    this.freq = new Uint8Array(this.analyser.frequencyBinCount) // 128
    this.wave = new Uint8Array(this.analyser.fftSize)           // 256
    this.ok = true
  }

  ensureRunning() {
    // iOS: el contexto puede estar 'suspended' (autoplay policy) o
    // 'interrupted' (llamada, screen lock, Siri). Ambos necesitan resume().
    if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
      this.ctx.resume().catch(() => {})
    }
  }

  // Devuelve true si hay datos reales que leer.
  readFrequency() {
    if (!this.ok || !this.analyser || !this.freq) return null
    this.analyser.getByteFrequencyData(this.freq)
    return this.freq
  }
  readWaveform() {
    if (!this.ok || !this.analyser || !this.wave) return null
    this.analyser.getByteTimeDomainData(this.wave)
    return this.wave
  }

  disconnect() {
    if (this.source) { try { this.source.disconnect() } catch {} }
    if (this.analyser) { try { this.analyser.disconnect() } catch {} }
    if (this.gain) { try { this.gain.disconnect() } catch {} }
  }
}
