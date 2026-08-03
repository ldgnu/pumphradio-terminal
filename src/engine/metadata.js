/**
 * metadata.js — Normaliza el streamTitle ("Artist - Track") a un objeto.
 * Conservador: no inventa datos. Solo separa artista de track.
 */

// Sufijos comunes de versiones que se recortan del TRACK (no del artista).
const TRACK_SUFFIX = /\s*\((Extended Mix|Extended|Radio Edit|Mix Edit|Original Mix|Club Mix|Album Mix|Dub Mix|Instrumental)\)\s*$/i

export function parseStreamTitle(streamTitle = '', fallbackStationName = '') {
  const raw = String(streamTitle).trim()
  if (!raw) return { artist: '', track: '', streamTitle: raw }

  let artist = ''
  let track = raw

  // Zeno/ICY: "Artist - Track"
  const sep = raw.search(/\s-\s/)
  if (sep > -1) {
    artist = raw.slice(0, sep).trim()
    track = raw.slice(sep + 3).trim()
  }

  // Recortar sufijo de versión del track, guardando el display completo
  const trackClean = track.replace(TRACK_SUFFIX, '').trim()

  return {
    artist,
    track: trackClean,
    display: track, // versión completa para mostrar
    streamTitle: raw,
    source: 'stream',
  }
}
