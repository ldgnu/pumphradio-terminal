/**
 * overlay.js — Overlay genérico estilo terminal (scrim + panel).
 * Se abre con contenido HTML; se cierra con ESC o click en scrim o botón ✕.
 * Lo usan: help, history, favorites, ambient, news.
 */
let open = false
let lastFocus = null

function $(id) { return document.getElementById(id) }

export function initOverlay() {
  const close = $('ov-close')
  const scrim = $('ov-scrim')
  if (close) close.addEventListener('click', closeOverlay)
  if (scrim) scrim.addEventListener('click', closeOverlay)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay()
  })
}

export function openOverlay(title) {
  const ov = $('overlay')
  if (!ov) return
  if (title) setOverlayTitle(title)
  // a11y: guardar el foco actual, mandarlo al overlay y devolverlo al cerrar
  if (!open) lastFocus = document.activeElement
  ov.classList.add('open')
  ov.setAttribute('aria-hidden', 'false')
  open = true
  $('ov-close')?.focus({ preventScroll: true })
  document.getElementById('cmd-line')?.classList.add('dimmed')
}

export function closeOverlay() {
  const ov = $('overlay')
  if (ov) {
    ov.classList.remove('open')
    ov.setAttribute('aria-hidden', 'true')
  }
  open = false
  if (lastFocus && document.contains(lastFocus)) {
    lastFocus.focus({ preventScroll: true })
  }
  lastFocus = null
  document.getElementById('cmd-line')?.classList.remove('dimmed')
}

export function isOverlayOpen() { return open }

export function setOverlayTitle(t) {
  const el = $('ov-title')
  if (el) el.textContent = t
}
export function setOverlayContent(title, html) {
  const body = $('ov-body')
  if (body) body.innerHTML = html
  setOverlayTitle(title)
}
export function getOverlayBody() { return $('ov-body') }
