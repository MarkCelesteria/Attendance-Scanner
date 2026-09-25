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

function renderRows(students) {
  const body = $('admin-table-body');
  body.textContent = '';
  students.forEach((s) => {
    const tr = document.createElement('tr');
    tableCols.forEach((c) => {
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

function applySearch() {
  const q = $('admin-search-input').value.trim().toLowerCase();
  filteredStudents = q ? allStudents.filter((s) => matchesQuery(s, q)) : allStudents;
  currentPage = 1;
  renderPage();
}

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 300);
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

  const head = $('admin-table-head');
  head.textContent = '';
  cols.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c.label;
    head.appendChild(th);
  });

  allStudents = data.students;
  applySearch();
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
  $('btn-qrpdf-cancel').addEventListener('click', () => $('qrpdf-confirm-modal').close());
  $('qrpdf-confirm-modal').addEventListener('click', (e) => { if (e.target === $('qrpdf-confirm-modal')) $('qrpdf-confirm-modal').close(); });
}