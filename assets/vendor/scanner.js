/**
 * Camera scanner using zxing-wasm (the same C++ engine family Google uses),
 * with our own small capture loop. Far more reliable on 1D barcodes than the
 * html5-qrcode decoder, especially on low-resolution laptop webcams.
 */
import { SCAN_FPS } from './constants.js';
import { state } from './state.js';
import { $, toast } from './utils.js';
import { unlockAudio } from './audio.js';

const FORMATS = ['Code128', 'Code39', 'Code93', 'EAN-13', 'EAN-8', 'UPC-A', 'ITF', 'Codabar', 'QRCode'];
const CROP_W = 0.9;   // decode the centre 90% x 70% of the frame (matches the on-screen frame)
const CROP_H = 0.7;

let stream = null, video = null, canvas = null, ctx = null, timer = null;
let busy = false, decoderReady = false, onCodeCb = null;

/** Point the engine at our locally hosted .wasm file (works offline). */
function ensureDecoder() {
  if (decoderReady) return true;
  if (!window.ZXingWASM) return false;
  window.ZXingWASM.setZXingModuleOverrides({
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? 'assets/vendor/zxing_reader.wasm' : prefix + path),
  });
  decoderReady = true;
  return true;
}

/** Runs ~SCAN_FPS times a second; `busy` stops frames piling up on slow phones. */
async function tick() {
  if (busy || !video || video.readyState < 2 || !video.videoWidth) return;
  busy = true;
  try {
    const vw = video.videoWidth, vh = video.videoHeight;
    const cw = Math.floor(vw * CROP_W), ch = Math.floor(vh * CROP_H);
    const sx = Math.floor((vw - cw) / 2), sy = Math.floor((vh - ch) / 2);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);
    const results = await window.ZXingWASM.readBarcodes(ctx.getImageData(0, 0, cw, ch), {
      formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 1,
    });
    if (results.length && results[0].text && onCodeCb) onCodeCb(results[0].text);
  } catch (e) {
    console.warn('decode error', e);
  } finally {
    busy = false;
  }
}

/** @param {(text: string) => void} onCode called whenever a code is decoded */
export async function startScanner(onCode) {
  if (state.scanning) return;
  if (!ensureDecoder()) { toast('Scanner engine not loaded yet. Reload the page while online.', 5000); return; }

  unlockAudio();   // browsers need a user gesture before audio can play
  onCodeCb = onCode;

  try {
    // "ideal" (not "exact") so laptops fall back to their webcam.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    toast('Camera error: ' + (e && e.message ? e.message : e), 8000);
    return;
  }

  video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;

  const frame = document.createElement('div');
  frame.className = 'reticle';

  const reader = $('reader');
  reader.textContent = '';
  reader.append(video, frame);

  try { await video.play(); } catch (e) { toast('Could not start video: ' + e.message, 6000); stopScanner(); return; }

  canvas = document.createElement('canvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });

  state.scanning = true;
  $('scanner-idle').closest('.scanner').classList.add('is-live');
  $('btn-camera').textContent = 'Stop camera';
  timer = setInterval(tick, Math.round(1000 / SCAN_FPS));
  requestWakeLock();
}

export async function stopScanner() {
  clearInterval(timer); timer = null;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; video = null;
  const reader = $('reader');
  if (reader) reader.textContent = '';
  state.scanning = false;
  const box = document.querySelector('.scanner');
  if (box) box.classList.remove('is-live');
  const btn = $('btn-camera');
  if (btn) btn.textContent = 'Start camera';
  releaseWakeLock();
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* optional */ }
}
function releaseWakeLock() {
  try { if (state.wakeLock) state.wakeLock.release(); } catch { /* ignore */ }
  state.wakeLock = null;
}