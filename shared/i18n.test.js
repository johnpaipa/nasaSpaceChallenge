import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang, t, LANGS } from './i18n.js';
import { index } from './catalog.js';
import { analyze } from './engine.js';
import { defaultDesign, ROLES } from './state.js';

test('el juego cambia de idioma: interfaz, datos, motor y roles', () => {
  try {
    setLang('en');
    assert.equal(t('Simular misión'), 'Simulate mission');
    assert.equal(index.missions.wildfire.name, 'Forest fire watch');
    assert.equal(ROLES.science.name, 'Science');
    const a = analyze(defaultDesign(), 'wildfire');
    assert.ok(a.issues.some((i) => i.message === 'The mission carries no science instruments.'));
    setLang('de');
    assert.equal(index.instruments.thermal_ir.name, 'Thermische Infrarotkamera');
    assert.equal(t('{n} años', { n: 3 }), '3 Jahre');
  } finally {
    setLang('es');
  }
  assert.equal(index.missions.wildfire.name, 'Vigilancia de incendios forestales', 'vuelve al español original');
  assert.deepEqual(Object.keys(LANGS), ['es', 'en', 'de', 'fr', 'it']);
});
