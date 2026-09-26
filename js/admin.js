import { state } from './state.js';
import { $, toast } from './utils.js';
import { downloadQrSheet, estimateQrPdfSize, formatBytes } from './qrpdf.js';

const MIN_WIDTH = 1024

const PAGE_SIZE = 100;

let tableCols = [];
let allStudents = [];
let filteredStudents = [];
let currentPage = 1;
let searchTimer = null;
let sessionNames = [];
let hiddenCols = new Set();
let categoryDefs = [];
let excluded = {};
let timeFrom = '';
let timeTo = '';

export function renderAdminButton() {
  const btn = $('btn-admin');
  if (btn) btn.hidden = !(state.config && state.config.adminEnabled !== false);
}

function resetPanel() {
  $('admin-login-step').hidden = false;
  $('admin-table-step').hidden = true;
  $('admin-login-error').hidden = true;
  $('admin-key-input').value = '';
  $('admin-search-input').value = '';
  $('btn-admin-qrpdf').hidden = true;
  $('btn-admin-refresh').hidden = true;
  clearTimeout(searchTimer);
  tableCols = [];
  allStudents = [];
  filteredStudents = [];
  currentPage = 1;
  sessionNames = [];
  categoryDefs = [];
  excluded = {};
  hiddenCols.clear();
  timeFrom = ''; timeTo = '';
  if ($('admin-filter-modal').open) $('admin-filter-modal').close();
  $('filter-time-from').value = '';
  $('filter-time-to').value = '';
}

function closePanel() {
  $('admin-panel').hidden = true;
  $('view-dashboard').classList.remove('admin-active');
  if ($('qrpdf-confirm-modal').open) $('qrpdf-confirm-modal').close();
  resetPanel();
}

async function fetchAdminRoster(adminKey) {
  const c = state.config;
  const q = new URLSearchParams({
    action: 'admin', adminKey,
    idCol: c.idCol, nameCol: c.nameCol,
    programCol: c.programCol || '', yearCol: c.yearCol || '',
    collegeCol: c.collegeCol || '', genderCol: c.genderCol || '',
    firstRow: String(c.firstRow), sheet: c.sheetName || '',
    sessions: JSON.stringify(c.sessions.map((s) => ({ name: s.name, col: s.col }))),
  });
  const url = c.scriptUrl + (c.scriptUrl.includes('?') ? '&' : '?') + q.toString();

  let res;
  try { res = await fetch(url); }
  catch { throw new Error('Could not reach the script. Check your internet connection.'); }

  const data = JSON.parse(await res.text());
  if (!data.ok) throw new Error(data.error || 'The script reported an error.');
  return data;
}

function colId(c) { return c.key || ('session:' + c.session); }
function visibleCols() { return tableCols.filter((c) => !hiddenCols.has(colId(c))); }

function renderHead() {
  const head = $('admin-table-head');
  head.textContent = '';
  visibleCols().forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c.label;
    head.appendChild(th);
  });
}

function renderRows(students) {
  const cols = visibleCols();
  const body = $('admin-table-body');
  body.textContent = '';
  students.forEach((s) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = (c.session ? s.sessions[c.session] : s[c.key]) || '';
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function matchesQuery(student, q) {
  return String(student.id || '').toLowerCase().includes(q) || String(student.name || '').toLowerCase().includes(q);
}

function matchesTimeRange(s) {
  if (!timeFrom && !timeTo) return true;
  return sessionNames.some((name) => {
    const v = s.sessions && s.sessions[name];
    if (!v) return false;
    const hm = String(v).split(' ')[1];
    if (!hm) return false;
    const t = hm.slice(0, 5);
    if (timeFrom && t < timeFrom) return false;
    if (timeTo && t > timeTo) return false;
    return true;
  });
}

function rowPassesFilters(s) {
  for (const def of categoryDefs) {
    if (excluded[def.id] && excluded[def.id].has(s[def.field] || '')) return false;
  }
  return matchesTimeRange(s);
}

function renderPage() {
  const total = allStudents.length;
  const totalFiltered = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  renderRows(filteredStudents.slice(start, start + PAGE_SIZE));

  $('admin-table-meta').textContent = totalFiltered === total
    ? `${total} student${total === 1 ? '' : 's'}`
    : `${totalFiltered} of ${total} student${total === 1 ? '' : 's'}`;

  $('admin-page-label').textContent = `Page ${currentPage} of ${totalPages}`;
  $('admin-page-prev').disabled = currentPage <= 1;
  $('admin-page-next').disabled = currentPage >= totalPages;
  $('admin-pagination').hidden = totalFiltered <= PAGE_SIZE;
}

function goToPage(delta) {
  currentPage += delta;
  renderPage();
}

function applyFilters() {
  const q = $('admin-search-input').value.trim().toLowerCase();
  const base = allStudents.filter(rowPassesFilters);
  filteredStudents = q ? base.filter((s) => matchesQuery(s, q)) : base;
  currentPage = 1;
  renderPage();
}

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 300);
}

