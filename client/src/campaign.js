// Campaña "Programa Espacial": misiones encadenadas, puntaje de carrera,
// estrellas, rangos y logros. Las funciones de progreso son puras (reciben y
// devuelven el progreso) para poder probarlas; el guardado usa localStorage.
import campaign from '../../data/campaign.json' with { type: 'json' };
import { translatable } from '../../shared/i18n.js';

export const CHAPTERS = campaign.chapters;
export const campaignTitle = () => campaign.title;
const STORAGE_KEY = 'smd-campaign';

export const RANKS = translatable([
  { stars: 0, icon: '🧒', name: 'Cadete espacial' },
  { stars: 3, icon: '🔧', name: 'Técnico de misión' },
  { stars: 8, icon: '👩‍🔧', name: 'Ingeniera/o de vuelo' },
  { stars: 14, icon: '🎧', name: 'Director/a de vuelo' },
  { stars: 20, icon: '🧑‍🚀', name: 'Comandante de la agencia' },
]);

/** Logros: cada uno se revisa con el contexto del resultado recién obtenido. */
export const BADGES = translatable([
  { id: 'first_launch', icon: '🚀', name: 'Primer lanzamiento', desc: 'Simula tu primera misión.', check: (c) => c.kind === 'design' },
  { id: 'success', icon: '✅', name: 'Misión cumplida', desc: 'Completa una misión con éxito.', check: (c) => c.kind === 'design' && c.result.outcome === 'success' },
  { id: 'perfect', icon: '🎯', name: 'Misión perfecta', desc: 'Obtén nota S en una misión.', check: (c) => c.kind === 'design' && c.result.score.grade === 'S' },
  { id: 'thrifty', icon: '💰', name: 'Ahorrador', desc: 'Cumple una misión gastando 70% o menos del presupuesto.', check: (c) => c.kind === 'design' && c.result.outcome === 'success' && c.result.analysis.cost.total <= c.result.analysis.cost.budget * 0.7 },
  { id: 'flawless', icon: '🧰', name: 'Diseño impecable', desc: 'Lanza un diseño sin ningún error crítico.', check: (c) => c.kind === 'design' && c.result.analysis.errors === 0 && c.result.outcome === 'success' },
  { id: 'moon', icon: '🌕', name: 'Huella lunar', desc: 'Aterriza con éxito en la Luna.', check: (c) => c.kind === 'design' && c.missionId === 'moon_water' && c.result.outcome === 'success' },
  { id: 'mars', icon: '🔴', name: 'Llegada a Marte', desc: 'Aterriza con éxito en Marte.', check: (c) => c.kind === 'design' && c.missionId === 'mars_life' && c.result.outcome === 'success' },
  { id: 'fixer', icon: '🛠️', name: 'Ingeniero de fallas', desc: 'Repara una falla desde la cabina.', check: (c) => c.kind === 'explore' && c.faults.some((f) => f.solved) },
  { id: 'fast_fixer', icon: '⚡', name: 'Reparación relámpago', desc: 'Repara una falla en menos de 30 segundos.', check: (c) => c.kind === 'explore' && c.faults.some((f) => f.solved && f.time < 30) },
  { id: 'antenna', icon: '📡', name: 'Antena estrella', desc: 'Planta una antena repetidora de calidad ★★★.', check: (c) => c.kind === 'explore' && c.antennaQ > 0.72 },
  { id: 'ice', icon: '🧊', name: 'Cazador de hielo', desc: 'Envía a la Tierra los datos del hielo lunar.', check: (c) => c.kind === 'explore' && c.sent.includes('ice') },
  { id: 'life', icon: '🦠', name: 'Huellas de vida', desc: 'Envía los datos del antiguo delta de Jezero.', check: (c) => c.kind === 'explore' && c.sent.includes('delta') },
  { id: 'commander', icon: '🧑‍🚀', name: 'Comandante', desc: 'Termina una exploración en nivel Comandante con al menos 1 estrella.', check: (c) => c.kind === 'explore' && c.difficulty === 'commander' && c.stars > 0 },
  { id: 'campaign', icon: '🏆', name: 'Programa completo', desc: 'Gana al menos 1 estrella en los 6 capítulos.', check: (c) => CHAPTERS.every((ch) => (c.progress.missions[ch.mission]?.stars ?? 0) > 0) },
  { id: 'all_stars', icon: '🌟', name: 'Coleccionista de estrellas', desc: 'Consigue 3 estrellas en todos los capítulos.', check: (c) => CHAPTERS.every((ch) => (c.progress.missions[ch.mission]?.stars ?? 0) === 3) },
]);
export const BADGE_POINTS = 100;

