/**
 * themes.js — Gestión central de themes.
 * Un solo botón con el NOMBRE del theme; tocarlo cicla colores.
 * Persistencia en localStorage (pumphradio-theme) → se recuerda al reabrir.
 */
export const THEMES = [
  { id: 'one-dark',    label: 'ONE DARK' },
  { id: 'dracula',     label: 'DRACULA' },
  { id: 'nord',        label: 'NORD' },
  { id: 'gruvbox',     label: 'GRUVBOX' },
  { id: 'tokyo-night', label: 'TOKYO NIGHT' },
  { id: 'tty-linux',   label: 'TTY LINUX' },
  { id: 'matrix',      label: 'MATRIX' },
]

export function currentTheme() {
  return document.documentElement.dataset.theme || 'one-dark'
}

export function labelFor(id) {
  return (THEMES.find(t => t.id === id) || THEMES[0]).label
}

export function setTheme(id) {
  document.documentElement.dataset.theme = id
  try { localStorage.setItem('pumphradio-theme', id) } catch {}
  const btn = document.getElementById('btn-theme')
  if (btn) btn.textContent = labelFor(id)
  return id
}

export function cycleTheme() {
  const cur = currentTheme()
  const i = THEMES.findIndex(t => t.id === cur)
  const next = THEMES[(i + 1) % THEMES.length]
  setTheme(next.id)
  return next.id
}

/** Aplica el theme guardado (o el default) al arrancar. */
export function initTheme() {
  let saved = null
  try { saved = localStorage.getItem('pumphradio-theme') } catch {}
  if (!THEMES.some(t => t.id === saved)) saved = 'one-dark'
  setTheme(saved)
  return saved
}
