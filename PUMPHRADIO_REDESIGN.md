# PUMPHRADIO — REDESIGN

> Underground frequencies · broadcasting from nowhere
> Diseño de la experiencia de radio experimental PumphRadio.
> Terminal UNIX · BBS 90s · tracker · cyberpunk · radio clandestina.

---

## 0. DECISIÓN BASE

El proyecto actual se descarta como base visual. Se conserva **únicamente el stream real
funcional** y se arranca de cero la experiencia.

| Conservar | Descartar |
|---|---|
| Stream Zeno real (`stream.zeno.fm/gpv2kgzwum0uv`) | UI actual (cards, brutalismo industrial genérico) |
| Endpoint metadata SSE Zeno (`e4vzegzwum0uv`) | Estructura Vite v1 hardcodeada por estación |
| Concepto de multi-estaciones | `pumpradio-v2` (Next.js, backend pesado, no desplegado) |

---

## 1. ARQUITECTURA ACTUAL

- **Vite + vanilla JS (ES modules)**, cero runtime deps.
- Archivos: `main.js` (app), `engine.js` (audio), `visualizer.js` (barras simuladas),
  `news.js` (RSS + fallback hardcoded), `stations.js` (config en código), `style.css`.
- Audio: `Audio` element + volumen persistente + reconnect con backoff.
- Metadata: `EventSource` a la API SSE de Zeno → `streamTitle` "Artist - Track".
- Cover: JSONP a Deezer.
- **Problemas encontrados:**
  1. Estaciones **hardcodeadas** en `stations.js` (viola el requisito data-driven).
  2. Solo **1 stream real** (Zeno); las otras estaciones apuntan al mismo stream o placeholders.
  3. Cover vía Deezer = single provider, sin cache, sin enriquecimiento.
  4. Visualizador **simulado** (no reacciona al audio real; Zeno no manda CORS).
  5. Audio no persistente al navegar (es SPA de una vista, pero sin player global real).
  6. Sin capa de metadata (MusicBrainz/Last.fm/Discogs), sin history, sin discovery.
  7. Sin command palette, sin boot, sin modo ambient, sin estética TTY coherente.
  8. Noticias hardcoded + un solo feed RSS.
  9. No hay separación estación → configuración externa.

---

## 2. ARQUITECTURA PROPUESTA

**Vite + vanilla JS (ES modules)** — mismo build system, cero framework.
La razón sigue siendo válida: es una app de estado simple pero con mucho renderizado
asíncrono; un framework agrega peso sin beneficio real. La complejidad se resuelve con
**módulos bien separados** y un **estado central** (`store.js`).

```
pumphradio/
├── index.html
├── vite.config.js
├── data/
│   ├── stations.json          # CONFIG data-driven de estaciones (única fuente de verdad)
│   ├── feeds.json             # feeds RSS
│   └── tips.json              # "did you know" con fuente verificable
├── src/
│   ├── main.js                # bootstrap + boot sequence
│   ├── store.js               # estado global (estación, track, playing, volume)
│   ├── engine/
│   │   ├── audio.js           # player global persistente (Audio element, ICY)
│   │   ├── metadata.js        # parser ICY / SSE → {artist, track, ...}
│   │   └── reconnect.js       # backoff + recovery
│   ├── metadata/
│   │   ├── index.js           # orquestador de providers + cache
│   │   ├── cache.js           # IndexedDB / localStorage cache
│   │   ├── musicbrainz.js     # provider MusicBrainz (releases, artist, covers)
│   │   ├── lastfm.js          # provider Last.fm (fallback)
│   │   ├── discogs.js         # provider Discogs (opcional, requiere token)
│   │   └── coverart.js        # Cover Art Archive
│   ├── intelligence/
│   │   ├── artist.js          # ./artist --info (MusicBrainz artist + release-group)
│   │   └── discover.js        # ./discover (related artists vía MusicBrainz tags)
│   ├── ui/
│   │   ├── shell.js           # layout terminal, render now-transmitting
│   │   ├── boot.js            # secuencia de arranque
│   │   ├── command.js         # command palette (pumphradio >)
│   │   ├── views/
│   │   │   ├── nowplaying.js
│   │   │   ├── artist.js
│   │   │   ├── discover.js
│   │   │   ├── news.js
│   │   │   ├── network.js     # ./network map
│   │   │   ├── ambient.js     # ./ambient
│   │   │   ├── history.js     # ./history
│   │   │   └── favorites.js   # ♥
│   │   └── toggles.js         # cover / ascii / data
│   ├── visualizer/
│   │   ├── index.js           # orquesta modos
│   │   ├── analyser.js        # Web Audio AnalyserNode (cuando hay CORS) + sintetizador
│   │   ├── spectrum.js        # barras de frecuencia
│   │   ├── oscilloscope.js
│   │   ├── waveform.js
│   │   ├── ascii.js           # ASCII spectrum (Unicode blocks)
│   │   └── bars.js            # terminal bars (fallback simulado, NO fake en play)
│   ├── news/
│   │   ├── engine.js          # agregador RSS
│   │   ├── feeds.js           # clasificación por género
│   │   └── tips.js
│   └── css/
│       ├── tokens.css         # DESIGN SYSTEM
│       ├── shell.css          # layout terminal
│       ├── views.css
│       └── fx.css             # scanlines, cursor, glitch, transiciones
```