export const emptyProgress = () => ({ missions: {}, badges: {}, seen: [] });

export function loadProgress() {
  try { return { ...emptyProgress(), ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; } catch { return emptyProgress(); }
}
export function saveProgress(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}
export function resetProgress() { saveProgress(emptyProgress()); return emptyProgress(); }

/** Un capítulo está disponible si es el primero o si el anterior tiene al menos 1 estrella. */
export function isUnlocked(progress, missionId) {
  const i = CHAPTERS.findIndex((c) => c.mission === missionId);
  if (i <= 0) return true; // primer capítulo o misión fuera de la campaña (modo libre)
  return (progress.missions[CHAPTERS[i - 1].mission]?.stars ?? 0) > 0;
}

export function nextChapter(missionId) {
  const i = CHAPTERS.findIndex((c) => c.mission === missionId);
  return i >= 0 && i < CHAPTERS.length - 1 ? CHAPTERS[i + 1] : null;
}

const explorationPoints = (m) => (m?.exploreScience ?? 0) * 3 + (m?.exploreStars ?? 0) * 50;

export function missionPoints(m) { return (m?.bestScore ?? 0) + explorationPoints(m); }

export function totalStars(progress) {
  return Object.values(progress.missions).reduce((s, m) => s + (m.stars ?? 0) + (m.exploreStars ?? 0), 0);
}

export function careerScore(progress) {
  return Object.values(progress.missions).reduce((s, m) => s + missionPoints(m), 0) + Object.keys(progress.badges).length * BADGE_POINTS;
}

export function rankFor(progress) {
  const stars = totalStars(progress);
  let rank = RANKS[0];
  for (const r of RANKS) if (stars >= r.stars) rank = r;
  const next = RANKS.find((r) => r.stars > stars) ?? null;
  return { ...rank, stars, next };
}

function awardBadges(progress, ctx) {
  const earned = [];
  for (const b of BADGES) {
    if (progress.badges[b.id]) continue;
    if (b.check({ ...ctx, progress })) { progress.badges[b.id] = Date.now(); earned.push(b); }
  }
  return earned;
}

/**
 * Registra un resultado (diseño o exploración). Solo suma puntos si mejora la
 * mejor marca. `key` evita contar dos veces el mismo resultado.
 * Devuelve { progress, gained, newBadges, unlocked, rankUp }.
 */
export function recordResult(prev, ctx) {
  const progress = structuredClone(prev);
  if (ctx.key && progress.seen.includes(ctx.key)) return { progress: prev, gained: 0, newBadges: [], unlocked: null, rankUp: null, repeated: true };
  if (ctx.key) progress.seen = [...progress.seen.slice(-200), ctx.key];
  const before = careerScore(prev);
  const rankBefore = rankFor(prev);
  const unlockedBefore = nextChapter(ctx.missionId) && isUnlocked(prev, nextChapter(ctx.missionId).mission);
  const m = { ...(progress.missions[ctx.missionId] ?? {}) };
  if (ctx.kind === 'design') {
    m.bestScore = Math.max(m.bestScore ?? 0, ctx.result.score.total);
    m.stars = Math.max(m.stars ?? 0, ctx.stars);
    m.bestGrade = m.bestScore === ctx.result.score.total ? ctx.result.score.grade : m.bestGrade;
    m.attempts = (m.attempts ?? 0) + 1;
  } else {
    m.exploreStars = Math.max(m.exploreStars ?? 0, ctx.stars);
    m.exploreScience = Math.max(m.exploreScience ?? 0, ctx.science);
  }
  progress.missions[ctx.missionId] = m;
  const newBadges = awardBadges(progress, ctx);
  const next = nextChapter(ctx.missionId);
  const unlocked = next && !unlockedBefore && isUnlocked(progress, next.mission) ? next : null;
  const rankAfter = rankFor(progress);
  return {
    progress, gained: careerScore(progress) - before, newBadges, unlocked,
    rankUp: rankAfter.name !== rankBefore.name ? rankAfter : null,
  };
}
