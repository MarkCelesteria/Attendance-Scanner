const COLS = 4, ROWS = 7;
const PAGE_W = 210, PAGE_H = 297;
const MARGIN = 10;
const PAGE_SIZE = COLS * ROWS;
const SAMPLE_STOPS = [PAGE_SIZE, PAGE_SIZE * 2];

function qrDataUrl(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  return qr.createDataURL(6, 4);
}

function extraLine(s) {
  return [s.program, s.year, s.college].filter(Boolean).join(' - ');
}

function sanitizeName(s) {
  return String(s || 'Unspecified').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Unspecified';
}

function groupStudents(students, levels) {
  if (!levels.length) return [{ path: [], students }];
  const [field, ...rest] = levels;
  const buckets = new Map();
  for (const s of students) {
    const key = (s[field] || '').trim() || 'Unspecified';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(s);
  }
  const groups = [];
  for (const [key, list] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const sub of groupStudents(list, rest)) groups.push({ path: [key, ...sub.path], students: sub.students });
  }
  return groups;
}

function pdfDims() {
  const cellW = (PAGE_W - MARGIN * 2) / COLS;
  const cellH = (PAGE_H - MARGIN * 2) / ROWS;
  return { cellW, cellH, qrSize: Math.min(cellW, cellH) * 0.62 };
}

function drawStudent(doc, s, i, { cellW, cellH, qrSize }) {
  const onPage = i % PAGE_SIZE;
  if (onPage === 0 && i !== 0) doc.addPage();

  const col = onPage % COLS, row = Math.floor(onPage / COLS);
  const cellX = MARGIN + col * cellW, cellY = MARGIN + row * cellH;
  const qrX = cellX + (cellW - qrSize) / 2, qrY = cellY + 2;
  const textX = cellX + cellW / 2;

  doc.addImage(qrDataUrl(s.id), 'PNG', qrX, qrY, qrSize, qrSize);
  doc.setFontSize(8);
  let ty = qrY + qrSize + 4;
  doc.text(String(s.id), textX, ty, { align: 'center' });
  const extra = extraLine(s);
  if (extra) { ty += 4; doc.text(extra, textX, ty, { align: 'center' }); }
  ty += 4;
  doc.text(String(s.name || ''), textX, ty, { align: 'center' });
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

export function formatBytes(bytes) {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export async function estimateQrPdfSize(students, onProgress) {
  const n = students.length;
  const pages = Math.ceil(n / PAGE_SIZE);
  if (!n) return { pages: 0, bytes: 0 };

  await nextFrame();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const dims = pdfDims();

  const sampleTotal = Math.min(n, PAGE_SIZE * 2);
  const stops = SAMPLE_STOPS.filter((s) => s <= sampleTotal);
  if (!stops.length || stops[stops.length - 1] !== sampleTotal) stops.push(sampleTotal);

  const sizes = [];
  let stopIdx = 0;
  for (let i = 0; i < sampleTotal; i++) {
    drawStudent(doc, students[i], i, dims);
    if (onProgress) onProgress((i + 1) / sampleTotal);
    if (i % 8 === 7) await nextFrame();
    if (stopIdx < stops.length && i + 1 === stops[stopIdx]) {
      sizes.push({ count: i + 1, bytes: doc.output('arraybuffer').byteLength });
      stopIdx++;
    }
  }

  if (sizes.length < 2) return { pages, bytes: sizes[0] ? sizes[0].bytes * (n / sizes[0].count) : 0 };

  const a = sizes[0], b = sizes[sizes.length - 1];
  const perStudent = (b.bytes - a.bytes) / (b.count - a.count);
  const fixed = a.bytes - perStudent * a.count;
  const bytes = Math.max(b.bytes, fixed + perStudent * n);
  return { pages, bytes };
}

export async function downloadQrSheet(students, filename = 'qr-codes.pdf', onProgress) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const dims = pdfDims();

  await nextFrame();

  for (let i = 0; i < students.length; i++) {
    drawStudent(doc, students[i], i, dims);
    if (onProgress) onProgress((i + 1) / students.length);
    if (i % PAGE_SIZE === PAGE_SIZE - 1) await nextFrame();
  }

  doc.save(filename);
}

export async function downloadQrPackage(students, opts, filename = 'qrcode.zip', onProgress) {
  const levels = [];
  if (opts.byCollege) levels.push('college');
  if (opts.byProgram) levels.push('program');
  if (opts.byYear) levels.push('year');

  if (!levels.length) return downloadQrSheet(students, 'qr-codes.pdf', onProgress);

  const groups = groupStudents(students, levels);
  const zip = new window.JSZip();
  const root = zip.folder('qrcode');
  const dims = pdfDims();
  const total = students.length || 1;
  let done = 0;

  for (const g of groups) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    for (let i = 0; i < g.students.length; i++) {
      drawStudent(doc, g.students[i], i, dims);
      done++;
      if (onProgress) onProgress((done / total) * 0.9);
      if (i % PAGE_SIZE === PAGE_SIZE - 1) await nextFrame();
    }
    let folder = root;
    for (let i = 0; i < g.path.length - 1; i++) folder = folder.folder(sanitizeName(g.path[i]));
    const leafName = g.path.length ? sanitizeName(g.path[g.path.length - 1]) : 'qr-codes';
    folder.file(`${leafName}.pdf`, doc.output('arraybuffer'));
    await nextFrame();
  }

  const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
    if (onProgress) onProgress(0.9 + (meta.percent / 100) * 0.1);
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}