**Principios:**
- Las estaciones viven en `data/stations.json` — agregar una estación = editar JSON, no tocar código.
- El **estado central** (`store.js`) es la única fuente de verdad; la UI se suscribe.
- El audio vive en un **singleton global** (module scope) → nunca se detiene al cambiar de vista.
- Cada capa (engine / metadata / news / visualizer) es **reemplazable** (providers/adapters).

---

## 3. DISEÑO VISUAL

**Estética:** terminal de una estación clandestina. Elegante, oscuro, minimalista, raro.
Nada de Matrix verde, nada de cards genéricas, nada de gradients SaaS.

**Atmósfera (copy de identidad):**
```
PUMPHRADIO
underground frequencies
broadcasting from nowhere
```

**Términos de interfaz:** `CONNECTING...`, `STREAM LOCKED`, `BUFFER 100%`,
`SIGNAL 98%`, `NOW TRANSMITTING`, `FREQUENCY`, `NODE`, `UPTIME`, `CODEC`, `BITRATE`.

**Design tokens (`tokens.css`):** CSS custom properties, color con significado.
```
--bg          fondo           #0a0a0c
--fg          texto           #c8c8c8  (gris cálido, no blanco puro)
--dim         texto atenuado  #565656
--accent      acento          #d4ff00 / variable por estación (muy sutil)
--warning     warning         #ffb454
--error       error           #ff5f56
--signal      señal/ok        #5fd7af
--border      bordes          #26262b
```
- **Tipografía:** monospace. `IBM Plex Mono` / `JetBrains Mono` / `Geist Mono` (self-hosted o Google Fonts con fallback `monospace`).
- **Pocos colores.** El acento por estación cambia MUY sutilmente (un solo hue), manteniendo el sistema.
- **Layout:** estructura tipo TTY: cabecera de sistema, panel `NOW TRANSMITTING`, línea de comando abajo, scanlines sutiles.

---

## 4. ARQUITECTURA DEL AUDIO

- **Player global persistente** (singleton): el `<audio>` vive a nivel módulo, fuera de cualquier vista.
- Cambiar de vista **nunca** recrea el audio.
- **ICY metadata:** parsear `icy-metaint` y los headers `icy-*` cuando el stream lo permita;
  para Zeno, usar el **EventSource SSE** (`api.zeno.fm/mounts/metadata/subscribe/...`) que ya funciona.
- Normalizar `"Artist - Track"` → `{ artist, track }`.
- **Enriquecimiento:** el `streamTitle` es el punto de partida → capa metadata (sección 5).
- **Reconnect:** backoff exponencial + recrear elemento audio (ya validado en v1).
- **Elapsed time:** no aplica a un stream en vivo (no hay seek); se muestra `elapsed` desde que
  la canción actual empezó a sonar, junto a la duración del release cuando la metadata lo da.

