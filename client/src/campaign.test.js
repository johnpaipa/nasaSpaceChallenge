import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../../shared/engine.js';
import { defaultDesign } from '../../shared/state.js';
import { CHAPTERS, emptyProgress, isUnlocked, recordResult, careerScore, rankFor, nextChapter } from './campaign.js';

const goodWildfire = { ...defaultDesign(), comms: 'x_band', instruments: ['thermal_ir', 'multispectral'] };
const design = (missionId, result, stars, key = String(Math.random())) => ({ kind: 'design', missionId, result, stars, key });

test('solo el primer capítulo empieza desbloqueado', () => {
  const p = emptyProgress();
  assert.ok(isUnlocked(p, CHAPTERS[0].mission));
  assert.ok(!isUnlocked(p, CHAPTERS[1].mission));
  assert.ok(isUnlocked(p, 'sandbox'), 'el modo libre siempre está abierto');
});

test('ganar estrellas desbloquea el siguiente capítulo y da puntos y logros', () => {
  const r = simulate(goodWildfire, 'wildfire', 7);
  assert.equal(r.outcome, 'success');
  const out = recordResult(emptyProgress(), design('wildfire', r, 2));
  assert.equal(out.unlocked?.mission, 'disaster');
  assert.ok(isUnlocked(out.progress, 'disaster'));
  assert.ok(out.gained >= r.score.total, 'suma el puntaje de la misión');
  assert.ok(out.newBadges.some((b) => b.id === 'first_launch'));
});

test('repetir un resultado igual o peor no suma puntos de misión', () => {
  const r = simulate(goodWildfire, 'wildfire', 7);
  const first = recordResult(emptyProgress(), design('wildfire', r, 2));
  const worse = { ...r, score: { ...r.score, total: r.score.total - 100 } };
  const again = recordResult(first.progress, design('wildfire', worse, 1));
  assert.equal(again.gained, 0);
  assert.equal(again.progress.missions.wildfire.stars, 2, 'conserva la mejor marca');
});

test('el mismo resultado no se cuenta dos veces', () => {
  const r = simulate(goodWildfire, 'wildfire', 7);
  const first = recordResult(emptyProgress(), design('wildfire', r, 2, 'k1'));
  const dup = recordResult(first.progress, design('wildfire', r, 2, 'k1'));
  assert.ok(dup.repeated);
  assert.equal(careerScore(dup.progress), careerScore(first.progress));
});

test('la exploración da estrellas, puntos y logros propios', () => {
  const ctx = { kind: 'explore', missionId: 'moon_water', stars: 3, science: 100, sent: ['ice', 'frost'], faults: [{ solved: true, time: 20 }], antennaQ: 0.8, difficulty: 'commander', key: 'e1' };
  const out = recordResult(emptyProgress(), ctx);
  const ids = out.newBadges.map((b) => b.id);
  for (const id of ['ice', 'fixer', 'fast_fixer', 'antenna', 'commander']) assert.ok(ids.includes(id), id);
  assert.ok(out.gained > 0);
});

test('los rangos suben con las estrellas', () => {
  let p = emptyProgress();
  assert.equal(rankFor(p).name, 'Cadete espacial');
  for (const ch of CHAPTERS) p.missions[ch.mission] = { stars: 3, bestScore: 900 };
  assert.equal(rankFor(p).name, 'Director/a de vuelo');
  p.missions.moon_water.exploreStars = 3; p.missions.mars_life.exploreStars = 3;
  assert.equal(rankFor(p).name, 'Comandante de la agencia');
  assert.equal(nextChapter('mars_life'), null, 'Marte es el gran final');
});
