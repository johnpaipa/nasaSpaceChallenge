// Terreno del modo exploración. Usa modelos de elevación REALES de NASA
// (HiRISE para Jezero, LOLA para el polo sur lunar, ver scripts/fetch-dem.mjs);
// si un sitio no tiene DEM, genera un terreno procedural (ruido + cráteres).
// heightAt(x, z) se usa tanto para la malla como para posar el rover.
import * as THREE from 'three';
import marsJezero from '../../../data/dem/mars_jezero.json' with { type: 'json' };
import moonSouthPole from '../../../data/dem/moon_south_pole.json' with { type: 'json' };

const DEMS = { mars_jezero: marsJezero, moon_south_pole: moonSouthPole };

function base64Bytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Decodifica el DEM: alturas en metros (Float32) y máscara de sombra permanente. */
export function decodeDem(dem) {
  const q = new Uint16Array(base64Bytes(dem.heights).buffer);
  const heights = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) heights[i] = dem.min + (q[i] / 65535) * (dem.max - dem.min);
  const shadow = dem.shadow ? base64Bytes(dem.shadow) : null;
  let mean = 0;
  for (const h of heights) mean += h;
  return { ...dem, heights, shadow, mean: mean / heights.length };
}

function hash(x, z, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed);
  const c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z, seed) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < 5; o++) {
    sum += valueNoise(x * freq, z * freq, seed + o) * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}

/**
 * Funciones de altura a partir de un DEM real. Convención del mundo:
 * +z = arriba del mapa (norte en Jezero) y +x = oeste, para que con la
 * cámara detrás del rover mirando a +z el este quede a la derecha.
 */
function demFunctions(site, dem) {
  const g = dem.grid;
  const half = (g - 1) / 2;
  const cellUnits = site.size / (g - 1);
  const metersPerUnit = dem.sizeMeters / site.size;
  const ve = site.vertical_exaggeration ?? 1;
  const grid = (x, z) => [
    Math.min(g - 1.001, Math.max(0, half - x / cellUnits)),
    Math.min(g - 1.001, Math.max(0, half - z / cellUnits)),
  ];
  const elevationAt = (x, z) => {
    const [fc, fr] = grid(x, z);
    const c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r;
    const H = dem.heights, i = r * g + c;
    return H[i] * (1 - u) * (1 - v) + H[i + 1] * u * (1 - v) + H[i + g] * (1 - u) * v + H[i + g + 1] * u * v;
  };
  const heightAt = (x, z) => ((elevationAt(x, z) - dem.mean) / metersPerUnit) * ve;
  const inShadow = (x, z) => {
    if (!dem.shadow) return false;
    const [fc, fr] = grid(x, z);
    return dem.shadow[Math.round(fr) * g + Math.round(fc)] === 1;
  };
  return { heightAt, elevationAt, inShadow, metersPerUnit };
}

function proceduralFunctions(site) {
  const { seed, amplitude, craters = [] } = site;
  const heightAt = (x, z) => {
    let h = (fbm(x / 45, z / 45, seed) - 0.5) * 2 * amplitude;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r;
      if (d < 1) h -= c.depth * (1 - d * d);
      h += c.depth * 0.35 * Math.exp(-(((d - 1) / 0.18) ** 2)); // borde elevado
    }
    return h;
  };
  const inShadow = (x, z) => craters.some((c) => c.shadow && Math.hypot(x - c.x, z - c.z) < c.r * 0.85);
  return { heightAt, elevationAt: null, inShadow, metersPerUnit: 10 };
}

