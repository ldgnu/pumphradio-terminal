/**
 * visualizer/index.js — Renderer multimodo.
 *
 * Lee SIEMPRE datos reales del AnalyserNode. Si no hay audio (pausa, stream
 * mudo, contexto suspendido, CORS roto) el visualizador NO inventa
 * movimiento: queda apagado en una línea base plana.
 *
 * Modos:
 *   spectrum     barras de frecuencia
 *   oscilloscope forma de onda (time-domain)
 *   waveform     onda suavizada
 *   ascii        ASCII spectrum con bloques Unicode (por bandas de frec)
 *   bars         terminal bars
 */
import { getState } from '../store.js'
import { audio } from '../engine/audio.js'
import { getAccent } from '../themes.js'

const MODES = ['spectrum', 'oscilloscope', 'waveform', 'ascii', 'bars']

// Auto-rotación aleatoria del modo (ms). 0 = desactivada.
const AUTO_MODE_MS = 45000

function randomModeExcept(current) {
  const pool = MODES.filter((m) => m !== current)
  return pool[Math.floor(Math.random() * pool.length)]
}

// Suma de energía del array de frecuencias (Uint8Array). ~0 = analizador muerto/plano.
function energy(freq) {
  let sum = 0
  for (let i = 0; i < freq.length; i++) sum += freq[i]
  return sum
}

