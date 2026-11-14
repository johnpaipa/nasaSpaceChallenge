// Ayuda a ubicar lugares de interés sobre el relieve real de un sitio.
//   node scripts/analyze-site.mjs moon_south_pole
import { index } from '../shared/catalog.js';
import { createTerrain } from '../client/src/explore/terrain.js';

const site = { ...index.sites[process.argv[2]] };
site.dem ??= process.argv[2];
const t = createTerrain(site);
const H = site.size / 2, S = 6; // muestra cada 6 unidades
const pts = [];
for (let z = H - 3; z > -H + 3; z -= S) for (let x = H - 3; x > -H + 3; x -= S) {
  const h = t.heightAt(x, z), e = 2;
  const slope = Math.atan(Math.hypot(t.heightAt(x + e, z) - t.heightAt(x - e, z), t.heightAt(x, z + e) - t.heightAt(x, z - e)) / (2 * e)) * 180 / Math.PI;
  pts.push({ x, z, h, slope, shadow: t.inShadow(x, z), elev: t.elevationAt?.(x, z) });
}
console.log(`${site.id}: ${t.metersPerUnit.toFixed(1)} m/unidad · alturas de juego ${t.hMin.toFixed(1)} a ${t.hMax.toFixed(1)} · pendiente máx ${Math.max(...pts.map((p) => p.slope)).toFixed(0)}° · >42° (bloquea): ${pts.filter((p) => p.slope > 42).length}/${pts.length}`);
const ramp = ' .:-=+*#%@';
console.log('z/x  +114 (oeste/izq) ............................................ -114 (este/der)');
for (let z = H - 3, k = 0; z > -H + 3; z -= S * 2, k++) {
  let line = String(Math.round(z)).padStart(4) + ' ';
  for (let x = H - 3; x > -H + 3; x -= S) {
    const p = pts.find((q) => q.x === x && Math.abs(q.z - z) < 0.01);
    line += p.shadow ? '~' : p.slope > 30 ? '/' : ramp[Math.min(9, Math.floor(((p.h - t.hMin) / (t.hMax - t.hMin)) * 10))];
  }
  console.log(line);
}
const r = (p) => `x=${Math.round(p.x)} z=${Math.round(p.z)} h=${p.h.toFixed(1)}${p.elev != null ? ` (${Math.round(p.elev)} m)` : ''} pend ${p.slope.toFixed(0)}°`;
const flat = pts.filter((p) => p.slope < 6 && !p.shadow);
console.log('\nmás alto y plano:', r(flat.sort((a, b) => b.h - a.h)[0]));
console.log('más bajo:', r([...pts].sort((a, b) => a.h - b.h)[0]));
const sh = pts.filter((p) => p.shadow);
if (sh.length) {
  console.log('sombra: celdas', sh.length, '· centro x=', Math.round(sh.reduce((s, p) => s + p.x, 0) / sh.length), 'z=', Math.round(sh.reduce((s, p) => s + p.z, 0) / sh.length));
  console.log('sombra más profunda:', r(sh.sort((a, b) => a.h - b.h)[0]));
}
console.log('más empinado:', r([...pts].sort((a, b) => b.slope - a.slope)[0]));
console.log('centro (0,0):', r(pts.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]));