**Visualizer y CORS:** Zeno no manda CORS → el `AnalyserNode` no recibe audio real.
**Solución en dos capas:**
1. Si el stream manda CORS (`crossOrigin=anonymous` OK) → análisis real con `AnalyserNode`.
2. Si no (Zeno), usar el **Visualizer API** del browser (si está disponible) **o** un
   sintetizador de debug NO audible que alimenta al AnalyserNode con señal real del DOM,
   manteniendo la física del visualizador sincronizada. La metadata del stream
   (BPM estimado del género, envolvente de metadata) da la base de ritmo.
   **Nunca** una animación "fake" que no reaccione: si no hay señal real, el visualizador
   muestra idle/scanline, no barras falsas.

---

## 5. ARQUITECTURA DE METADATA

**Capa de enriquecimiento con providers/adapters:**

```
metadata/
├── index.js       # orquesta: normalizar → buscar → resolver → cachear → mostrar
├── cache.js       # IndexedDB (persistente) + Map en memoria; TTL
├── musicbrainz.js # API MusicBrainz (artista, release-group, release) — principal
├── coverart.js    # Cover Art Archive (portada por release MBID)
├── lastfm.js      # fallback (artist info, tags, similar) — requiere API key
└── discogs.js     # opcional — requiere token
```

**Flujo al cambiar canción:**
1. Obtener `Artist + Track` del stream.
2. Normalizar nombres (trim, caso, remover "(Extended Mix)" etc. de forma conservadora).
3. Buscar en **MusicBrainz** (`/ws/2/recording/?query=artist:"X" AND recording:"Y"`).
4. Resolver la mejor coincidencia (score + filtro por artista).
5. Cachear resultado (IndexedDB) → no reconsultar.
6. Mostrar metadata enriquecida: ARTIST, TRACK, RELEASE, YEAR, LABEL, GENRE, SUBGENRE,
   BITRATE, CODEC, portada (Cover Art Archive).
7. Registrar la **fuente** de cada dato (MusicBrainz URL) — mostrar discretamente.

**Regla dura:** los datos vienen de las APIs. **NO se inventa información con IA.**
Todo dato mostrado tiene URL de fuente.

---

## 6. SISTEMA DE ESTACIONES (DATA-DRIVEN)

`data/stations.json`:
```json
{
  "id": "deep-techno",
  "num": 4,
  "name": "DEEP TECHNO",
  "freq": "92.4",
  "genres": ["Deep Techno", "Hypnotic Techno", "Dub Techno", "Minimal", "Atmospheric"],
  "subgenres": ["raw", "hypnotic", "dub", "minimal"],
  "streamUrl": "https://...",
  "metadataUrl": "https://...",        // SSE o endpoint metadata
  "metaType": "zeno-sse" | "icy" | "none",
  "accent": "#7aa2f7",                  // tinte sutil
  "node": "DEEP-TECHNO",
  "bpmHint": 128,
  "scene": ["detroit", "berlin", "dub"],
  "enabled": true
}
```
- Agregar estación = agregar objeto JSON. Sin tocar código.
- El `accent` por estación es un solo hue que tiñe la identidad sin romper el sistema.
- Las 4 estaciones objetivo: HARDCORE, HARDSTYLE, NUJAZZ, DEEP TECHNO.

**Estado actual de streams:** solo existe 1 stream real (Zeno mix). PHASE 1 lo usa como
estación semilla (HARDCORE o una "MULTI"). Las demás se activan cuando se provean URLs
(Zeno/Icecast) o se configuren en el account de Zeno.

---

## 7. RSS / NEWS ENGINE

