// Sound effects: synthesized with Web Audio (no files needed), replaceable by uploaded sounds.
import type { Effects, SoundEvent } from './types';

let ctx: AudioContext | null = null;
const audioCache = new Map<string, HTMLAudioElement>();

function ac(): AudioContext | null {
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  return ctx;
}

export function audioLocked(): boolean { return !!ctx && ctx.state === 'suspended'; }
export async function unlockAudio() { const a = ac(); if (a && a.state === 'suspended') await a.resume().catch(() => {}); }

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), a.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

const SYNTH: Record<SoundEvent, (v: number) => void> = {
  question: (v) => { tone(523, 0, 0.12, 'triangle', v * 0.5); tone(784, 0.1, 0.22, 'triangle', v * 0.5); },
  tick: (v) => tone(1100, 0, 0.06, 'square', v * 0.12),
  correct: (v) => { tone(660, 0, 0.1, 'sine', v * 0.5); tone(990, 0.08, 0.18, 'sine', v * 0.5); },
  wrong: (v) => tone(180, 0, 0.16, 'sawtooth', v * 0.08),
  first: (v) => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, i === 3 ? 0.5 : 0.14, 'triangle', v * 0.55)),
  win: (v) => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.16, i === 6 ? 0.9 : 0.2, 'triangle', v * 0.6)),
};

let lastWrong = 0;
export function playSound(event: SoundEvent, fx: Pick<Effects, 'sound' | 'volume' | 'sounds'> | undefined) {
  if (!fx || !fx.sound || fx.volume <= 0) return;
  if (event === 'wrong') { const n = performance.now(); if (n - lastWrong < 1200) return; lastWrong = n; }
  const custom = fx.sounds?.[event];
  if (custom) {
    let el = audioCache.get(custom);
    if (!el) { el = new Audio(custom); el.preload = 'auto'; audioCache.set(custom, el); }
    const node = el.cloneNode(true) as HTMLAudioElement;
    node.volume = fx.volume;
    node.play().catch(() => {});
    return;
  }
  ac();
  SYNTH[event](fx.volume);
}