function buildColumnButtons() {
  const wrap = $('filter-columns-buttons');
  wrap.textContent = '';
  tableCols.forEach((c) => {
    if (c.key === 'id') return;
    const id = colId(c);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip' + (hiddenCols.has(id) ? '' : ' is-on');
    btn.textContent = c.label;
    btn.addEventListener('click', () => {
      if (hiddenCols.has(id)) hiddenCols.delete(id); else hiddenCols.add(id);
      btn.classList.toggle('is-on', !hiddenCols.has(id));
      renderHead();
      renderPage();
    });
    wrap.appendChild(btn);
  });
}

function uniqueValues(list, field) {
  const set = new Set();
  list.forEach((s) => { const v = (s[field] || '').trim(); if (v) set.add(v); });
  return [...set].sort();
}

function baseForCategory(def) {
  if (def.id === 'program' && excluded.college) {
    return allStudents.filter((s) => !excluded.college.has(s.college || ''));
  }
  return allStudents;
}

function buildCategorySections() {
  const wrap = $('filter-categories');
  wrap.textContent = '';
  categoryDefs.forEach((def) => {
    const section = document.createElement('div');
    section.className = 'filter-section filter-section-box';
    const h3 = document.createElement('h3');
    h3.textContent = def.label;
    const group = document.createElement('div');
    group.className = 'filter-btn-group';
    group.id = `filter-group-${def.id}`;
    section.append(h3, group);
    wrap.appendChild(section);
  });
  renderCategoryButtons();
}

function renderCategoryButtons() {
  categoryDefs.forEach((def) => {
    const group = $(`filter-group-${def.id}`);
    if (!group) return;
    group.textContent = '';
    const values = uniqueValues(baseForCategory(def), def.field);
    const ex = excluded[def.id];

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'filter-chip' + (ex.size === 0 ? ' is-on' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => { ex.clear(); renderCategoryButtons(); applyFilters(); });
    group.appendChild(allBtn);

    values.forEach((v) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip' + (ex.has(v) ? '' : ' is-on');
      btn.textContent = v;
      btn.addEventListener('click', () => {
        if (ex.has(v)) ex.delete(v); else ex.add(v);
        renderCategoryButtons();
        applyFilters();
      });
      group.appendChild(btn);
    });
  });
}

function renderTable(data) {
  const cfg = state.config;
  const cols = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
  if (cfg.programCol) cols.push({ key: 'program', label: 'Program' });
  if (cfg.yearCol) cols.push({ key: 'year', label: 'Year' });
  if (cfg.collegeCol) cols.push({ key: 'college', label: 'College' });
  if (cfg.genderCol) cols.push({ key: 'gender', label: 'Gender' });
  data.sessions.forEach((name) => cols.push({ key: null, session: name, label: name }));
  tableCols = cols;
  sessionNames = data.sessions;
  allStudents = data.students;

  categoryDefs = [];
  if (cfg.collegeCol) categoryDefs.push({ id: 'college', label: 'College', field: 'college' });
  if (cfg.programCol) categoryDefs.push({ id: 'program', label: 'Program', field: 'program' });
  if (cfg.yearCol) categoryDefs.push({ id: 'year', label: 'Year', field: 'year' });
  if (cfg.genderCol) categoryDefs.push({ id: 'gender', label: 'Gender', field: 'gender' });
  excluded = {};
  categoryDefs.forEach((d) => { excluded[d.id] = new Set(); });
  hiddenCols.clear();

  buildColumnButtons();
  buildCategorySections();
  renderHead();
  applyFilters();
}

function setLine(text) { $('qrpdf-line').textContent = text; }
function setBar(pct) { $('qrpdf-bar-fill').style.width = `${Math.max(0, Math.min(100, pct))}%`; }

async function openQrConfirm(students) {
  const n = students.length;
  $('qrpdf-summary').hidden = true;
  $('btn-qrpdf-confirm').disabled = true;
  $('btn-qrpdf-confirm').textContent = 'Download PDF';
  $('btn-qrpdf-cancel').disabled = false;
  setLine('Analyzing roster… 0%');
  setBar(0);
  $('btn-qrpdf-confirm').onclick = () => onDownloadQr(students);
  $('qrpdf-confirm-modal').showModal();

  try {
    const { pages, bytes } = await estimateQrPdfSize(students, (frac) => {
      const pct = Math.round(frac * 100);
      setLine(`Analyzing roster… ${pct}%`);
      setBar(pct);
    });
    setLine(`Ready — ${pages} page${pages === 1 ? '' : 's'}`);
    $('qrpdf-summary').hidden = false;
    $('qrpdf-summary').textContent = `${n} student${n === 1 ? '' : 's'} · ${pages} page${pages === 1 ? '' : 's'} · about ${formatBytes(bytes)}`;
    $('btn-qrpdf-confirm').disabled = false;
  } catch (e) {
    setLine('Could not estimate size');
    $('qrpdf-summary').hidden = false;
    $('qrpdf-summary').textContent = 'Continuing will still generate the PDF.';
    $('btn-qrpdf-confirm').disabled = false;
  }
}