export function createTerrain(site) {
  const dem = site.dem && DEMS[site.dem] ? decodeDem(DEMS[site.dem]) : null;
  const fns = dem ? demFunctions(site, dem) : proceduralFunctions(site);
  const { heightAt, inShadow } = fns;
  const seed = site.seed ?? 1;
  const sand = findSandPatches(site, heightAt, inShadow);
  const sandAt = (x, z) => sand.find((p) => Math.hypot(p.x - x, p.z - z) < p.r) ?? null;
  const sandColor = new THREE.Color(site.colors.sand ?? '#d8b98a');

  const geometry = new THREE.PlaneGeometry(site.size, site.size, 200, 200);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color(site.colors.low), high = new THREE.Color(site.colors.high), col = new THREE.Color();
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const h = heightAt(pos.getX(i), pos.getZ(i));
    hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    col.copy(low).lerp(high, (h - hMin) / (hMax - hMin || 1));
    col.multiplyScalar(1 - site.colors.speckle + hash(Math.round(x * 3), Math.round(z * 3), seed) * site.colors.speckle * 2);
    for (const p of sand) {
      const d = Math.hypot(p.x - x, p.z - z) / p.r;
      if (d < 1) col.lerp(sandColor, 0.55 * (1 - d * d));
    }
    if (inShadow(x, z)) col.multiplyScalar(0.3);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // Rocas en posiciones reproducibles (fuera de la arena, de los lugares de interés y del inicio).
  const keepClear = [...site.pois, site.start ?? { x: 0, z: 0 }];
  const rocks = [];
  for (let i = 0; i < 260 && rocks.length < 180; i++) {
    const x = (hash(i, 1, seed) - 0.5) * site.size * 0.95;
    const z = (hash(i, 2, seed) - 0.5) * site.size * 0.95;
    if (sandAt(x, z) || keepClear.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
    rocks.push({ x, z, y: heightAt(x, z), s: 0.2 + hash(i, 3, seed) ** 3 * 1.6, r: hash(i, 4, seed) * Math.PI });
  }

  return { ...fns, geometry, rocks, sand, sandAt, half: site.size / 2, dem, hMin, hMax };
}

/**
 * Arena blanda: se acumula en zonas bajas y planas. Elegimos parches sobre el
 * relieve (reproducible), lejos de los lugares de interés y del inicio.
 */
function findSandPatches(site, heightAt, inShadow) {
  const H = site.size / 2 - 12, cands = [];
  for (let z = -H; z <= H; z += 8) for (let x = -H; x <= H; x += 8) {
    const g = Math.hypot(heightAt(x + 2, z) - heightAt(x - 2, z), heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;
    if (g < 0.12 && !inShadow(x, z)) cands.push({ x, z, h: heightAt(x, z) });
  }
  cands.sort((a, b) => a.h - b.h);
  const avoid = [...site.pois, site.start ?? { x: 0, z: 0 }];
  const picked = [];
  for (const c of cands.slice(0, Math.ceil(cands.length * 0.5))) {
    if (picked.length >= (site.sand_patches ?? 6)) break;
    if (avoid.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 22)) continue;
    if (picked.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 40)) continue;
    picked.push({ x: c.x, z: c.z, r: 8 + (Math.abs(Math.round(c.x * 7 + c.z * 3)) % 5) });
  }
  return picked;
}

/** Imagen en relieve sombreado para el minimapa (solo en el navegador). */
export function minimapImage(site, terrain, size = 128) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const low = new THREE.Color(site.colors.low), high = new THREE.Color(site.colors.high), col = new THREE.Color();
  const step = site.size / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    // misma orientación que el minimapa: +z arriba, +x a la izquierda
    const x = site.size / 2 - (px + 0.5) * step, z = site.size / 2 - (py + 0.5) * step;
    const h = terrain.heightAt(x, z);
    const shade = THREE.MathUtils.clamp(0.75 + (terrain.heightAt(x + step, z + step) - h) * 0.6, 0.35, 1.25);
    col.copy(low).lerp(high, (h - terrain.hMin) / (terrain.hMax - terrain.hMin || 1)).multiplyScalar(shade);
    if (terrain.inShadow(x, z)) col.lerp(new THREE.Color('#0a1a3a'), 0.6);
    const i = (py * size + px) * 4;
    img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
