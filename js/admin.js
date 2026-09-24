import { state } from './state.js';
import { $, toast } from './utils.js';
import { downloadQrSheet } from './qrpdf.js';

const MIN_WIDTH = 1024

export function renderAdminButton() {
  const btn = $('btn-admin');
  if (btn) btn.hidden = !(state.config && state.config.adminEnabled !== false);
}

function resetPanel() {
  $('admin-login-step').hidden = false;
  $('admin-table-step').hidden = true;
  $('admin-login-error').hidden = true;
  $('admin-key-input').value = '';
  $('btn-admin-qrpdf').hidden = true;
  $('btn-admin-refresh').hidden = true;
}

function closePanel() {
  $('admin-panel').hidden = true;
  $('view-dashboard').classList.remove('admin-active');
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

function renderTable(data) {
  const cfg = state.config;
  const cols = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
  if (cfg.programCol) cols.push({ key: 'program', label: 'Program' });
  if (cfg.yearCol) cols.push({ key: 'year', label: 'Year' });
  if (cfg.collegeCol) cols.push({ key: 'college', label: 'College' });
  if (cfg.genderCol) cols.push({ key: 'gender', label: 'Gender' });
  data.sessions.forEach((name) => cols.push({ key: null, session: name, label: name }));

  const head = $('admin-table-head');
  head.textContent = '';
  cols.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c.label;
    head.appendChild(th);
  });

  const body = $('admin-table-body');
  body.textContent = '';
  data.students.forEach((s) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = (c.session ? s.sessions[c.session] : s[c.key]) || '';
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });

  $('admin-table-meta').textContent = `${data.count} student${data.count === 1 ? '' : 's'}`;
}

async function onRefreshTable() {
  const key = $('admin-key-input').value.trim();
  const btn = $('btn-admin-refresh');
  btn.classList.add('is-spinning'); btn.disabled = true;
  try {
    const data = await fetchAdminRoster(key);
    renderTable(data);
    $('btn-admin-qrpdf').onclick = () => downloadQrSheet(data.students);
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
    $('btn-admin-qrpdf').onclick = () => downloadQrSheet(data.students);
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
}