export class Visualizer {
  constructor(canvas, labelEl) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.labelEl = labelEl
    // Modo inicial ALEATORIO (nunca el mismo de siempre)
    this.mode = randomModeExcept('spectrum')
    if (Math.random() < 0.2) this.mode = 'spectrum' // spectrum sigue siendo el clásico 1 de cada 5
    this.raf = null
    this.t = 0
    this.smooth = new Float32Array(128).fill(0.05)
    // Auto-rotación: cada AUTO_MODE_MS salta a otro modo al azar (solo sonando)
    this._autoModeTimer = setInterval(() => {
      if (getState().playing) {
        this.setMode(randomModeExcept(this.mode))
        this.labelEl && (this.labelEl.textContent = this.mode.toUpperCase())
      }
    }, AUTO_MODE_MS)
    // Referencia estable para poder remover el listener en destroy()
    this._onResize = () => this.onResize()
    this.onResize()
    window.addEventListener('resize', this._onResize)
  }

  onResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = this.canvas.clientWidth
    this.h = this.canvas.clientHeight
    this.canvas.width = this.w * dpr
    this.canvas.height = this.h * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  setMode(m) {
    if (MODES.includes(m)) this.mode = m
    if (this.labelEl) this.labelEl.textContent = m.toUpperCase()
  }
  nextMode() {
    const i = MODES.indexOf(this.mode)
    this.setMode(MODES[(i + 1) % MODES.length])
    return this.mode
  }

  // Color --accent cacheado en themes.js (getComputedStyle cada frame = caro)
  accent() {
    return getAccent()
  }

  // Datos REALES del analizador. null = no hay audio que seguir.
  // Sin fallback simulado: si el analizador no entrega energía, el
  // visualizador se apaga en vez de bailar solo.
  data() {
    const an = audio.getAnalyser && audio.getAnalyser()
    if (!an) return null
    const f = an.readFrequency()
    const w = an.readWaveform()
    if (!f || !w) return null
    if (energy(f) > 4) {
      this._deadFrames = 0
      this._realLast = true
      return { real: true, freq: f, wave: w }
    }
    // AudioContext suspendido (iOS autoplay/interrupción): intentar resume.
    if (an.ctx && an.ctx.state !== 'running') an.ensureRunning()
    this._deadFrames = (this._deadFrames || 0) + 1
    this._realLast = false
    return null
  }

  // Línea base plana = "apagado": muestra que está vivo pero sin señal.
  renderNoSignal(ctx, accent) {
    const y = this.h / 2
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.18
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(this.w, y)
    ctx.stroke()
    ctx.globalAlpha = 1
    if (this.labelEl) this.labelEl.textContent = this.mode.toUpperCase() + ' · SIN SEÑAL'
  }

  loop() {
    const st = getState()
    this.t += 0.016
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)
    // Visualizador apagado si no hay reproducción: solo reacciona a la música.
    // OJO: reprogramar el rAF ANTES del return — un return directo mata el
    // loop para siempre (pausar → visualizer muerto aunque luego se reproduzca).
    if (!st.playing) {
      this._wasOff = true
      if (this.labelEl) this.labelEl.textContent = this.mode.toUpperCase() + ' · OFF'
      this.raf = requestAnimationFrame(() => this.loop())
      return
    }

    const d = this.data()

    // Sonando pero sin datos del analizador: apagado (línea plana), cero
    // animación inventada. Cada ~1.5s se intenta recuperar el analizador.
    if (!d) {
      this.renderNoSignal(ctx, this.accent())
      this._recoverTick = (this._recoverTick || 0) + 1
      if (this._recoverTick >= 90) {
        this._recoverTick = 0
        // ¿El bridge sigue existiendo pero mudo? Reconstruir elemento+grafo.
        if (audio.getAnalyser && audio.getAnalyser()) {
          if (audio.rebuildGraph && audio.rebuildGraph()) this._deadFrames = 0
        } else if (audio.restoreCors && audio.restoreCors()) {
          this._deadFrames = 0
        }
      }
      this.raf = requestAnimationFrame(() => this.loop())
      return
    }

    this._recoverTick = 0
    // Primera vuelta tras reanudar: animación de encendido suave.
    if (this._wasOff) {
      this._wasOff = false
      this._power = 0
    }
    this._power = Math.min(1, (this._power || 0) + 0.04)
    ctx.globalAlpha = this._power
    const accent = this.accent()

    switch (this.mode) {
      case 'spectrum': this.renderSpectrum(ctx, accent, d); break
      case 'oscilloscope': this.renderOscilloscope(ctx, accent, d); break
      case 'waveform': this.renderWaveform(ctx, accent, d); break
      case 'ascii': this.renderAscii(ctx, accent, d); break
      case 'bars': this.renderBars(ctx, accent, d); break
    }
    ctx.globalAlpha = 1

    // Indicador LIVE en el label (cada ~1s, barato).
    this._labelTick = (this._labelTick || 0) + 1
    if (this._labelTick >= 60 && this.labelEl) {
      this._labelTick = 0
      this.labelEl.textContent = this.mode.toUpperCase() + ' · LIVE'
    }

    // Hook de QA: permite verificar desde afuera si el visualizador está
    // siguiendo audio real (window.__vizState) sin screenshot.
    window.__vizState = {
      mode: this.mode,
      live: !!this._realLast,
      playing: st.playing,
      frames: (this._frames = (this._frames || 0) + 1),
    }

    this.raf = requestAnimationFrame(() => this.loop())
  }

  renderSpectrum(ctx, accent, { freq }) {
    const n = 48
    const barW = this.w / n
    for (let i = 0; i < n; i++) {
      // agrupar bandas log
      const idx = Math.floor(Math.pow(i / n, 1.7) * (freq.length - 1))
      const v = (freq[idx] || 0) / 255
      this.smooth[i] += (v - this.smooth[i]) * 0.45
      const h = Math.max(1, this.smooth[i] * this.h)
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.4 + this.smooth[i] * 0.6
      ctx.fillRect(i * barW + 1, this.h - h, barW - 2, h)
    }
    ctx.globalAlpha = 1
  }

  renderOscilloscope(ctx, accent, { wave }) {
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    for (let i = 0; i < wave.length; i++) {
      const x = (i / wave.length) * this.w
      const y = this.h / 2 + ((wave[i] - 128) / 128) * this.h * 0.9
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  renderWaveform(ctx, accent, { wave }) {
    const grad = ctx.createLinearGradient(0, 0, 0, this.h)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.5, accent)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    const n = 48
    const step = Math.floor(wave.length / n)
    for (let i = 0; i < n; i++) {
      const v = (wave[i * step] - 128) / 128
      const x = (i / n) * this.w
      const y = this.h / 2 + v * this.h * 0.8
      ctx.fillRect(x, Math.min(y, this.h / 2), this.w / n, Math.abs(this.h / 2 - y))
    }
  }

  renderAscii(ctx, accent, { freq }) {
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.9
    const rows = Math.floor(this.h / 16)
    const cols = 24
    const fs = 12
    ctx.font = fs + 'px monospace'
    for (let c = 0; c < cols; c++) {
      const idx = Math.floor(Math.pow(c / cols, 1.8) * (freq.length - 1))
      const v = (freq[idx] || 0) / 255
      const h = Math.ceil(v * rows)
      let s = ''
      for (let r = 0; r < rows; r++) {
        s = (r < h ? blocks[Math.min(7, Math.floor(v * 8))] : ' ') + s
      }
      ctx.fillText(s, c * 11, this.h - 4)
    }
    ctx.globalAlpha = 1
  }

  renderBars(ctx, accent, { freq }) {
    const rows = 8
    const cols = 32
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.85
    const cw = this.w / cols
    const ch = this.h / rows
    for (let c = 0; c < cols; c++) {
      const idx = Math.floor(Math.pow(c / cols, 1.6) * (freq.length - 1))
      const v = (freq[idx] || 0) / 255
      const filled = Math.ceil(v * rows)
      for (let r = 0; r < rows; r++) {
        if (r < filled) {
          ctx.fillRect(c * cw + 1, this.h - (r + 1) * ch, cw - 2, ch - 1)
        }
      }
    }
    ctx.globalAlpha = 1
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf)
    if (this._autoModeTimer) clearInterval(this._autoModeTimer)
    window.removeEventListener('resize', this._onResize)
  }
}
