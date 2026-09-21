import { SCAN_FPS } from './constants.js';
import { state } from './state.js';
import { $, toast } from './utils.js';
import { unlockAudio } from './audio.js';

const FORMATS = ['Code128', 'Code39', 'Code93', 'EAN-13', 'EAN-8', 'UPC-A', 'ITF', 'Codabar', 'QRCode'];
const CROP_W = 0.9; 
const CROP_H = 0.7;

let stream = null, video = null, canvas = null, ctx = null, timer = null;
let busy = false, decoderReady = false, onCodeCb = null;

function ensureDecoder() {
  if (decoderReady) return true;
  if (!window.ZXingWASM) return false;
  window.ZXingWASM.setZXingModuleOverrides({
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? 'assets/vendor/zxing_reader.wasm' : prefix + path),
  });
  decoderReady = true;
  return true;
}

// function debug(msg) {
//   let el = document.getElementById('scan-debug');
//   if (!el) {
//     el = document.createElement('p');
//     el.id = 'scan-debug';
//     el.style.cssText = 'margin:6px 0 0;font:12px/1.4 monospace;color:#64748b;word-break:break-all';
//     $('reader').parentElement.after(el);
//   }
//   el.textContent = msg;
// }

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
      formats: FORMATS, tryHarder: false, tryRotate: false, tryInvert: false, maxNumberOfSymbols: 1,
    });
    // frames++;
    // debug(`${vw}x${vh} · frames ${frames} · ${results.length ? 'found: ' + results[0].text : 'no code'}`);
    if (results.length && results[0].text && onCodeCb) onCodeCb(results[0].text);
  } catch (e) {
    // debug('decode error: ' + (e && e.message ? e.message : e));
    console.warn('decode error', e);
  } finally {
    busy = false;
  }
}

/** @param {(text: string) => void} onCode called whenever a code is decoded */
export async function startScanner(onCode) {
  if (state.scanning) return;
  if (!ensureDecoder()) { toast('Scanner engine not loaded yet. Reload the page while online.', 5000); return; }

  unlockAudio();
  onCodeCb = onCode;

  try {
    // "ideal" (not "exact") so laptops fall back to their webcam.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 10, max: 15 } },
    });
  } catch (e) {
    toast('Camera error: ' + (e && e.message ? e.message : e), 8000);
    return;
  }

  stream.getVideoTracks()[0].addEventListener('ended', () => {
    toast('Camera disconnected. Restarting…', 4000);
    stopScanner().then(() => setTimeout(() => startScanner(onCode), 2000));
  });

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