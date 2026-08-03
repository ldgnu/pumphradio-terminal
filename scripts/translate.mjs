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

// key = fragmento único del título original
const T = {
  // HARD NEWS (neerlandés)
  'Spotgoedkope TicketSwap-tickets': {
    title: 'El reinado de las entradas baratas en TicketSwap podría estar llegando a su fin',
    summary: 'Si en los últimos años solías esperar hasta las últimas horas previas a un festival para cazar una entrada barata en TicketSwap, malas noticias: esa costumbre podría quedar en el pasado. La plataforma de reventa entre usuarios evalúa cambios que afectarían de lleno al bolsillo del fan que compra sobre la hora.',
  },
  'Pat B scoort Tomorrowland-hit': {
    title: 'Pat B consigue el hit de Tomorrowland junto a Dimitri Vegas: “Turn The Tide”',
    summary: 'El DJ y productor Pat B alcanzó un hito llamativo en Tomorrowland 2026. Su colaboración con Dimitri Vegas y Sylver —“Turn The Tide”— se convirtió en una de las piezas más coreadas del festival, consolidando un cruce interesante entre la escena hardstyle y el mainstage global.',
  },
  'Unresolved onthult volledige line-up': {
    title: 'Unresolved revela el line-up completo de su Origins-special',
    summary: 'Unresolved, en colaboración con Origins, destapó el line-up de su Artist Special. El Autotron queda íntegramente dedicado a su universo sonoro, con una alineación que promete una experiencia pensada de principio a fin para los seguidores del productor.',
  },
  'Hardstyle maakt steeds meer indruk': {
    title: 'El hardstyle impone cada vez más presencia en Tomorrowland',
    summary: 'La última edición de Tomorrowland mostró un hardstyle más presente que nunca. Uno de los momentos altos fue el set que rompió los esquemas del escenario principal, señal de que el género ya no es un nicho: se está convirtiendo en parte del ADN del festival.',
  },
  'Hardstyle als verbindende factor': {
    title: 'El hardstyle como factor de unión: Matrixx y Classified arman juntos el cierre',
    summary: 'Tras el clima tenso de Matrixx At The Park de esta semana, la última noche de las Vierdaagsefeesten tendrá un cierre con un nuevo enfoque: Matrixx y Classified organizan juntos el evento final, usando el hardstyle como punto de encuentro para la escena.',
  },
  'Burgemeester over afgelast Defqon.1': {
    title: 'El alcalde de Dronten rompe el silencio tras la cancelación de Defqon.1: “Los hospitales ya estaban al límite”',
    summary: 'Un mes después de la cancelación de Defqon.1, el alcalde de Dronten, Jean Paul Gebben, se pronunció sobre la decisión. En su balance, la presión sobre el sistema sanitario local fue determinante: “los hospitales ya estaban al límite” antes de tomar la medida.',
  },
  'Vroeger Was Alles Beter unlockt': {
    title: 'Vroeger Was Alles Beter destapa el line-up de The Next Level In Classics',
    summary: 'El colectivo de eventos classics Vroeger Was Alles Beter dio a conocer la alineación de The Next Level In Classics. Una propuesta que apunta directo a la nostalgia de la escena, con nombres que definieron el sonido de los 2000.',
  },
  'Lekkerfaces tovert': {
    title: 'Lekkerfaces saca de la galera el line-up de LET’S GET HYPER',
    summary: 'Lekkerfaces presentó la alineación de su fiesta LET’S GET HYPER, apostando fuerte por el uptempo y el hardcore más acelerado. Una selección que busca llevar la energía de la escena al límite en cada set.',
  },
  'Nick van Reignite Festival': {
    title: 'Nick, la cabeza de Reignite Festival: “Podíamos seguir hablando de esto o simplemente hacerlo”',
    summary: 'El fundador de Reignite Festival reflexiona sobre cómo pasó de la idea al hecho: en vez de seguir discutiendo la propuesta, decidieron ponerla en marcha. Una mirada sincera al costado de gestión y determinación detrás de un festival independiente.',
  },
  'Dr Donk brengt ZAAGSTEP': {
    title: 'Dr Donk lleva el ZAAGSTEP al Bootshaus con un show exclusivo de su álbum',
    summary: 'Dr Donk aterriza en el Bootshaus de Colonia con una presentación exclusiva dedicada a su disco ZAAGSTEP. El show promete repasar su sonido más áspero y experimental, en un club que ya es referencia del techno y el hard techno alemán.',
  },
  'Dominator trapt af': {
    title: 'Dominator arranca a pleno sol con un hosting demoledor',
    summary: 'El festival de hardcore más grande de los Países Bajos abrió su edición bajo un sol radiante y con hosts que pusieron la vara muy alta desde el primer momento. Un arranque que marca el tono de todo el fin de semana.',
  },
  'REBELLiON Indoor onthult': {
    title: 'REBELLiON Indoor presenta un programa cargado de battles exclusivas y shows en vivo',
    summary: 'REBELLiON Indoor destapó la programación de su edición indoor, con un line-up que incluye battles exclusivas y actos en vivo que escapan a la fórmula habitual del DJ set. Una propuesta para los que buscan algo más que un lineup convencional.',
  },

  // MIXMAG (inglés)
  'New music on our radar': {
    title: 'Novedades en el radar esta semana: Aphex Twin, JAZZWRLD, Carré',
    summary: 'El repaso semanal de Mixmag a lo que suena fuerte: desde el regreso del legendario Aphex Twin hasta las propuestas más frescas del jazz electrónico con JAZZWRLD y Carré. Una selección para ampliar el radar.',
  },
  'Festival line-ups you might have missed': {
    title: 'Line-ups de festivales que quizá te perdiste: Beyond The Valley, Desert Hearts, Brave! Factory',
    summary: 'Tres festivales que pasaron de largo y vale la pena revisar: Beyond The Valley, Desert Hearts y Brave! Factory. Una guía rápida de las alineaciones para planificar la próxima temporada de festivales.',
  },
  'BBC Radio 6 launches show': {
    title: 'BBC Radio 6 estrena un programa dedicado al rave negro británico',
    summary: 'BBC Radio 6 lanza un espacio que celebra el legado del rave negro británico, una corriente clave en la historia de la música de baile que durante años quedó relegada. Un reconocimiento necesario a una escena fundacional.',
  },
  'Massive Attack investigated': {
    title: 'Investigan a Massive Attack por una proyección pro-Palestina en su show de Singapur',
    summary: 'El dúo de Bristol es investigado tras exhibir una proyección con mensaje pro-Palestina durante su presentación en Singapur, en un contexto donde el país mantiene restricciones estrictas sobre ese tipo de expresiones políticas.',
  },
  'fabric shares line-up': {
    title: 'fabric presenta el line-up de su aniversario de 30 horas',
    summary: 'El club londinense fabric armó una celebración de 30 horas ininterrumpidas de música y ya soltó la alineación. Una maratón que reúne a nombres clave del techno y house que definieron la identidad del club.',
  },
  'Ministry of Sound to celebrate 35th': {
    title: 'Ministry of Sound festeja 35 años con un evento de todo un fin de semana',
    summary: 'El icónico club londinense celebrará su 35 aniversario con un evento que se extiende todo el fin de semana, repasando tres décadas y media de historia de la música de baile en su templo original.',
  },
  'When the Fugees conquered': {
    title: 'Del archivo: cuando los Fugees conquistaron el hip hop con un porro y una sonrisa',
    summary: 'Una mirada retrospectiva al momento en que los Fugees rompieron todos los esquemas del hip hop mainstream, con un disco que mezcló soul, reggae y rap en un cóctel que se volvió inmortal.',
  },
  'New documentary charts the legacy of Love Parade': {
    title: 'Un nuevo documental repasa el legado de la Love Parade de Berlín',
    summary: 'Un documental reconstruye la historia de la Love Parade de Berlín, el desfile que se convirtió en el símbolo de la cultura rave europea y del movimiento techno tras la caída del muro.',
  },
  'Massachusetts happy hour ban': {
    title: 'Massachusetts quiere levantar la prohibición del happy hour para impulsar la noche',
    summary: 'Legisladores de Massachusetts proponen eliminar la vieja prohibición del happy hour, una medida que busca revitalizar la actividad nocturna y la economía de bares y clubes en el estado.',
  },
  'Tomorrowland appeals for return of painting': {
    title: 'Tomorrowland pide la devolución de un cuadro robado durante el festival',
    summary: 'La organización de Tomorrowland apela a la comunidad para recuperar una pintura que fue sustraída durante la edición de este año, y pide colaboración para dar con su paradero.',
  },
  'legacy of Berlin': {
    title: 'Un nuevo documental repasa el legado de la Love Parade de Berlín',
    summary: 'Un documental reconstruye la historia de la Love Parade de Berlín, el desfile que se convirtió en el símbolo de la cultura rave europea y del movimiento techno tras la caída del muro.',
  },
  'Massachusetts lawmakers': {
    title: 'Massachusetts quiere levantar la prohibición del happy hour para impulsar la noche',
    summary: 'Legisladores de Massachusetts proponen eliminar la vieja prohibición del happy hour, una medida que busca revitalizar la actividad nocturna y la economía de bares y clubes en el estado.',
  },
  'Campaign launched to lift restrictions on Bristol': {
    title: 'Lanzan una campaña para relajar las restricciones a los clubes y bares de Bristol',
    summary: 'Un movimiento ciudadano impulsa una campaña para flexibilizar las restricciones que pesan sobre la vida nocturna de Bristol, defendiendo el valor cultural y económico de su escena de clubes.',
  },
  'Major and independent record labels set out chart': {
    title: 'Grandes y pequeños sellos fijan principios para la música hecha con IA en los rankings',
    summary: 'Discográficas mayores e independientes se pusieron de acuerdo en una serie de principios para regular cómo la música generada con IA puede entrar en los rankings y listas de ventas.',
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
