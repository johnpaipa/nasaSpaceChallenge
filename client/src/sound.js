// Efectos de sonido sintetizados con Web Audio (sin archivos externos)
// y voz del copiloto con la API de síntesis de voz del navegador.
import { locale, getLang } from '../../shared/i18n.js';

let ctx = null;
// La voz de Orbi viene encendida; se apaga con "Leer siempre" o al silenciar el juego.
const prefs = { muted: read('smd-muted') === '1', voice: read('smd-voice') !== '0' };

function read(key) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key, v) { try { localStorage.setItem(key, v); } catch { /* sin almacenamiento */ } }

function audio() {
  if (prefs.muted) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, start, dur, { type = 'sine', gain = 0.12, slide } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function rumble(dur) {
  const c = audio();
  if (!c) return;
  const buffer = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(900, c.currentTime + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.35, c.currentTime + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  click: () => tone(660, 0, 0.06, { type: 'triangle', gain: 0.06 }),
  select: () => { tone(520, 0, 0.07, { type: 'triangle' }); tone(780, 0.06, 0.09, { type: 'triangle' }); },
  error: () => { tone(180, 0, 0.18, { type: 'square', gain: 0.05 }); tone(140, 0.16, 0.22, { type: 'square', gain: 0.05 }); },
  stepDone: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.18, { gain: 0.1 })),
  beep: (high) => tone(high ? 1046 : 784, 0, 0.15, { type: 'square', gain: 0.05 }),
  launch: () => { rumble(3); tone(80, 0, 3, { type: 'sawtooth', gain: 0.04, slide: 300 }); },
  alarm: () => { tone(880, 0, 0.22, { type: 'square', gain: 0.06 }); tone(660, 0.25, 0.22, { type: 'square', gain: 0.06 }); },
  clunk: () => { tone(90, 0, 0.18, { type: 'sine', gain: 0.25, slide: 45 }); tone(160, 0, 0.06, { type: 'square', gain: 0.05 }); },
  toggle: () => tone(1400, 0, 0.03, { type: 'square', gain: 0.04 }),
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.25, { type: 'triangle', gain: 0.12 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.2, 0.3, { type: 'triangle', gain: 0.1 })),
  explosion: () => { rumble(0.6); tone(220, 0, 0.5, { type: 'sawtooth', gain: 0.08, slide: 40 }); },
};

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export const isMuted = () => prefs.muted;
export function setMuted(v) { prefs.muted = v; write('smd-muted', v ? '1' : '0'); if (v) stopSpeaking(); }

export const voiceOn = () => prefs.voice;
export function setVoice(v) { prefs.voice = v; write('smd-voice', v ? '1' : '0'); if (!v) stopSpeaking(); }

/** ¿El navegador puede hablar? (Algunos no traen síntesis de voz o no tienen voces instaladas.) */
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Se guarda la locución en curso: algunos navegadores la cortan si se pierde la referencia.
let utterance = null;
let pending = null;

export function speak(text, force = false) {
  if ((!prefs.voice && !force) || prefs.muted || !canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  clearTimeout(pending);
  // Sin emojis ni símbolos: si no, la voz los lee uno por uno.
  const u = new SpeechSynthesisUtterance(text.replace(/\p{Extended_Pictographic}|[\uFE0F\u200D★☆→←]/gu, ''));
  u.lang = locale();
  u.rate = 0.95;
  u.pitch = 1.15;
  utterance = u;
  let started = false;
  const start = () => {
    if (started || utterance !== u) return;
    started = true;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(getLang()));
    if (voice) u.voice = voice;
    synth.resume();
    synth.speak(u);
  };
  // Hablar justo después de cancel() se pierde en algunos navegadores; y las
  // voces pueden tardar en cargar la primera vez.
  if (synth.getVoices().length > 0) pending = setTimeout(start, 80);
  else {
    synth.addEventListener('voiceschanged', start, { once: true });
    pending = setTimeout(start, 700);
  }
}

export function stopSpeaking() {
  utterance = null;
  clearTimeout(pending);
  if (canSpeak()) window.speechSynthesis.cancel();
}
