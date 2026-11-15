import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reducer, sanitizeDesign, defaultDesign } from './state.js';

test('loadDesign restaura un diseño anterior y vuelve a la fase de diseño', () => {
  let state = reducer(createState('wildfire'), { type: 'simulate', seed: 7 });
  assert.equal(state.phase, 'report');
  const saved = { ...defaultDesign(), battery: 'b2000', instruments: ['mastcam'] };
  state = reducer(state, { type: 'loadDesign', design: saved });
  assert.equal(state.phase, 'design');
  assert.equal(state.result, null);
  assert.deepEqual(state.design, saved);
});

test('loadDesign no aplica en modo equipo', () => {
  const state = createState('wildfire');
  const next = reducer(state, { type: 'loadDesign', design: { ...defaultDesign(), battery: 'b2000' } }, { roles: ['planner'], claimed: [], player: 'Ana' });
  assert.equal(next, state);
});

test('sanitizeDesign descarta valores que ya no existen en el catálogo', () => {
  const base = defaultDesign();
  const design = sanitizeDesign({ orbit: 'no_existe', battery: 'b2000', lifetimeYears: 99, instruments: ['mastcam', 'fantasma'], extra: 1 }, base);
  assert.equal(design.orbit, base.orbit);
  assert.equal(design.battery, 'b2000');
  assert.equal(design.lifetimeYears, 15);
  assert.deepEqual(design.instruments, ['mastcam']);
  assert.equal('extra' in design, false);
});
