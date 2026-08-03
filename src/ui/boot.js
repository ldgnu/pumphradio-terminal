/**
 * boot.js — Secuencia de arranque terminal (1.5-2s), saltable.
 * Logo ASCII + typewriter + barra de progreso. Todo estético, no bloquea.
 */
import { boot } from '../store.js'

const LOGO = [
  ' █████░ █    █ █▒  ▒█ █████░   █   ',
  ' █   ▓█ █    █ ██  ██ █   ▓█   █   ',
  ' █    █ █    █ ██░░██ █    █   █   ',
  ' █   ▓█ █    █ █▒▓▓▒█ █   ▓█   █   ',
  ' █████░ █    █ █ ██ █ █████░   █   ',
  ' █      █    █ █ █▓ █ █        █   ',
  ' █      █    █ █    █ █            ',
  ' █      █▒  ▒█ █    █ █        █   ',
  ' █       ████  █    █ █        █   ',
  '  ▓███▒███████   ██  ███████ █████   ▓██▓  ██   █',
  ' █▓  ░█   █      ██     █      █    ▒█  █▒ ██░  █',
  ' █        █     ▒██▒    █      █    █░  ░█ █▒▓  █',
  ' █▓░      █     ▓▒▒▓    █      █    █    █ █ █  █',
  '  ▓██▓    █     █░░█    █      █    █    █ █ ▓▓ █',
  '     ▓█   █     █  █    █      █    █    █ █  █ █',
  '      █   █    ▒████▒   █      █    █░  ░█ █  ▓▒█',
  ' █░  ▓█   █    ▓▒  ▒▓   █      █    ▒█  █▒ █  ░██',
  ' ▒████░   █    █░  ░█   █    █████   ▓██▓  █   ██',
]

const LINES = [
  ['INIT UNDERGROUND FREQUENCIES', 'OK'],
  ['MOUNTING STATION TABLE', 'OK'],
  ['ALLOCATING AUDIO ENGINE', 'OK'],
  ['CONNECTING METADATA NODES', 'OK'],
  ['SYNCING SIGNAL INTELLIGENCE', 'OK'],
  ['UPLINK TO NETWORK', 'OK'],
]

export function initBoot(onDone) {
  const overlay = document.getElementById('boot')
  if (!overlay) { boot(); onDone && onDone(); return }

  overlay.addEventListener('click', () => finish())

  const body = overlay.querySelector('#boot-body')
  const sep = overlay.querySelector('.boot-sep')
  if (sep) sep.style.display = 'none'

  // Logo ASCII con typewriter por línea
  const logoWrap = document.createElement('pre')
  logoWrap.className = 'boot-logo'
  body.appendChild(logoWrap)

  let logoLine = 0
  const drawLogo = () => {
    if (logoLine < LOGO.length) {
      logoWrap.textContent += LOGO[logoLine] + '\n'
      logoLine++
      setTimeout(drawLogo, 26)
    } else {
      drawLines()
    }
  }

  // Líneas de boot con typewriter
  let lineIdx = 0
  const bootLog = document.createElement('div')
  bootLog.className = 'boot-log'
  body.appendChild(bootLog)

  const drawLines = () => {
    if (lineIdx >= LINES.length) {
      progress() // arranca la barra
      return
    }
    const [label, status] = LINES[lineIdx]
    const row = document.createElement('div')
    row.className = 'boot-line'
    bootLog.appendChild(row)
    typeRow(row, label, status)
  }

  function typeRow(row, label, status, idx = 0) {
    if (idx <= label.length) {
      row.innerHTML = `<span class="boot-label">${label.slice(0, idx)}</span>`
      idx++
      setTimeout(() => typeRow(row, label, status, idx), 6)
    } else {
      row.innerHTML = `<span class="boot-label">${label}</span><span class="boot-status"> ${status}</span>`
      lineIdx++
      setTimeout(drawLines, 70)
    }
  }

  // Barra de progreso determinista (1.2s)
  const barWrap = document.createElement('div')
  barWrap.className = 'boot-bar-wrap'
  const bar = document.createElement('div')
  bar.className = 'boot-bar'
  barWrap.appendChild(bar)
  body.appendChild(barWrap)

  let pct = 0
  function progress() {
    if (pct >= 100) {
      // READY_
      const ready = document.createElement('div')
      ready.className = 'boot-ready'
      ready.innerHTML = '<span class="dim">NODE: SOUTH-AMERICA-01</span> <span class="dim">STATUS: ONLINE</span><br>&gt; READY_'
      body.appendChild(ready)
      setTimeout(finish, 500)
      return
    }
    pct += Math.random() * 14 + 4
    pct = Math.min(100, pct)
    bar.style.width = pct + '%'
    setTimeout(progress, 120)
  }

  const finished = { done: false }
  function finish() {
    if (finished.done) return
    finished.done = true
    overlay.classList.add('hide')
    setTimeout(() => {
      overlay.remove()
      boot()
      onDone && onDone()
    }, 250)
  }

  drawLogo()
}
