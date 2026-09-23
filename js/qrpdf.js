const COLS = 5, ROWS = 8;
const PAGE_W = 210, PAGE_H = 297;   
const MARGIN = 10;

function qrDataUrl(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  return qr.createDataURL(6, 4);
}

export function downloadQrSheet(students, filename = 'qr-codes.pdf') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const cellW = (PAGE_W - MARGIN * 2) / COLS;
  const cellH = (PAGE_H - MARGIN * 2) / ROWS;
  const qrSize = Math.min(cellW, cellH) * 0.7;

  students.forEach((s, i) => {
    const onPage = i % (COLS * ROWS);
    if (onPage === 0 && i !== 0) doc.addPage();

    const col = onPage % COLS, row = Math.floor(onPage / COLS);
    const cellX = MARGIN + col * cellW, cellY = MARGIN + row * cellH;
    const qrX = cellX + (cellW - qrSize) / 2, qrY = cellY + 2;

    doc.addImage(qrDataUrl(s.id), 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFontSize(8);
    doc.text(String(s.id), cellX + cellW / 2, qrY + qrSize + 4, { align: 'center' });
  });

  doc.save(filename);
}