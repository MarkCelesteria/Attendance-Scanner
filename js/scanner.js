/** Camera scanner (html5-qrcode) tuned for low-end phones. */
import { SCAN_FPS } from './constants.js';
import { state } from './state.js';
import { $, toast } from './utils.js';
import { unlockAudio } from './audio.js';

/** Rectangular viewfinder: only this region is decoded, far cheaper than full frames. */
function computeQrBox(viewW, viewH) {
  return { width: Math.floor(viewW * 0.9), height: Math.floor(Math.min(viewH * 0.8, viewW * 0.55)) };
}

/** @param {(text: string) => void} onCode called for every decoded frame */
export async function startScanner(onCode) {
  if (state.scanning) return;
  if (!window.Html5Qrcode) { toast('Scanner library not loaded yet. Connect to the internet once, then retry.', 5000); return; }

  unlockAudio();   // browsers need a user gesture before audio can play

  if (!state.scanner) {
    const F = window.Html5QrcodeSupportedFormats;
    state.scanner = new window.Html5Qrcode('reader', {
      verbose: false,
      formatsToSupport: [F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.ITF, F.CODABAR, F.QR_CODE],
      // Uses the phone's native (hardware-accelerated) detector when available.
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
  }

  try {
    await state.scanner.start(
      { facingMode: 'environment' },
      {
        fps: SCAN_FPS,
        qrbox: computeQrBox,
        disableFlip: true,   // skip mirrored-frame decoding: halves the work
        videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      },
      onCode,
      () => { /* per-frame "no code found" — intentionally ignored */ }
    );
    state.scanning = true;
    $('scanner-idle').closest('.scanner').classList.add('is-live');
    $('btn-camera').textContent = 'Stop camera';
    requestWakeLock();
  } catch {
    state.scanning = false;
    toast('Camera unavailable. Allow camera access in your browser, or type IDs below.', 6000);
  }
}

export async function stopScanner() {
  if (!state.scanner || !state.scanning) return;
  try { await state.scanner.stop(); } catch { /* already stopped */ }
  state.scanning = false;
  const box = document.querySelector('.scanner');
  if (box) box.classList.remove('is-live');
  $('btn-camera').textContent = 'Start camera';
  releaseWakeLock();
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* optional */ }
}
function releaseWakeLock() {
  try { if (state.wakeLock) state.wakeLock.release(); } catch { /* ignore */ }
  state.wakeLock = null;
}
