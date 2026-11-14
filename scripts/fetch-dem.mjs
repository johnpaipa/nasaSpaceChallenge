// Descarga ventanas pequeñas de modelos de elevación REALES y las convierte
// en mapas de alturas livianos para el modo exploración.
//
//   node scripts/fetch-dem.mjs            → genera data/dem/*.json
//
// Fuentes:
//  - Marte, cráter Jezero: Mosaico DTM HiRISE para Mars 2020 Terrain Relative
//    Navigation (USGS Astrogeology), 1 m/píxel, equirectangular, Marte 2000 esfera.
//  - Luna, polo sur: LOLA LDEM_80S_20MPP_ADJ (NASA GSFC PGDA, Barker et al. 2023,
//    PSJ 4:183), 20 m/píxel, estereográfica polar sur.
// Solo se descargan los bytes de la ventana (peticiones HTTP por rango).
import { fromUrl } from 'geotiff';
import { mkdirSync, writeFileSync } from 'node:fs';

const GRID = 257;

// El servidor de GSFC rechaza peticiones simultáneas: las hacemos de a una y reintentamos.
const nativeFetch = globalThis.fetch;
let chain = Promise.resolve();
globalThis.fetch = (url, opts = {}) => {
  const run = async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await nativeFetch(url, { ...opts, headers: { ...opts.headers, 'User-Agent': 'curl/8.0 (NASA Space Apps educational game)' } });
      if (r.status !== 403 && r.status !== 429 && r.status < 500) return r;
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
    throw new Error(`No se pudo descargar ${url}`);
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
};

const SITES = {
  mars_jezero: {
    url: 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif',
    source: 'HiRISE DTM mosaic, Mars 2020 Terrain Relative Navigation (USGS Astrogeology Science Center), 1 m/pixel',
    citation: 'Fergason, R.L., et al. (2020) Mars 2020 Terrain Relative Navigation HiRISE DTM Mosaic. USGS Astrogeology Science Center.',
    // Ventana de 3 km entre el frente del delta occidental y el sitio de aterrizaje de Perseverance.
    center: { lat: 18.4447, lon: 77.429 }, // incluye el delta (oeste) y el sitio Octavia E. Butler (77.4508°E)
    sizeMeters: 3000,
    radius: 3396190,
  },
  moon_south_pole: {
    url: 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF',
    source: 'LOLA LDEM_80S_20MPP_ADJ (NASA GSFC Planetary Geodynamics Data Archive), 20 m/pixel',
    citation: 'Barker, M.K., et al. (2023) A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter (LOLA). Planet. Sci. J. 4, 183. doi:10.3847/PSJ/acf3e1',
    // Ventana de 6 km a ~12 km del polo, entre Shackleton y de Gerlache: relieve
    // suave (~400 m, pendientes < 13°) con un pequeño cráter en sombra permanente.
    centerXY: { x: -8500, y: 8500 },
    sizeMeters: 6000,
    contextMeters: 30000, // relieve alrededor para calcular qué tapa el Sol
    sunMaxElevationDeg: 1.6,
  },
};

const deg = Math.PI / 180;

async function readJezero(cfg) {
  const tiff = await fromUrl(cfg.url);
  const img = await tiff.getImage(0);
  const [ox, oy] = img.getOrigin();
  const [rx] = img.getResolution();
  const nodata = img.getGDALNoData();
  // Equirectangular con paralelo estándar 0: x = R·λ, y = R·φ
  const cx = cfg.radius * cfg.center.lon * deg, cy = cfg.radius * cfg.center.lat * deg;
  const col0 = Math.round((cx - ox) / rx - cfg.sizeMeters / 2);
  const row0 = Math.round((oy - cy) - cfg.sizeMeters / 2);
  const step = cfg.sizeMeters / (GRID - 1);
  const out = new Float32Array(GRID * GRID);
  console.log(`Jezero: ventana col ${col0}, fila ${row0}, ${cfg.sizeMeters} m → ${GRID}x${GRID} (${step.toFixed(1)} m/celda)`);
  for (let r = 0; r < GRID; r++) {
    const row = row0 + Math.round(r * step);
    const [data] = await img.readRasters({ window: [col0, row, col0 + cfg.sizeMeters + 1, row + 1] });
    for (let c = 0; c < GRID; c++) {
      // promedio horizontal de los píxeles que caen en la celda
      const a = Math.max(0, Math.round((c - 0.5) * step)), b = Math.min(data.length - 1, Math.round((c + 0.5) * step));
      let s = 0, n = 0;
      for (let i = a; i <= b; i++) if (data[i] > nodata / 2 && Number.isFinite(data[i])) { s += data[i]; n++; }
      out[r * GRID + c] = n ? s / n : NaN;
    }
    if (r % 32 === 0) process.stdout.write(`  fila ${r}/${GRID}\r`);
  }
  return { heights: blur(fillGaps(out)), metersPerCell: step };
}

