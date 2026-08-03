/**
 * enrich.js — Enriquece la metadata cruda del stream con datos externos.
 *
 * Fuentes (todas con CORS abierto, sin API key):
 *   - MusicBrainz: RELEASE / LABEL / YEAR + ARTIST BIO data (genres, country, type)
 *   - Cover Art Archive: COVER del álbum (por release-mbid)
 *   - Wikidata: ARTIST BIO description (via MusicBrainz URL-rels link)
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
 * Enriquece artist+track. Devuelve { release, label, year, coverUrl, artistBio }
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

  // 3) Bio del artista: MusicBrainz + Wikidata (datos factuales, nunca inventar)
  // Fallback: si no hay match claro o datos insuficientes, dejar undefined
  if (artist) {
    const artistName = artist.trim()
    
    // 3a) Buscar artista en MusicBrainz
    const mbSearch = await mbFetch(`/artist?query=artist:"${escLucene(artistName)}"&fmt=json&limit=3`)
    
    if (mbSearch?.artists?.length) {
      // Tomar el primer resultado (más relevante por score de MB)
      const mbArtist = mbSearch.artists[0]
      const mbid = mbArtist.id
      
      // 3b) Obtener detalles completos con relaciones y géneros
      const mbDetails = await mbFetch(`/${mbid}?inc=url-rels+genres+tags&fmt=json`)
      
      if (mbDetails) {
        // Datos factuales estructurados
        const type = mbDetails.type // Person, Group, etc.
        const country = mbDetails.country // Código ISO (AR, US, GB, etc.)
        const genres = mbDetails.genres?.map(g => g.name).filter(Boolean) || []
        const tags = mbDetails.tags?.map(t => t.name).filter(Boolean) || []
        
        // Buscar link a Wikidata en relaciones URL
        let wikidataId = null
        if (mbDetails.relations) {
          const wikidataRel = mbDetails.relations.find(r => 
            r.type === 'wikidata' && r.url?.resource
          )
          if (wikidataRel?.url?.resource) {
            // Extraer Q ID de URL como "https://www.wikidata.org/wiki/Q12345"
            const match = wikidataRel.url.resource.match(/Q\d+/)
            if (match) wikidataId = match[0]
          }
        }
        
        // 3c) Si hay Wikidata, obtener descripción factual corta
        let wikidataDesc = null
        if (wikidataId) {
          try {
            const wdUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`
            const r = await fetch(wdUrl, { 
              headers: { 'User-Agent': UA, 'Accept': 'application/json' } 
            })
            if (r.ok) {
              const wdData = await r.json()
              const entity = wdData.entities?.[wikidataId]
              if (entity) {
                // Preferir español, fallback a inglés
                wikidataDesc = entity.descriptions?.es?.value || 
                              entity.descriptions?.en?.value || 
                              null
              }
            }
          } catch { /* ignore, fallback gracefully */ }
        }
        
        // 3d) Construir bio factual solo con datos presentes (NUNCA inventar)
        const bioParts = []
        
        if (wikidataDesc) {
          // Descripción corta de Wikidata (factual, controlada)
          bioParts.push(wikidataDesc)
        } else if (type || country) {
          // Fallback: construir descripción mínima con datos estructurados
          const typeStr = type === 'Person' ? 'Artist' : 
                         type === 'Group' ? 'Band' : 
                         type || 'Artist'
          const countryStr = country ? ` from ${country}` : ''
          bioParts.push(`${typeStr}${countryStr}`)
        }
        
        // Agregar géneros si están disponibles
        const allGenres = [...new Set([...genres, ...tags])]
        if (allGenres.length > 0) {
          const genreStr = allGenres.slice(0, 3).join(', ')
          bioParts.push(`Genres: ${genreStr}`)
        }
        
        // Solo asignar bio si hay contenido factual
        if (bioParts.length > 0) {
          out.artistBio = bioParts.join(' · ')
        }
        
        // artistDesc: descripción corta para el header (reemplaza Wikipedia "description")
        // El desc de Wikidata es una one-liner factual tipo "Dutch hardstyle DJ"
        if (wikidataDesc) {
          out.artistDesc = wikidataDesc
        } else if (type && country) {
          out.artistDesc = `${type} from ${country}`
        } else if (type) {
          out.artistDesc = type
        }
        
        // Imagen del artista: Wikidata no da imágenes fácilmente, dejar undefined
        // (la UI puede manejar ausencia de imagen gracefully)
      }
    }
    
    // Si no hay match en MusicBrainz o no hay datos suficientes, 
    // dejar artistBio como undefined (NUNCA inventar ni caer a Wikipedia)
  }

  toCache(key, out)
  return out
}
