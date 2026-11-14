import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, simulate } from './engine.js';
import { defaultDesign, reducer, createState } from './state.js';

const wildfireGood = {
  ...defaultDesign(),
  launcher: 'rideshare',
  comms: 'x_band',
  instruments: ['thermal_ir', 'multispectral'],
};

test('un buen diseño de incendios no tiene errores', () => {
  const a = analyze(wildfireGood, 'wildfire');
  assert.equal(a.errors, 0, JSON.stringify(a.issues, null, 2));
  assert.ok(a.cost.total < a.cost.budget);
});

test('sin instrumentos hay error', () => {
  const a = analyze(defaultDesign(), 'wildfire');
  assert.ok(a.issues.some((i) => i.area === 'Ciencia' && i.severity === 'error'));
});

test('el SAR exige más potencia pico de la disponible con paneles pequeños', () => {
  const a = analyze({ ...wildfireGood, instruments: ['sar'] }, 'disaster');
  assert.ok(a.issues.some((i) => i.message.includes('potencia pico')));
});

test('L1 sin propulsión ni lanzador potente falla', () => {
  const a = analyze({ ...wildfireGood, orbit: 'l1' }, 'space_weather');
  assert.ok(a.issues.some((i) => i.area === 'Órbita' && i.severity === 'error'));
  assert.ok(a.issues.some((i) => i.area === 'Lanzamiento'));
});

test('la simulación es reproducible con la misma semilla', () => {
  const r1 = simulate(wildfireGood, 'wildfire', 42);
  const r2 = simulate(wildfireGood, 'wildfire', 42);
  assert.deepEqual(r1.score, r2.score);
  assert.ok(r1.score.total > 0);
});

test('el reducer respeta los roles', () => {
  const s = createState('wildfire');
  const ctx = { roles: ['science'], claimed: ['science', 'planner'], player: 'Ana' };
  assert.equal(reducer(s, { type: 'set', field: 'orbit', value: 'geo' }, ctx), s);
  const s2 = reducer(s, { type: 'toggleInstrument', id: 'thermal_ir' }, ctx);
  assert.deepEqual(s2.design.instruments, ['thermal_ir']);
  // un rol que nadie tomó puede editarlo cualquiera
  const s3 = reducer(s, { type: 'set', field: 'comms', value: 'x_band' }, ctx);
  assert.equal(s3.design.comms, 'x_band');
});

test('las misiones a la Luna y Marte empiezan en su destino y sus instrumentos aportan', () => {
  for (const missionId of ['moon_water', 'mars_life']) {
    const s = createState(missionId);
    assert.ok(['moon_surface', 'mars_surface'].includes(s.design.orbit), `${missionId} arranca en ${s.design.orbit}`);
    const withInstr = reducer(s, { type: 'toggleInstrument', id: missionId === 'moon_water' ? 'neutron_spectrometer' : 'rock_spectrometer' });
    const a = analyze(withInstr.design, missionId);
    assert.ok(a.science.instruments[0].relevance >= 0.66, 'el instrumento de superficie aporta al objetivo');
  }
  // cambiar de misión a una de superficie también cambia el destino
  const s2 = reducer(createState('wildfire'), { type: 'set', field: 'missionId', value: 'moon_water' });
  assert.equal(s2.design.orbit, 'moon_surface');
});
