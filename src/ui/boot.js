/**
 * boot.js — Secuencia de arranque terminal (1-2s), saltable.
 */
import { boot } from '../store.js'

const LINES = [
  ['BOOTING AUDIO ENGINE', 'OK'],
  ['LOADING STATIONS', 'OK'],
  ['CONNECTING METADATA', 'OK'],
  ['SYNCING NETWORK', 'OK'],
]

export function initBoot(onDone) {
  const overlay = document.getElementById('boot')
  if (!overlay) { boot(); onDone && onDone(); return }

  // saltar con click
  overlay.addEventListener('click', () => finish())

  const body = overlay.querySelector('#boot-body')
  body.innerHTML = ''

  let i = 0
  const print = () => {
    if (i < LINES.length) {
      const [label, status] = LINES[i]
      const line = document.createElement('div')
      line.className = 'boot-line'
      line.innerHTML = `<span class="boot-label">${label}</span><span class="boot-status">${status}</span>`
      body.appendChild(line)
      i++
      setTimeout(print, 180)
    } else {
      // READY_
      const ready = document.createElement('div')
      ready.className = 'boot-ready'
      ready.innerHTML = '<span class="dim">NODE: SOUTH-AMERICA-01</span> <span class="dim">STATUS: ONLINE</span><br>&gt; READY_'
      body.appendChild(ready)
      setTimeout(finish, 700)
    }
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

  print()
}
