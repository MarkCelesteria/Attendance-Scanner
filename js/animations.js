import { LS_ANIM } from './constants.js';
import { $ } from './utils.js';

const PREMIUM = ['space', 'tech', 'fantasy', 'nature', 'storm','ocean', 'city', 'lab', 'halloween', 'valentine', 'cny', 'christmas', 'party'];

const root = document.documentElement;

export const isPremium = (id) => PREMIUM.includes(id);
export const animationsOn = () => localStorage.getItem(LS_ANIM) !== 'off';

const OFF_CSS = `
:root[data-anim="off"] *:not(.is-spinning):not(.is-spinning *):not(.toast):not(.pill-syncing .dot) { animation: none !important; }
:root[data-anim="off"]::before,
:root[data-anim="off"]::after,
:root[data-anim="off"] *:not(.reticle)::before,
:root[data-anim="off"] *:not(.reticle)::after { animation: none !important; }
`;

function sync() {
  const premium = isPremium(root.getAttribute('data-design'));
  const row = $('anim-row');
  if (row) row.hidden = !premium;
  if (premium && !animationsOn()) root.setAttribute('data-anim', 'off');
  else root.removeAttribute('data-anim');
}

export function initAnimations() {
  const style = document.createElement('style');
  style.id = 'anim-off-css';
  style.textContent = OFF_CSS;
  document.head.appendChild(style);

  const sw = $('cfg-anim-on');
  if (sw) {
    sw.checked = animationsOn();
    sw.addEventListener('change', () => {
      localStorage.setItem(LS_ANIM, sw.checked ? 'on' : 'off');
      sync();
    });
  }

  sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-design'] });
}