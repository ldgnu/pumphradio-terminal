# PumphRadio — experimental underground radio terminal

> underground frequencies · broadcasting from nowhere
> Radio online experimental con estética de terminal UNIX / BBS / cyberpunk.

**Live:** <https://ldgnu.github.io/pumphradio-terminal/>

Reproductor de radio underground (hardcore, hardstyle, nujazz, deep techno) con
estética de terminal clandestina. El audio es persistente (nunca se corta al navegar),
trae visualizador Web Audio real, noticias RSS en español y una terminal de comandos
funcional.

---

## ✨ Features

- **Player global persistente** — el `<audio>` es un singleton que nunca se destruye.
- **Visualizador real** (Web Audio API / AnalyserNode) con 5 modos:
  `spectrum`, `oscilloscope`, `waveform`, `ascii`, `bars`.
- **Estaciones data-driven** — se configuran en `data/stations.json`, sin tocar código.
- **Metadata en vivo** — Artist/Track reales del stream (Zeno SSE / ICY).
- **Noticias RSS multi-fuente** en español (traducción con tono de experto), con panel
  lateral estilo tmux y link siempre a la fuente original.
- **Terminal de comandos** (`/`): play, pause, next, station, news, status, whoami, time, signal, help.
- **Boot sequence** saltable, scanlines sutiles, cursor, reloj UTC.
- **Responsive** — optimizado para iPhone/móvil (100dvh, touch targets, sin atajos de teclado en táctil).

---

## 🖥️ Stack

| Capa | Tecnología |
|------|-----------|
| Build | Vite (vanilla JS, ES modules, cero framework) |
| Audio | `Audio` element + Web Audio API (AnalyserNode real vía CORS) |
| Metadata | EventSource SSE de Zeno / parseo ICY |
| Visualizador | Canvas 2D + Web Audio |
| Noticias | RSS agregador build-time (`scripts/fetch-news.mjs`) |
| Deploy | GitHub Pages (Actions) |
| Cero deps runtime | solo Vite en devDependencies |

---

