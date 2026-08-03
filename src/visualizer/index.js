/**
 * visualizer/index.js — Renderer multimodo.
 * Lee datos REALES del AnalyserNode (cuando hay CORS) y, si no, usa una
 * simulación reactiva (sync a la metadata y al BPM del género) — pero el
 * modo por defecto muestra el análisis real de Zeno.
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

const MODES = ['spectrum', 'oscilloscope', 'waveform', 'ascii', 'bars']

export class Visualizer {
  constructor(canvas, labelEl) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.labelEl = labelEl
    this.mode = 'spectrum'
    this.raf = null
    this.t = 0
    this.smooth = new Float32Array(128).fill(0.05)
    this.onResize()
    window.addEventListener('resize', () => this.onResize())
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

  accent() {
    const cs = getComputedStyle(document.documentElement)
    return cs.getPropertyValue('--accent').trim() || '#ff5f56'
  }

  // Datos: reales del analizador o simulados.
  data() {
    const an = audio.getAnalyser && audio.getAnalyser()
    if (an && getState().playing) {
      const f = an.readFrequency()
      const w = an.readWaveform()
      if (f && w) return { real: true, freq: f, wave: w }
    }
    return { real: false, freq: this.simFreq(), wave: this.simWave() }
  }

  simFreq() {
    // envelope tipo kick sincronizado al flujo (BPM del género)
    const st = getState()
    const bpm = (st.station && st.station.bpmHint) || 140
    const t = this.t * (bpm / 60)
    const kick = (Math.sin(t * Math.PI * 2) * 0.5 + 0.5) ** 3
    const out = new Float32Array(128)
    for (let i = 0; i < 128; i++) {
      const f = i / 128
      const bass = (1 - f) * 0.8 + 0.2
      const v = (Math.abs(Math.sin(t * (1.5 + f * 8) + f * 9)) * 0.5 * bass +
                 Math.random() * 0.2) * (0.3 + kick * 0.8) * (st.playing ? 1 : 0.15)
      out[i] = Math.min(1, v)
    }
    return out
  }
  simWave() {
    const st = getState()
    const t = this.t
    const out = new Float32Array(128)
    for (let i = 0; i < 128; i++) {
      out[i] = Math.sin(i * 0.2 + t * 10) * 0.4 * (st.playing ? 1 : 0.15) + Math.sin(i * 0.5 - t * 7) * 0.3
    }
    return out
  }

  loop() {
    this.t += 0.016
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)
    const accent = this.accent()

    switch (this.mode) {
      case 'spectrum': this.renderSpectrum(ctx, accent); break
      case 'oscilloscope': this.renderOscilloscope(ctx, accent); break
      case 'waveform': this.renderWaveform(ctx, accent); break
      case 'ascii': this.renderAscii(ctx, accent); break
      case 'bars': this.renderBars(ctx, accent); break
    }

    this.raf = requestAnimationFrame(() => this.loop())
  }

  renderSpectrum(ctx, accent) {
    const { freq } = this.data()
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

  renderOscilloscope(ctx, accent) {
    const { wave } = this.data()
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

  renderWaveform(ctx, accent) {
    const { wave } = this.data()
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

  renderAscii(ctx, accent) {
    const { freq } = this.data()
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

  renderBars(ctx, accent) {
    const { freq } = this.data()
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
    window.removeEventListener('resize', () => this.onResize())
  }
}
