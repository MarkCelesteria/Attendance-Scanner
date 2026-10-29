const listeners = [];
export function onDisplayPrefs(fn) { listeners.push(fn); }

export function applyDisplayPrefs(cfg) {
  const root = document.documentElement;
  root.setAttribute('data-layout', cfg && cfg.layoutSplit ? 'split' : 'single');
  root.setAttribute('data-scan-anim', cfg && cfg.scanAnimation ? 'on' : 'off');
  listeners.forEach((fn) => fn(cfg));
}