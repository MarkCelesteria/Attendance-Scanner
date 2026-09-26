import { state } from './state.js';
import { $, toast } from './utils.js';
import { unlockAudio } from './audio.js';

const FORMATS = ['Code128', 'Code39', 'Code93', 'EAN-13', 'EAN-8', 'UPC-A', 'ITF', 'Codabar', 'QRCode'];
const CROP_W = 0.9; 
const CROP_H = 0.7;

let stream = null, video = null, canvas = null, ctx = null, timer = null;
let busy = false, decoderReady = false, onCodeCb = null;

const QUALITY_GROUPS = [
  { label: '320×240 (Low)',       w: 320,  h: 240,  fps: [5, 10, 15, 20] },
  { label: '640×480',             w: 640,  h: 480,  fps: [5, 10, 15, 20], recommendedFps: 10 },
  { label: '1280×720 (HD)',       w: 1280, h: 720,  fps: [10, 15, 20] },
  { label: '1920×1080 (Full HD)', w: 1920, h: 1080, fps: [10, 15] },
];
const DEFAULT_QUALITY = '640x480x10';
let selectedQuality = DEFAULT_QUALITY;
let optionEls = [];
let focusIdx = -1;

function qualityLabel(value, short) {
  for (const g of QUALITY_GROUPS) {
    for (const fps of g.fps) {
      if (`${g.w}x${g.h}x${fps}` === value) return `${g.w}×${g.h} · ${fps} fps${(!short && g.recommendedFps === fps) ? ' (Recommended)' : ''}`;
    }
  }
  return value;
}

function onDocClick(e) { if (!e.target.closest('#qsel')) closeList(); }

function moveFocus(dir) {
  if (!optionEls.length) return;
  focusIdx = (focusIdx + dir + optionEls.length) % optionEls.length;
  optionEls.forEach((el, i) => el.classList.toggle('is-focused', i === focusIdx));
  optionEls[focusIdx].scrollIntoView({ block: 'nearest' });
}

function onListKeydown(e) {
  if (e.key === 'Escape') { closeList(); $('qsel-btn').focus(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); return; }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (focusIdx >= 0) selectValue(optionEls[focusIdx].dataset.value); }
}

function closeList() {
  $('qsel-list').hidden = true;
  $('qsel-btn').setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onListKeydown);
  focusIdx = -1;
}

function openList() {
  $('qsel-list').hidden = false;
  $('qsel-btn').setAttribute('aria-expanded', 'true');
  focusIdx = optionEls.findIndex((el) => el.dataset.value === selectedQuality);
  optionEls.forEach((el, i) => el.classList.toggle('is-focused', i === focusIdx));
  setTimeout(() => document.addEventListener('click', onDocClick), 0);
  document.addEventListener('keydown', onListKeydown);
}

function selectValue(value) {
  selectedQuality = value;
  $('qsel-label').textContent = qualityLabel(value, true);
  optionEls.forEach((el) => el.setAttribute('aria-selected', String(el.dataset.value === value)));
  closeList();
  $('qsel-btn').focus();
  if (state.scanning) { const cb = onCodeCb; stopScanner().then(() => startScanner(cb)); }
}

function buildQualityOptions() {
  const list = $('qsel-list');
  if (list.dataset.built) return;
  list.dataset.built = '1';

  QUALITY_GROUPS.forEach((g) => {
    const header = document.createElement('div');
    header.className = 'qsel-group-label';
    header.textContent = g.label;
    list.appendChild(header);

    g.fps.forEach((fps) => {
      const value = `${g.w}x${g.h}x${fps}`;
      const opt = document.createElement('div');
      opt.className = 'qsel-option';
      opt.setAttribute('role', 'option');
      opt.dataset.value = value;
      opt.textContent = `${fps} fps${g.recommendedFps === fps ? ' (Recommended)' : ''}`;
      opt.setAttribute('aria-selected', String(value === selectedQuality));
      opt.addEventListener('click', () => selectValue(value));
      list.appendChild(opt);
      optionEls.push(opt);
    });
  });

  $('qsel-label').textContent = qualityLabel(selectedQuality, true);
  $('qsel-btn').addEventListener('click', () => { $('qsel-list').hidden ? openList() : closeList(); });
  $('qsel-btn').addEventListener('keydown', (e) => {
    if ($('qsel-list').hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); openList();
    }
  });
}

function getSelectedQuality() {
  const [w, h, fps] = selectedQuality.split('x').map(Number);
  return { w, h, fps };
}

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

  buildQualityOptions();
  unlockAudio();
  onCodeCb = onCode;
  const { w, h, fps } = getSelectedQuality();

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps, max: fps } },
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
  $('btn-camera-label').textContent = 'Close camera';
  timer = setInterval(tick, Math.round(1000 / fps));
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
  const label = $('btn-camera-label');
  if (label) label.textContent = 'Open camera';
  releaseWakeLock();
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* optional */ }
}
function releaseWakeLock() {
  try { if (state.wakeLock) state.wakeLock.release(); } catch { /* ignore */ }
  state.wakeLock = null;
}