async function onDownloadQr(students) {
  $('btn-qrpdf-confirm').disabled = true;
  $('btn-qrpdf-cancel').disabled = true;
  $('btn-qrpdf-confirm').textContent = 'Generating…';
  setBar(0);
  try {
    await downloadQrSheet(students, 'qr-codes.pdf', (frac) => {
      const pct = Math.round(frac * 100);
      setLine(`Generating QR codes in PDF… ${pct}%`);
      setBar(pct);
    });
    setLine('Done — check your downloads');
    setBar(100);
    setTimeout(() => $('qrpdf-confirm-modal').close(), 700);
  } catch (e) {
    toast('Could not generate the PDF: ' + (e && e.message ? e.message : e), 6000);
    setLine('Failed');
  } finally {
    $('btn-qrpdf-confirm').disabled = false;
    $('btn-qrpdf-cancel').disabled = false;
    $('btn-qrpdf-confirm').textContent = 'Download PDF';
  }
}

async function onRefreshTable() {
  const key = $('admin-key-input').value.trim();
  const btn = $('btn-admin-refresh');
  btn.classList.add('is-spinning'); btn.disabled = true;
  try {
    const data = await fetchAdminRoster(key);
    renderTable(data);
    $('btn-admin-qrpdf').onclick = () => openQrConfirm(data.students);
  } catch (e) {
    toast(e.message, 5000);
  } finally {
    btn.classList.remove('is-spinning'); btn.disabled = false;
  }
}

async function onSubmit() {
  const key = $('admin-key-input').value.trim();
  if (!key) { $('admin-login-error').textContent = 'Enter the admin key.'; $('admin-login-error').hidden = false; return; }

  const btn = $('btn-admin-submit');
  btn.disabled = true; btn.textContent = 'Checking…';
  $('admin-login-error').hidden = true;
  try {
    const data = await fetchAdminRoster(key);
    renderTable(data);
    $('admin-login-step').hidden = true;
    $('admin-table-step').hidden = false;
    $('btn-admin-qrpdf').hidden = false;
    $('btn-admin-refresh').hidden = false;
    $('btn-admin-qrpdf').onclick = () => openQrConfirm(data.students);
  } catch (e) {
    $('admin-login-error').textContent = e.message;
    $('admin-login-error').hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Unlock';
  }
}

export function initAdmin() {
  $('btn-admin').addEventListener('click', () => {
    if (window.innerWidth < MIN_WIDTH) { toast('Admin view needs a wider screen — try a tablet or PC.', 5000); return; }
    resetPanel();
    $('admin-panel').hidden = false;
    $('view-dashboard').classList.add('admin-active');
  });
  $('btn-admin-close').addEventListener('click', closePanel);
  $('btn-admin-submit').addEventListener('click', onSubmit);
  $('admin-key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } });
  $('btn-admin-refresh').addEventListener('click', onRefreshTable);
  $('admin-search-input').addEventListener('input', onSearchInput);
  $('admin-page-prev').addEventListener('click', () => goToPage(-1));
  $('admin-page-next').addEventListener('click', () => goToPage(1));
  $('btn-admin-filter').addEventListener('click', () => $('admin-filter-modal').showModal());
  $('btn-filter-close').addEventListener('click', () => $('admin-filter-modal').close());
  $('btn-filter-x').addEventListener('click', () => $('admin-filter-modal').close());
  $('admin-filter-modal').addEventListener('click', (e) => { if (e.target === $('admin-filter-modal')) $('admin-filter-modal').close(); });
  $('btn-filter-reset').addEventListener('click', () => {
    hiddenCols.clear();
    categoryDefs.forEach((d) => excluded[d.id].clear());
    timeFrom = ''; timeTo = '';
    $('filter-time-from').value = ''; $('filter-time-to').value = '';
    buildColumnButtons();
    renderCategoryButtons();
    renderHead();
    applyFilters();
  });
  $('filter-time-from').addEventListener('change', () => { timeFrom = $('filter-time-from').value; applyFilters(); });
  $('filter-time-to').addEventListener('change', () => { timeTo = $('filter-time-to').value; applyFilters(); });
  $('btn-qrpdf-cancel').addEventListener('click', () => $('qrpdf-confirm-modal').close());
  $('qrpdf-confirm-modal').addEventListener('click', (e) => { if (e.target === $('qrpdf-confirm-modal')) $('qrpdf-confirm-modal').close(); });
}