async function readLola(cfg) {
  const tiff = await fromUrl(cfg.url, { maxRanges: 0 });
  const img = await tiff.getImage(0);
  const [ox, oy] = img.getOrigin();
  const [res] = img.getResolution();
  const px = cfg.sizeMeters / res;
  const col0 = Math.round((cfg.centerXY.x - ox) / res - px / 2);
  const row0 = Math.round((oy - cfg.centerXY.y) / res - px / 2);
  console.log(`LOLA: ventana col ${col0}, fila ${row0}, ${px}x${px} px → ${GRID}x${GRID}`);
  const [data] = await img.readRasters({ window: [col0, row0, col0 + px, row0 + px] });
  const out = new Float32Array(GRID * GRID);
  const step = px / (GRID - 1);
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    // interpolación bilineal (LOLA ya es suave a 20 m)
    const fx = Math.min(px - 1.001, c * step), fy = Math.min(px - 1.001, r * step);
    const x = Math.floor(fx), y = Math.floor(fy), u = fx - x, v = fy - y;
    const at = (i, j) => data[j * px + i];
    out[r * GRID + c] = at(x, y) * (1 - u) * (1 - v) + at(x + 1, y) * u * (1 - v) + at(x, y + 1) * (1 - u) * v + at(x + 1, y + 1) * u * v;
  }
  // La LDEM está en km relativos a la esfera de 1737.4 km en algunos productos; normalizamos a metros.
  const sample = out[(GRID >> 1) * GRID + (GRID >> 1)];
  if (Math.abs(sample) < 20) for (let i = 0; i < out.length; i++) out[i] *= 1000;
  // Contexto: 30 km alrededor del polo a 200 m/celda, para el horizonte.
  const cpx = cfg.contextMeters / res, cc0 = Math.round(-ox / res - cpx / 2);
  const [ctx] = await img.readRasters({ window: [cc0, cc0, cc0 + cpx, cc0 + cpx] });
  const CN = 150, cf = cpx / CN, context = new Float32Array(CN * CN);
  for (let r = 0; r < CN; r++) for (let c = 0; c < CN; c++) {
    let s = 0, n = 0;
    for (let j = 0; j < cf; j += 2) for (let i = 0; i < cf; i += 2) { s += ctx[(r * cf + j) * cpx + c * cf + i]; n++; }
    context[r * CN + c] = s / n;
  }
  const scale = Math.abs(sample) < 20 ? 1000 : 1;
  for (let i = 0; i < context.length; i++) context[i] *= scale;
  const contextAt = (x, y) => {
    const c = Math.round((x + cfg.contextMeters / 2) / (cfg.contextMeters / CN)), r = Math.round((cfg.contextMeters / 2 - y) / (cfg.contextMeters / CN));
    return c < 0 || r < 0 || c >= CN || r >= CN ? null : context[r * CN + c];
  };
  return { heights: fillGaps(out), metersPerCell: cfg.sizeMeters / (GRID - 1), contextAt };
}

function fillGaps(h) {
  const valid = [...h].filter(Number.isFinite);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  return h.map((v) => (Number.isFinite(v) ? v : mean));
}

function blur(h) {
  const out = new Float32Array(h.length);
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    let s = 0, n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < GRID && cc >= 0 && cc < GRID) { s += h[rr * GRID + cc]; n++; }
    }
    out[r * GRID + c] = s / n;
  }
  return out;
}

