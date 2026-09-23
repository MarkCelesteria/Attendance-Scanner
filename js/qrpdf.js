const COLS = 4, ROWS = 7;
const PAGE_W = 210, PAGE_H = 297;
const MARGIN = 10;

function qrDataUrl(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  return qr.createDataURL(6, 4);
}

function extraLine(s) {
  return [s.program, s.year, s.college].filter(Boolean).join(' - ');
}

export function downloadQrSheet(students, filename = 'qr-codes.pdf') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const cellW = (PAGE_W - MARGIN * 2) / COLS;
  const cellH = (PAGE_H - MARGIN * 2) / ROWS;
  const qrSize = Math.min(cellW, cellH) * 0.62;

  students.forEach((s, i) => {
    const onPage = i % (COLS * ROWS);
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
  });

  doc.save(filename);
}