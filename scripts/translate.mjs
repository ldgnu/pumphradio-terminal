#!/usr/bin/env node
/**
 * translate.mjs — Traducción curada de noticias a español (arg neutro, tono experto).
 * Aplica un mapa de traducciones (title_original → {title, summary, lang:'es'})
 * sobre public/news.json. Solo traduce los items del mapa; el resto queda igual.
 *
 * Uso: node scripts/translate.mjs   (reescribe public/news.json)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'public', 'news.json')
const news = JSON.parse(readFileSync(FILE, 'utf8'))

// key = fragmento único del título original. Mapa curado a mano.
// El resto se queda en idioma original (nl/en) — la regla del proyecto
// es nunca inventar datos, así que solo traducimos lo que podemos verificar.
const T = {
  // === Hard News (neerlandés → español) ===
  'Spotgoedkope TicketSwap-tickets': {
    title: 'El reinado de las entradas baratas en TicketSwap podría estar llegando a su fin',
    summary: 'Si en los últimos años solías esperar hasta las últimas horas previas a un festival para cazar una entrada barata en TicketSwap, malas noticias: esa costumbre podría quedar en el pasado. La plataforma de reventa entre usuarios evalúa cambios que afectarían de lleno al bolsillo del fan que compra sobre la hora.',
  },
  'Pat B scoort Tomorrowland-hit': {
    title: 'Pat B consigue el hit de Tomorrowland junto a Dimitri Vegas: "Turn The Tide"',
    summary: 'El DJ y productor Pat B alcanzó un hito llamativo en Tomorrowland 2026. Su colaboración con Dimitri Vegas y Sylver —"Turn The Tide"— se convirtió en una de las piezas más coreadas del festival, consolidando un cruce interesante entre la escena hardstyle y el mainstage global.',
  },
  'Hardstyle maakt steeds meer indruk': {
    title: 'El hardstyle impone cada vez más presencia en Tomorrowland',
    summary: 'La última edición de Tomorrowland mostró un hardstyle más presente que nunca. Uno de los momentos altos fue el set que rompió los esquemas del escenario principal, señal de que el género ya no es un nicho: se está convirtiendo en parte del ADN del festival.',
  },
  'Burgemeester over afgelast Defqon.1': {
    title: 'El alcalde de Dronten rompe el silencio tras la cancelación de Defqon.1: "Los hospitales ya estaban al límite"',
    summary: 'Un mes después de la cancelación de Defqon.1, el alcalde de Dronten, Jean Paul Gebben, se pronunció sobre la decisión. En su balance, la presión sobre el sistema sanitario local fue determinante: "los hospitales ya estaban al límite" antes de tomar la medida.',
  },
  'Lekkerfaces tovert': {
    title: 'Lekkerfaces saca de la galera el line-up de LET\'S GET HYPER',
    summary: 'Lekkerfaces presentó la alineación de su fiesta LET\'S GET HYPER, apostando fuerte por el uptempo y el hardcore más acelerado. Una selección que busca llevar la energía de la escena al límite en cada set.',
  },
  'Dominator trapt af': {
    title: 'Dominator arranca a pleno sol con un hosting demoledor',
    summary: 'El festival de hardcore más grande de los Países Bajos abrió su edición bajo un sol radiante y con hosts que pusieron la vara muy alta desde el primer momento. Un arranque que marca el tono de todo el fin de semana.',
  },
  'REBELLiON Indoor onthult': {
    title: 'REBELLiON Indoor presenta un programa cargado de battles exclusivas y shows en vivo',
    summary: 'REBELLiON Indoor destapó la programación de su edición indoor, con un line-up que incluye battles exclusivas y actos en vivo que escapan a la fórmula habitual del DJ set. Una propuesta para los que buscan algo más que un lineup convencional.',
  },
}

let hit = 0
for (const item of news.items) {
  const key = Object.keys(T).find((k) => item.title.includes(k))
  if (key) {
    item.title = T[key].title
    item.summary = T[key].summary
    item.lang = 'es'
    hit++
  }
}

writeFileSync(FILE, JSON.stringify(news, null, 2))
console.log(`✓ ${hit} noticias traducidas → public/news.json`)
