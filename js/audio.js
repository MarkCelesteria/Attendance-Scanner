/** Success/error beeps via Web Audio (no audio files to cache). */
import { state } from './state.js';

/** Browsers need a user gesture before audio may play; call from a click handler. */
export function unlockAudio() {
  try {
    state.audioCtx = state.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
  } catch { /* audio is optional */ }
}

export function beep(kind) {
  try {
    unlockAudio();
    const ctx = state.audioCtx;
    if (!ctx) return;
    // [frequency Hz, start offset s, duration s]
    const notes = kind === 'ok' ? [[988, 0, 0.09], [1319, 0.09, 0.11]] : [[220, 0, 0.16], [165, 0.2, 0.2]];
    const t = ctx.currentTime;
    for (const [freq, off, dur] of notes) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = kind === 'ok' ? 'sine' : 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + off);
      gain.gain.exponentialRampToValueAtTime(kind === 'ok' ? 0.12 : 0.08, t + off + 0.01);  // "subtle"
      gain.gain.exponentialRampToValueAtTime(0.0001, t + off + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + off); osc.stop(t + off + dur + 0.02);
    }
    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
  } catch { /* ignore */ }
}
