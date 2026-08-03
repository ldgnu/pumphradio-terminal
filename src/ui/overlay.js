/**
 * overlay.js — Overlay genérico estilo terminal (scrim + panel).
 * Se abre con contenido HTML; se cierra con ESC o click en scrim o botón ✕.
 * Lo usan: help, history, favorites, ambient, news.
 */
let open = false

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
  ov.classList.add('open')
  ov.setAttribute('aria-hidden', 'false')
  open = true
  document.getElementById('cmd-line')?.classList.add('dimmed')
}

export function closeOverlay() {
  const ov = $('overlay')
  if (ov) {
    ov.classList.remove('open')
    ov.setAttribute('aria-hidden', 'true')
  }
  open = false
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
