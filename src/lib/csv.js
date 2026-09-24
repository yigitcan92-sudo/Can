function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Puntkomma als scheidingsteken + BOM zodat Excel (BE/NL) het correct opent
export function toCsv(rows, cols) {
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n');
}

export function downloadCsv(filename, rows, cols) {
  const blob = new Blob(['﻿' + toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
