/**
 * enrich.js — Enriquece la metadata cruda del stream con datos externos.
 *
 * Fuentes (todas con CORS abierto, sin API key):
 *   - MusicBrainz: RELEASE / LABEL / YEAR (search por artist + track)
 *   - Cover Art Archive: COVER del álbum (por release-mbid)
 *   - Wikipedia (summary): BIO + imagen del artista
 *
 * Reglas de oro:
 *   - NUNCA inventar datos. Si una API no devuelve, dejar "—".
 *   - Cache en memoria (TTL 7 días) para no pegar 5 veces lo mismo.
 *   - MusicBrainz exige User-Agent con contacto (rate-limit 1 req/s, 503 si abusas).
 */

const TTL = 7 * 24 * 3600 * 1000
const MB_BASE = 'https://musicbrainz.org/ws/2'
const CAA_BASE = 'https://coverartarchive.org'
const UA = 'PumphRadio/0.1 (https://pumphradio.com.ar)'

const memCache = new Map()    // artist+track → { ts, data }
let lastMb = 0               // para rate-limit (1 req/s)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function mbFetch(path) {
  const wait = Math.max(0, 1100 - (Date.now() - lastMb))
  if (wait) await sleep(wait)
  lastMb = Date.now()
  let r, tries = 0
  while (tries < 3) {
    try {
      r = await fetch(`${MB_BASE}${path}`, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
      if (r.status === 503) { await sleep(2000); tries++; continue }
      if (!r.ok) return null
      return await r.json()
    } catch { tries++ }
  }
  return null
}

function cacheKey(artist, track) { return `${artist}|${track}`.toLowerCase() }

function fromCache(key) {
  const e = memCache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > TTL) { memCache.delete(key); return null }
  return e.data
}
function toCache(key, data) { memCache.set(key, { ts: Date.now(), data }) }

function escLucene(s) { return s.replace(/["\\]/g, c => `\\${c}`) }

/**
 * Enriquece artist+track. Devuelve { release, label, year, coverUrl, artistBio, artistImage }
 * Cada campo puede ser undefined si la fuente no devolvió.
 */
export async function enrich(artist, track) {
  if (!artist || !track) return {}
  const key = cacheKey(artist, track)
  const cached = fromCache(key)
  if (cached) return cached

  const out = {}

  // 1) MusicBrainz: search recording
  const a = escLucene(artist.trim())
  const t = escLucene(track.trim())
  const rec = await mbFetch(`/recording?query=recording:"${t}"%20AND%20artist:"${a}"&fmt=json&limit=1`)
  let releaseMbid = null
  if (rec?.recordings?.length) {
    const r = rec.recordings[0]
    const rel = r.releases?.[0]
    if (rel) {
      out.release = rel.title
      out.year = rel.date?.slice(0, 4) || undefined
      releaseMbid = rel.id
      const lbl = rel['label-info']?.[0]?.label
      if (lbl?.name) out.label = lbl.name
    }
  }

  // 2) Cover Art Archive (sólo si tenemos release-mbid)
  if (releaseMbid) {
    try {
      const r = await fetch(`${CAA_BASE}/release/${releaseMbid}`)
      if (r.ok) {
        const d = await r.json()
        const front = d.images?.find(i => i.front) || d.images?.[0]
        if (front) {
          // 500px = buen tamaño para el panel. Si no, fallback al image.
          out.coverUrl = front.thumbnails?.['500'] || front.image
        }
      }
    } catch { /* ignore */ }
  }

  // 3) Wikipedia: bio + imagen del artista (título exacto, fallback sin paréntesis)
  if (artist) {
    const wikiTitle = encodeURIComponent(artist.trim())
    for (const lang of ['en', 'es']) {
      try {
        const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`)
        if (!r.ok) continue
        const d = await r.json()
        if (d.extract) {
          out.artistBio = d.extract
          out.artistImage = d.thumbnail?.source
          if (d.description) out.artistDesc = d.description
          break
        }
      } catch { /* try next lang */ }
    }
  }

  toCache(key, out)
  return out
}
