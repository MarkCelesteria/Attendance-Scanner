const CSS = `
.dpick { position: relative; flex: none; max-width: 100%; }
.dpick-btn {
  appearance: none; margin: 0; font: inherit; color: var(--ink); cursor: pointer; text-align: left;
  display: flex; align-items: center; gap: 10px; width: 100%; min-width: 150px; min-height: 48px; padding: 8px 12px;
  background: var(--card); border: 1px solid var(--line-strong, var(--line)); border-radius: min(var(--radius, 10px), 12px);
  touch-action: manipulation;
}
.dpick-btn:focus-visible, .dpick-opt:focus-visible { outline: 2px solid var(--focus, var(--brand)); outline-offset: 2px; }
.dpick-btn[disabled] { opacity: .55; cursor: not-allowed; }
.dpick-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dpick-arrow { flex: none; width: 10px; height: 10px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg) translate(-2px, -2px); transition: transform .15s; opacity: .7; }
.dpick.is-open .dpick-arrow { transform: rotate(-135deg) translate(-2px, -2px); }
.dpick-sw { flex: none; width: 20px; height: 20px; border-radius: 5px; border: 1px solid rgba(127, 127, 127, .55); }
.dpick-list {
  position: fixed; left: 0; top: 0; z-index: 2147483000; box-sizing: border-box;
  max-height: 264px; overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: var(--line-strong, var(--line)) transparent;
  padding: 0 4px 4px; background: var(--card); color: var(--ink);
  border: 1px solid var(--line-strong, var(--line)); border-radius: min(var(--radius, 10px), 12px); box-shadow: 0 14px 34px rgba(0, 0, 0, .3);
}
.dpick-list[hidden] { display: none; }
.dpick-group { position: sticky; top: 0; z-index: 1; margin: 0 -4px; padding: 9px 14px 5px; background: var(--card); color: var(--ink-2, var(--ink)); font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; border-bottom: 1px solid var(--line); }
.dpick-opt {
  appearance: none; margin: 2px 0 0; font: inherit; color: inherit; cursor: pointer; text-align: left; width: 100%;
  display: flex; align-items: center; gap: 10px; padding: 9px 10px; background: transparent; border: 0; border-radius: min(var(--radius, 8px), 8px);
}
.dpick-opt:hover, .dpick-opt:focus-visible { background: var(--hover, rgba(127, 127, 127, .16)); }
.dpick-opt[aria-selected="true"] { font-weight: 700; }
.dpick-opt[aria-selected="true"]::after { content: ""; margin-left: auto; width: 6px; height: 11px; border-right: 2px solid var(--brand, currentColor); border-bottom: 2px solid var(--brand, currentColor); transform: rotate(45deg) translate(-1px, -1px); }
@media (prefers-reduced-motion: reduce) { .dpick-arrow { transition: none; } }
`;

export function initDesignPicker(select, designs) {
  if (!select || select.dataset.picker) return { sync() {} };
  select.dataset.picker = '1';
  if (!document.getElementById('dpick-css')) {
    const st = document.createElement('style'); st.id = 'dpick-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const byId = (id) => designs.find((d) => d.id === id);
  const sw = (id) => {
    const d = byId(id); const c = d ? d.color : { light: '#888', dark: '#444' };
    return `linear-gradient(135deg, ${c.light} 50%, ${c.dark} 50%)`;
  };

  const wrap = document.createElement('div'); wrap.className = 'dpick';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dpick-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Design');
  const bsw = document.createElement('span'); bsw.className = 'dpick-sw';
  const lab = document.createElement('span'); lab.className = 'dpick-label';
  const arr = document.createElement('span'); arr.className = 'dpick-arrow'; arr.setAttribute('aria-hidden', 'true');
  btn.append(bsw, lab, arr);
  const list = document.createElement('div'); list.className = 'dpick-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Design'); list.hidden = true;

  const opts = [];
  [...select.children].forEach((node) => {
    const items = node.tagName === 'OPTGROUP' ? [...node.children] : [node];
    if (node.tagName === 'OPTGROUP') {
      const h = document.createElement('div'); h.className = 'dpick-group'; h.setAttribute('role', 'presentation'); h.textContent = node.label; list.appendChild(h);
    }
    items.forEach((o) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dpick-opt'; b.tabIndex = -1;
      b.setAttribute('role', 'option'); b.dataset.value = o.value;
      const s = document.createElement('span'); s.className = 'dpick-sw'; s.style.background = sw(o.value);
      const t = document.createElement('span'); t.textContent = o.textContent;
      b.append(s, t); list.appendChild(b); opts.push(b);
    });
  });
  wrap.append(btn, list);
  select.after(wrap);
  select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');

  const isOpen = () => !list.hidden;
  function sync() {
    const cur = opts.find((o) => o.dataset.value === select.value);
    lab.textContent = cur ? cur.textContent : '';
    bsw.style.background = sw(select.value);
    opts.forEach((o) => o.setAttribute('aria-selected', String(o === cur)));
    btn.disabled = select.disabled;
    if (select.disabled) close();
  }
  function place() {
    // position: fixed, so no dialog/overflow clipping. Measure where (0,0) really lands to cope with transformed ancestors.
    const br = btn.getBoundingClientRect(); const vh = window.innerHeight; const vw = window.innerWidth;
    const gap = 6; const m = 10;
    const below = vh - br.bottom - gap - m; const above = br.top - gap - m;
    const up = below < 200 && above > below;
    const maxH = Math.max(120, Math.min(264, up ? above : below));
    const w = Math.min(Math.max(br.width, 230), vw - 2 * m);
    list.style.maxHeight = maxH + 'px'; list.style.width = w + 'px';
    list.style.left = '0px'; list.style.top = '0px';
    const o = list.getBoundingClientRect();
    const h = Math.min(list.scrollHeight + 2, maxH);
    const left = Math.max(m, Math.min(br.right - w, vw - w - m));
    const top = up ? br.top - gap - h : br.bottom + gap;
    list.style.left = (left - o.left) + 'px'; list.style.top = (top - o.top) + 'px';
  }
  function open() {
    if (select.disabled || isOpen()) return;
    list.hidden = false; wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
    place();
    const cur = opts.find((o) => o.getAttribute('aria-selected') === 'true') || opts[0];
    if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: 'nearest' }); }
  }
  function close(refocus) {
    if (!isOpen()) return;
    list.hidden = true; wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }
  function choose(o) {
    close(true);
    if (select.value === o.dataset.value) return;
    select.value = o.dataset.value; sync();
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
  list.addEventListener('click', (e) => { const o = e.target.closest('.dpick-opt'); if (o) choose(o); });
  list.addEventListener('keydown', (e) => {
    const i = opts.indexOf(document.activeElement);
    const go = (n) => { const t = opts[Math.max(0, Math.min(opts.length - 1, n))]; if (t) { t.focus(); t.scrollIntoView({ block: 'nearest' }); } };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(opts.length - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1) { const t = opts.find((o) => o.textContent.toLowerCase().startsWith(e.key.toLowerCase())); if (t) go(opts.indexOf(t)); }
  });
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !wrap.contains(e.target)) close(); });
  const dlg = wrap.closest('dialog'); if (dlg) dlg.addEventListener('close', () => close());
  const body = wrap.closest('.modal-body'); if (body) body.addEventListener('scroll', () => close());
  window.addEventListener('resize', () => close());
  sync();
  return { sync };
}