/**
 * Sombra permanente: una celda nunca ve el Sol si, para TODAS las direcciones,
 * el relieve tapa un Sol a la máxima elevación posible en el polo (~1.6°).
 * (Aproximación: solo considera el relieve dentro de la ventana.)
 */
function permanentShadow(h, metersPerCell, maxElevDeg, cfg, contextAt) {
  const tanSun = Math.tan(maxElevDeg * deg);
  const mask = new Uint8Array(GRID * GRID);
  const AZ = 36;
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    const h0 = h[r * GRID + c];
    let blockedAll = true;
    for (let k = 0; k < AZ && blockedAll; k++) {
      const a = (k / AZ) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let blocked = false;
      // primero dentro de la ventana (detalle fino), luego en el contexto hasta 15 km
      for (let d = 2; d < 15000 / metersPerCell; d += d < GRID ? 1.5 : 4) {
        const x = Math.round(c + dx * d), y = Math.round(r + dy * d);
        let hz;
        if (x >= 0 && y >= 0 && x < GRID && y < GRID) hz = h[y * GRID + x];
        else {
          if (!contextAt) break;
          hz = contextAt(cfg.centerXY.x - cfg.sizeMeters / 2 + x * metersPerCell, cfg.centerXY.y + cfg.sizeMeters / 2 - y * metersPerCell);
          if (hz == null) break;
        }
        if ((hz - h0) / (d * metersPerCell) > tanSun) { blocked = true; break; }
      }
      if (!blocked) blockedAll = false;
    }
    mask[r * GRID + c] = blockedAll ? 1 : 0;
  }
  return mask;
}

function encode(h) {
  let min = Infinity, max = -Infinity;
  for (const v of h) { if (v < min) min = v; if (v > max) max = v; }
  const q = new Uint16Array(h.length);
  for (let i = 0; i < h.length; i++) q[i] = Math.round(((h[i] - min) / (max - min)) * 65535);
  return { min, max, data: Buffer.from(q.buffer).toString('base64') };
}

/** Vista previa en texto para ubicar cráteres, lomas y zonas de sombra. */
function preview(h, mask) {
  let min = Infinity, max = -Infinity;
  for (const v of h) { min = Math.min(min, v); max = Math.max(max, v); }
  const ramp = ' .:-=+*#%@';
  for (let r = 0; r < GRID; r += 8) {
    let line = '';
    for (let c = 0; c < GRID; c += 4) {
      const i = r * GRID + c;
      line += mask?.[i] ? '~' : ramp[Math.min(9, Math.floor(((h[i] - min) / (max - min)) * 10))];
    }
    console.log(line);
  }
}

mkdirSync(new URL('../data/dem/', import.meta.url), { recursive: true });
const only = process.argv[2];
for (const [id, cfg] of Object.entries(SITES)) {
  if (only && only !== id) continue;
  const { heights, metersPerCell, contextAt } = id === 'mars_jezero' ? await readJezero(cfg) : await readLola(cfg);
  const mask = cfg.sunMaxElevationDeg ? permanentShadow(heights, metersPerCell, cfg.sunMaxElevationDeg, cfg, contextAt) : null;
  const enc = encode(heights);
  const psrCells = mask ? mask.reduce((a, b) => a + b, 0) : 0;
  writeFileSync(new URL(`../data/dem/${id}.json`, import.meta.url), JSON.stringify({
    id, source: cfg.source, citation: cfg.citation, url: cfg.url,
    grid: GRID, sizeMeters: cfg.sizeMeters, metersPerCell,
    min: enc.min, max: enc.max, heights: enc.data,
    shadow: mask ? Buffer.from(mask).toString('base64') : null,
  }) + '\n');
  console.log(`\n${id}: altura ${enc.min.toFixed(0)} a ${enc.max.toFixed(0)} m (relieve ${(enc.max - enc.min).toFixed(0)} m)${mask ? ` · sombra permanente: ${((psrCells / mask.length) * 100).toFixed(1)}% del área` : ''}`);
  preview(heights, mask);
}
