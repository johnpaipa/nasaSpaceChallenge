// Guía del jugador: convierte el análisis técnico en pasos sencillos
// ("Plan de vuelo") que cualquiera, incluso un niño, pueda seguir.
import { t, translatable } from '../../shared/i18n.js';

/** Devuelve la lista ordenada de pasos con su estado y una explicación simple. */
export function flightPlan(design, a) {
  const relevant = a.science.instruments.filter((s) => s.relevance >= 0.66).length;
  const massOk = a.mass.internal <= a.mass.structureCapacity && design.instruments.length <= a.parts.structure.max_instruments;
  const launchOk = a.mass.launchCapacity > 0 && a.mass.total <= a.mass.launchCapacity;
  const propOk = a.parts.propulsion.level >= a.parts.orbit.requires_propulsion_level;

  const steps = [
    {
      id: 'instruments', tab: 'science', done: relevant > 0,
      title: 'Elige instrumentos para tu misión',
      text: 'Ve a 🔬 Ciencia y escoge instrumentos con estrellas ★★★: son los que ayudan a tu objetivo. Los que dicen "no aporta" solo gastan dinero y energía.',
    },
    {
      id: 'orbit', tab: 'planner', done: a.science.orbitFit === 1,
      title: 'Escoge una buena órbita',
      text: t('La órbita es el "camino" que recorre tu satélite alrededor de la Tierra. Para esta misión te recomiendo: {orbits}.', { orbits: a.mission.preferred_orbits.map(orbitName).join(t(' o ')) }),
    },
    {
      id: 'propulsion', tab: 'spacecraft', done: propOk, hidden: a.parts.orbit.requires_propulsion_level === 0,
      title: 'Ponle motor si vas lejos',
      text: 'Para llegar a órbitas muy lejanas (geoestacionaria o L1) el cohete no basta: tu satélite necesita su propio motor. En 🛰️ Nave elige Hidracina.',
    },
    {
      id: 'rover', tab: 'spacecraft', done: a.parts.mobility.id !== 'none', hidden: !a.parts.orbit.surface,
      title: 'Lleva un rover para explorar',
      text: 'Vas a aterrizar en otro mundo. En 🛰️ Nave, sección Movilidad, elige un rover: así podrás manejarlo y visitar los lugares más interesantes.',
    },
    {
      id: 'power', tab: 'spacecraft', done: a.power.generation >= a.power.consumption,
      title: 'Dale energía suficiente',
      text: t('Tus equipos gastan {use} W y tus paneles solares dan {gen} W. En 🛰️ Nave elige paneles más grandes o quita instrumentos que gasten mucho.', { use: Math.round(a.power.consumption), gen: Math.round(a.power.generation) }) + (a.parts.orbit.body === 'mars' ? ' ' + t('En Marte llega poca luz: ¡un RTG nuclear funciona hasta de noche!') : ''),
    },
    {
      id: 'battery', tab: 'spacecraft', done: a.power.batteryUsable >= a.power.eclipseEnergy,
      title: 'Batería para la noche',
      text: 'Cuando el satélite pasa por la sombra de la Tierra no le llega luz del Sol. ¡Necesita una batería más grande para no apagarse! Cámbiala en 🛰️ Nave.',
    },
    {
      id: 'data', tab: 'comms', done: a.data.delivered >= 0.9,
      title: 'Envía tus datos a la Tierra',
      text: 'Tus instrumentos toman más fotos y datos de los que tu radio puede enviar. En 📡 Comunicaciones elige una radio más rápida (Banda X o Ka).',
    },
    {
      id: 'mass', tab: 'spacecraft', done: massOk,
      title: 'Que todo quepa en la nave',
      text: 'Llevas demasiadas cosas para el tamaño de tu satélite. En 🛰️ Nave escoge una estructura más grande o quita instrumentos.',
    },
    {
      id: 'launcher', tab: 'planner', done: launchOk,
      title: 'Elige un cohete que pueda llevarte',
      text: 'Tu satélite pesa demasiado para ese cohete, o el cohete no llega tan lejos. En 🧭 Misión elige uno que diga "kg a esta órbita" con un número mayor al peso de tu nave.',
    },
    {
      id: 'lifetime', tab: 'planner', done: a.time.lifetime >= a.time.minLifetime,
      title: t('Que dure al menos {n} años', { n: a.time.minLifetime }),
      text: 'Tu misión necesita funcionar varios años. En 🧭 Misión mueve la barra de vida útil. Si la órbita es muy baja, el satélite cae pronto: ponle un motor pequeño (gas frío).',
    },
    {
      id: 'budget', tab: 'planner', done: a.cost.total <= a.cost.budget,
      title: 'No te pases del dinero',
      text: t('Tu misión cuesta {cost} millones y tienes {budget}. Prueba un cohete más barato (el viaje compartido es el más económico) o quita instrumentos caros.', { cost: Math.round(a.cost.total), budget: a.cost.budget }),
    },
  ];
  return steps.filter((s) => !s.hidden).map((s) => ({ ...s, title: t(s.title), text: t(s.text) }));
}

const ORBIT_NAMES = { leo_400: 'LEO baja', sso_700: 'Heliosíncrona', geo: 'Geoestacionaria', l1: 'Punto L1', moon_surface: 'Superficie lunar', mars_surface: 'Superficie de Marte' };
const orbitName = (id) => t(ORBIT_NAMES[id] || id);

/** Estrellas según la nota: así un niño entiende rápido si ganó. */
export const starsFor = (grade, outcome) =>
  outcome !== 'success' && outcome !== 'lost' ? 0 : ({ S: 3, A: 3, B: 2, C: 1 }[grade] || 0);

export const TUTORIAL = translatable([
  {
    icon: '🚀',
    title: '¡Bienvenido, ingeniero espacial!',
    text: 'Vas a diseñar un satélite de verdad. Tu trabajo: que cumpla su misión (por ejemplo, encontrar incendios) sin gastar más dinero del que tienes.',
  },
  {
    icon: '🧩',
    title: 'Todo está conectado',
    text: 'Cada pieza ayuda… pero también pesa, gasta energía y cuesta dinero. Si agregas una cámara más, quizás necesites paneles solares más grandes. ¡Ese es el reto!',
  },
  {
    icon: '🚦',
    title: 'Mira los colores',
    text: 'A la derecha están las barras de recursos. Verde = todo bien. Amarillo = cuidado. Rojo = ¡problema! Antes de lanzar, intenta que no haya nada en rojo.',
  },
  {
    icon: '🤖',
    title: 'Sigue a Orbi y tu Plan de vuelo',
    text: 'Orbi, tu copiloto, te dirá qué hacer en cada momento. Completa los pasos del Plan de vuelo hasta que todos estén en ✅ y luego pulsa "Simular misión".',
  },
  {
    icon: '⭐',
    title: 'Gana estrellas',
    text: '⭐ = la misión funcionó. ⭐⭐ = buena misión. ⭐⭐⭐ = ¡misión excelente! Si fallas, no pasa nada: lee qué salió mal, cambia tu diseño y vuelve a intentarlo.',
  },
]);