## 🚀 Desarrollo local

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # → dist/
npm run preview      # sirve dist/
```

---

## 📡 Configuración de estaciones (data-driven)

Las estaciones viven en **`data/stations.json`**. Agregar una estación = agregar un objeto.

```jsonc
{
  "id": "deep-techno",
  "num": 4,
  "name": "DEEP TECHNO",
  "freq": "92.4",
  "tagline": "hypnotic · dub · atmospheric · minimal",
  "genres": ["Deep Techno", "Hypnotic Techno", "Dub Techno", "Atmospheric", "Minimal"],
  "subgenres": ["deep", "hypnotic", "dub", "minimal"],
  "streamUrl": "https://stream.zeno.fm/xxxx",        // stream real
  "metadataUrl": "https://api.zeno.fm/mounts/metadata/subscribe/xxxx", // solo si es Zeno
  "metaType": "zeno-sse",     // zeno-sse | icy | none
  "accent": "#7aa2f7",
  "node": "DT-04",
  "bpmHint": 128,
  "scene": ["detroit", "berlin"],
  "enabled": true             // false = aparece pero sin señal
}
```

> `enabled: true` requiere un `streamUrl` real. Mientras no lo tengas, dejalo en `false`
> y la estación queda lista pero desactivada.

**Streams:** hoy solo hay 1 stream real (Zeno). Para activar las demás, pasá el
`streamUrl` + `metadataUrl` de cada una en el JSON.

---

## 📰 Sistema de noticias

- **Fuentes:** `data/feeds.json` (multi-página, actualmente 6: Hard News, Hardstyle-Releases,
  Tecnologiadj(es), FutureMusic(es), Mixmag, Dancing Astronaut).
- **Agregador build-time:** `scripts/fetch-news.mjs` baja los feeds server-side (sin CORS),
  deduplica y clasifica por género → `public/news.json`.
- **Traducción:** `scripts/translate.mjs` traduce los items a español argentino neutro con
  tono de experto. El `news.json` traducido queda commiteado (el build no lo regenera crudo).
- **Renovar + traducir a mano:**

  ```bash
  npm run refresh-news     # = fetch-news + translate
  ```

- **Cron diario (opcional):** se puede programar para que actualice + traduzca + pushee
  automáticamente cada día.

**Regla:** nunca se inventan datos. Cada noticia mantiene su `link` original a la fuente.

---

## ☁️ Deploy + dominio

### GitHub Pages (Actions)
Cada push a `main` compila y deploya a GitHub Pages (workflow en `.github/workflows/deploy.yml`).
El `base` de Vite es `/pumphradio-terminal/` (subpath de Pages).

### Dominio custom (pumphradio.com.ar) + Cloudflare
En Cloudflare (zona `pumphradio.com.ar`), registros **DNS only (nube gris)**:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `www` | `ldgnu.github.io` | ⬜ gris (DNS only) |
| A | `@` | `185.199.108.153` | ⬜ gris |
| A | `@` | `185.199.109.153` | ⬜ gris |
| A | `@` | `185.199.110.153` | ⬜ gris |
| A | `@` | `185.199.111.153` | ⬜ gris |
| TXT | `_github-pages-challenge-<owner>` | (valor de GitHub) | — |

> ⚠️ **Nube gris obligatoria** para que GitHub valide el dominio y emita el certificado TLS.
> Con nube naranja (proxied), GitHub no puede verificar (error "DNS record could not be retrieved").

> 🛡️ **¿Por qué la nube gris no es insegura acá?** El origen es GitHub Pages (público por diseño,
> detrás del CDN Fastly de GitHub) — no hay IP de servidor propio que proteger. HTTPS lo emite
> GitHub igual (cert auto). El proxy de Cloudflare solo tiene sentido para ocultar *tu propia*
> infraestructura; con GitHub Pages es innecesario y además rompe la validación del dominio.


Luego en **GitHub → Settings → Pages** poné el custom domain (`www.pumphradio.com.ar`),
esperá que valide y GitHub emite el cert automáticamente (puede tardar hasta 1h).

---

## ⌨️ Comandos y atajos

**Terminal de comandos** (presioná `/`):

```
play · pause · next
station <id>        (hardcore | hardstyle | nujazz | deep-techno)
news · status · whoami · time · signal · ls
volume <0-100> · help
```

**Atajos de teclado:**

| Tecla | Acción |
|-------|--------|
| `/` | abrir terminal de comandos |
| `1-4` | cambiar de estación |
| `SPACE` | play / pause |
| `V` | cambiar visualizador |
| `N` / `P` | siguiente / anterior estación |
| `↑` / `↓` | subir / bajar volumen |
| `M` | mute |

**Player bar (táctil):** play/pause, prev/next, volumen −/mute/+, `MODE` para el visualizador.

---

## 🗂️ Estructura

```
├── data/
│   ├── stations.json        # CONFIG de estaciones (data-driven)
│   └── feeds.json           # feeds RSS de noticias
├── public/
│   └── news.json            # noticias (fetch + translate)
├── scripts/
│   ├── fetch-news.mjs       # agregador RSS build-time
│   └── translate.mjs        # traducción a español
├── src/
│   ├── main.js              # bootstrap + player bar + visualizer
│   ├── store.js             # estado central (pub/sub)
│   ├── engine/
│   │   ├── audio.js         # player persistente + Web Audio
│   │   └── metadata.js      # parseo "Artist - Track"
│   ├── visualizer/          # analyser.js + index.js (5 modos)
│   ├── news/engine.js       # noticias client-side + pane tmux
│   ├── ui/                  # shell, boot, command, shell.css, fx.css
│   └── css/                 # tokens.css, shell.css, fx.css
└── .github/workflows/deploy.yml
```

---

## 🗺️ Roadmap (PUMPHRADIO_REDESIGN.md)

1. ✅ Core radio + estaciones data-driven + player persistente
2. 🔜 Metadata MusicBrainz + covers (PHASE 2)
3. 🔜 Interfaz TTY completa (PHASE 3)
4. ✅ Visualizador Web Audio multimodo (PHASE 4 parcial)
5. 🔜 Artist intelligence + discovery (PHASE 5)
6. ✅ RSS + Signal Intelligence (PHASE 6 parcial)
7. 🔜 Ambient mode + history + favorites (PHASE 7)
8. 🔜 Polish, performance, mobile (PHASE 8)

---

## 🧩 Diseño

Terminal de estación clandestina: elegante, oscuro, minimalista. Nada de Matrix verde,
nada de cards genéricas, nada de gradients SaaS. Color con significado, tipografía monospace
(JetBrains Mono). Ver `PUMPHRADIO_REDESIGN.md` para el documento completo.

MIT License.