- Agregador interno: `feeds.json` con `{ name, url, genres, priority, enabled }`.
- Backend (o worker en el cliente) consulta periódicamente los feeds.
- Normalizar → `{ title, description, date, source, url, image, tags }`.
- **Dedupe** por URL/título.
- **Clasificar** cada noticia por género (match por keywords + categoría del feed).
- Mostrar solo lo relevante a la estación actual (`./news --station deep-techno`).
- **Verificar que el feed exista** antes de integrarlo (probe HEAD/GET) — no asumir.
- `tips.json`: "DID YOU KNOW?" con `{ text, source, url }` verificables.

---

## 8. VISUALIZER

Modos:
- `SPECTRUM` — barras de frecuencia (AnalyserNode real cuando hay CORS).
- `OSCILLOSCOPE` — time-domain wave.
- `WAVEFORM` — onda suavizada.
- `TERMINAL BARS` — barras con bloques Unicode.
- `ASCII SPECTRUM` — frecuencias por fila (63Hz, 125, 250...).
```
63Hz  ▂▃▅▇████
125   ▂▄▆█████
...
```
- **Debe reaccionar al audio real.** Si no hay señal real disponible (CORS), el
  visualizador cae a idle/scanline; no animación fake (ver sección 4).
- Animaciones con `requestAnimationFrame`; rendimiento primero.

---

## 9. MOBILE

- No replicar la terminal desktop en pantalla chica.
- Vista mobile específica: STATION, ARTIST, TRACK, COVER, VISUALIZER + swipe lateral
  (INFO / DISCOVER / NEWS / HISTORY).
- Player siempre accesible (barra inferior fija).
- Se siente casi como app nativa (PWA, viewport correcto, touch).
- Fullscreen disponible.

---

## 10. PHASES / ROADMAP

**PHASE 1 — Core radio + estaciones + player persistente.**
Scaffold del proyecto, `stations.json` data-driven, store central, audio engine
persistente con metadata ICY/SSE, shell terminal base, boot sequence, command palette
básica (play/pause/next/station), responsive mínimo.

**PHASE 2 — Metadata MusicBrainz + covers.**
Providers + cache, enriquecimiento del `streamTitle`, `NOW TRANSMITTING` completo
(ARTIST/TRACK/RELEASE/YEAR/LABEL/GENRE), portada (Cover Art Archive), toggle cover/ascii/data.

**PHASE 3 — Nueva interfaz TTY completa.**
Shell refinado, vistas (nowplaying, news, history, network, ambient), scanlines sutiles,
cursor, glitch ocasional, transiciones tipo terminal.

**PHASE 4 — Visualizer + animaciones.**
Web Audio analyser (cuando hay CORS) + todos los modos + ASCII spectrum + signal meter.

**PHASE 5 — Artist intelligence + discovery.**
`./artist --info` (MusicBrainz: country, active, labels, aliases, discography, related),
`./discover` (IF YOU LIKE THIS SIGNAL → artistas relacionados), RAM (datos curiosos con fuente).

**PHASE 6 — RSS + Signal Intelligence.**
Agregador RSS completo, clasificación por género, noticias por estación, tips verificables.

**PHASE 7 — Ambient mode + history + favorites.**
`./ambient` (UI parcial, fullscreen), `./history` (local), `♥` favorites (localStorage/IndexedDB).

**PHASE 8 — Polish, performance, mobile.**
Optimización, Safari iOS, responsive nativo, accesibilidad, pulido general.

---

## 11. DETALLES EXPERIMENTALES (mantener bajo control)

- ASCII album art dinámico (dithering/monochrome).
- Fake terminal filesystem navegable (`./explore`, easter eggs).
- Reloj UTC, uptime de escucha, contador de tracks, país del artista, catálogo del release.
- `signal quality`, `./network` mapamundi ASCII, modo CRT opcional, random underground station.
- **Regla:** cada feature tiene que aportar. Nada de gimmicks que llenen la pantalla.

## PRINCIPIO CENTRAL

La radio es el punto de entrada; el producto es
**MÚSICA + DESCUBRIMIENTO + CULTURA + TERMINAL**. Que parezca software encontrado en
una computadora conectada a una red musical underground desconocida.
