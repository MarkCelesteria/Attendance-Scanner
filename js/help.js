import { $ } from './utils.js';

const SCRIPT_PATH = 'backend/apps-script/Code.gs';
let scriptPromise = null;

function getScript() {
  if (!scriptPromise) {
    scriptPromise = fetch(SCRIPT_PATH, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .catch((e) => { scriptPromise = null; throw e; }); 
  }
  return scriptPromise;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('Copy was blocked');
}

async function onCopy() {
  const msg = $('copy-msg');
  msg.className = 'copy-msg';
  msg.textContent = '';
  try {
    await copyText(await getScript());
    msg.classList.add('ok');
    msg.textContent = 'Copied! Now paste it into the Apps Script editor.';
  } catch {
    msg.classList.add('err');
    msg.textContent = 'Could not copy. Open backend/apps-script/Code.gs in your repo and copy it there.';
  }
}

export function initHelp() {
  const dlg = $('help-modal');
  $('btn-help').addEventListener('click', () => {
    getScript().catch(() => {});
    $('copy-msg').textContent = '';
    dlg.showModal();
  });
  $('btn-help-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('btn-copy-script').addEventListener('click', onCopy);
}