/**
 * SoundManager — Web Audio API based sound system for tiles.bot
 * Preloads all sounds as AudioBuffers for zero-latency playback.
 * Persists mute/volume state in localStorage.
 */

const SOUNDS = {
  'tile-click': '/sounds/tile-click.wav',
  'claim': '/sounds/claim.wav',
  'batch-claim': '/sounds/batch-claim.wav',
  'slap': '/sounds/slap.wav',
  'emote-pop': '/sounds/emote-pop.wav',
  'connection': '/sounds/connection.wav',
  'whoosh': '/sounds/whoosh.wav',
  'tool-toggle': '/sounds/tool-toggle.wav',
  'upload-success': '/sounds/upload-success.wav',
  'notification': '/sounds/notification.wav',
  'error': '/sounds/error.wav',
};

let audioCtx = null;
const buffers = {};
let muted = false;
let volume = 0.7;
let loaded = false;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/** Preload all sounds */
export async function initSounds() {
  if (loaded) return;
  if (typeof window === 'undefined') return;

  // Restore state from localStorage
  const savedMuted = localStorage.getItem('tiles_sound_muted');
  if (savedMuted !== null) muted = savedMuted === 'true';
  const savedVol = localStorage.getItem('tiles_sound_volume');
  if (savedVol !== null) volume = parseFloat(savedVol);

  const ctx = getCtx();
  const loadPromises = Object.entries(SOUNDS).map(async ([name, url]) => {
    try {
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      buffers[name] = await ctx.decodeAudioData(arrayBuf);
    } catch (e) {
      console.warn(`[sound] Failed to load ${name}:`, e.message);
    }
  });
  await Promise.all(loadPromises);
  loaded = true;
}

/** Play a named sound */
export function playSound(name, volumeOverride) {
  if (muted || typeof window === 'undefined') return;
  const buf = buffers[name];
  if (!buf) return;

  const ctx = getCtx();
  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();

  const source = ctx.createBufferSource();
  source.buffer = buf;

  const gainNode = ctx.createGain();
  gainNode.gain.value = volumeOverride ?? volume;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(0);
}

/** Mute/unmute */
export function setMuted(m) {
  muted = m;
  localStorage.setItem('tiles_sound_muted', String(m));
}

export function isMuted() {
  return muted;
}

/** Volume (0–1) */
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  localStorage.setItem('tiles_sound_volume', String(volume));
}

export function getVolume() {
  return volume;
}

/** Toggle mute, returns new muted state */
export function toggleMute() {
  setMuted(!muted);
  return muted;
}
