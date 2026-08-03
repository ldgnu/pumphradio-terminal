/**
 * help.js — Overlay de ayuda. Se abre con "?" o `help`.
 * Muestra atajos de teclado + comandos disponibles, con estética terminal.
 */
import { closeOverlay, openOverlay, setOverlayContent } from './overlay.js'

export function openHelp() {
  setOverlayContent(
    'HELP — OPERATOR MANUAL',
    `
      <div class="ov-section">
        <div class="ov-h">KEYBOARD SHORTCUTS</div>
        <div class="ov-grid">
          ${kbd('SPACE', 'play / pause')}
          ${kbd('/ or ?', 'command line / help')}
          ${kbd('1-4', 'switch station')}
          ${kbd('N', 'next station')}
          ${kbd('V', 'visualizer mode')}
          ${kbd('↑ / ↓', 'volume')}
          ${kbd('M', 'mute')}
          ${kbd('F', 'favorite current track')}
          ${kbd('H', 'track history')}
          ${kbd('A', 'ambient mode')}
          ${kbd('T', 'cycle theme')}
          ${kbd('ESC', 'close / back')}
        </div>
      </div>
      <div class="ov-section">
        <div class="ov-h">COMMANDS — pump!station &gt; <span class="ov-cmd">cmd</span></div>
        <div class="ov-grid">
          ${cmd('play / pause / next')}
          ${cmd('station &lt;id|num&gt;', 'switch station')}
          ${cmd('stations', 'list frequencies')}
          ${cmd('news', 'signal intelligence')}
          ${cmd('history', 'recent tracks')}
          ${cmd('favorites / ♥', 'saved tracks')}
          ${cmd('ambient', 'fullscreen now-playing')}
          ${cmd('uptime / stats', 'listening stats')}
          ${cmd('theme &lt;name&gt;', 'switch theme')}
          ${cmd('viz &lt;mode&gt;', 'visualizer mode')}
          ${cmd('signal', 'signal quality')}
          ${cmd('whoami / time / ls')}
          ${cmd('help / quit')}
        </div>
      </div>
      <div class="ov-foot dim">PUMP! STATION v0.2 · underground frequencies · broadcasting from nowhere</div>
    `
  )
  openOverlay()
}

function kbd(k, d) {
  return `<span class="ov-k">${k}</span><span class="ov-d">${d}</span>`
}
function cmd(c, d = '') {
  return `<span class="ov-cmd">${c}</span><span class="ov-d">${d}</span>`
}
