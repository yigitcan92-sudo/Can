// Leest de scopelist (SSV/TSA-tabbladen) naar records die rechtstreeks in de
// database passen. Werkt zowel in de browser als in Node (via exceljs).
import { SSV_STATUSES, TSA_STATUSES, normalizeStatus } from './statuses.js';
import { parseAddress } from './address.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// kolomnaam in de scopelist -> veld in de database (keys al genormaliseerd)
const SSV_COLUMNS = {
  address: 'address',
  unitnumber: 'unit_number',
  pop: 'pop',
  ssvresponsible: 'responsible',
  ssvstatus: 'status',
  anetremarks: 'remarks',
};

const TSA_COLUMNS = {
  address: 'address',
  pop: 'pop',
  tsastatus: 'status',
  avdate: 'av_date',
  aantalpogingen: 'attempts',
  stoponderhandelen: 'stop_negotiating',
  name: 'contact_name',
  phonenumber: 'phone',
  mail: 'email',
  tsaremarks: 'remarks',
  tsaresponsible: 'responsible',
};

function cellValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result); // formule
    if ('text' in v) return v.text; // hyperlink
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    return null;
  }
  return v;
}

function toText(v) {
  v = cellValue(v);
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toDate(v) {
  v = cellValue(v);
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel-serienummer
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : null;
}

function toInt(v) {
  v = cellValue(v);
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  v = cellValue(v);
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  return ['ja', 'yes', 'y', 'x', 'true', '1', 'stop', 'waar'].includes(String(v).trim().toLowerCase());
}

// rows: array van arrays (eerste rij met "address" wordt als kop gezien)
export function parseSheetRows(rows, mapping) {
  const headerIdx = rows.findIndex((r) => (r || []).some((c) => norm(toText(c)) === 'address'));
  if (headerIdx < 0) throw new Error('Geen kolom "ADDRESS" gevonden in tabblad');
  const header = rows[headerIdx].map((c) => mapping[norm(toText(c))] ?? null);
  const out = [];
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r) continue;
    const rec = {};
    header.forEach((field, i) => {
      if (field) rec[field] = r[i];
    });
    if (!toText(rec.address)) continue;
    out.push(rec);
  }
  return out;
}

export function toSsvRecord(raw) {
  const address = toText(raw.address);
  const a = parseAddress(address);
  return {
    address,
    unit_number: toText(raw.unit_number) ?? '',
    pop: toText(raw.pop),
    responsible: toText(raw.responsible),
    status: normalizeStatus(toText(raw.status), SSV_STATUSES) ?? 'Ongoing',
    remarks: toText(raw.remarks),
    street: a.street,
    house_number: a.number,
    gemeente: a.gemeente,
  };
}

export function toTsaRecord(raw) {
  const address = toText(raw.address);
  const a = parseAddress(address);
  return {
    address,
    pop: toText(raw.pop),
    status: normalizeStatus(toText(raw.status), TSA_STATUSES) ?? 'Ongoing',
    av_date: toDate(raw.av_date),
    attempts: toInt(raw.attempts) ?? 0,
    stop_negotiating: toBool(raw.stop_negotiating),
    contact_name: toText(raw.contact_name),
    phone: toText(raw.phone),
    email: toText(raw.email),
    remarks: toText(raw.remarks),
    responsible: toText(raw.responsible),
    street: a.street,
    house_number: a.number,
    gemeente: a.gemeente,
  };
}

function dedupe(records, keyFn) {
  const map = new Map();
  for (const r of records) map.set(keyFn(r), r); // laatste rij wint
  return [...map.values()];
}

export const ssvKey = (r) => `${r.address.toLowerCase()}|${(r.unit_number || '').toLowerCase()}`;
export const tsaKey = (r) => r.address.toLowerCase();

function findSheet(workbook, name) {
  const sheets = workbook.worksheets;
  return (
    sheets.find((s) => norm(s.name) === name) ??
    sheets.find((s) => norm(s.name).startsWith(name)) ??
    null
  );
}

function sheetToRows(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    // exceljs: row.values is 1-based
    rows[n - 1] = row.values.slice(1);
  });
  return rows;
}

// workbook: een geladen ExcelJS.Workbook
export function parseScopelist(workbook) {
  const result = { ssv: [], tsa: [], warnings: [] };
  const ssvSheet = findSheet(workbook, 'ssv');
  const tsaSheet = findSheet(workbook, 'tsa');
  if (!ssvSheet) result.warnings.push('Geen SSV-tabblad gevonden');
  if (!tsaSheet) result.warnings.push('Geen TSA-tabblad gevonden');

  if (ssvSheet) {
    const recs = parseSheetRows(sheetToRows(ssvSheet), SSV_COLUMNS).map(toSsvRecord);
    result.ssv = dedupe(recs, ssvKey);
    if (result.ssv.length < recs.length)
      result.warnings.push(`SSV: ${recs.length - result.ssv.length} dubbele rijen samengevoegd`);
  }
  if (tsaSheet) {
    const recs = parseSheetRows(sheetToRows(tsaSheet), TSA_COLUMNS).map(toTsaRecord);
    result.tsa = dedupe(recs, tsaKey);
    if (result.tsa.length < recs.length)
      result.warnings.push(`TSA: ${recs.length - result.tsa.length} dubbele rijen samengevoegd`);
  }
  const unknown = new Set();
  result.ssv.forEach((r) => !SSV_STATUSES.includes(r.status) && unknown.add(`SSV "${r.status}"`));
  result.tsa.forEach((r) => !TSA_STATUSES.includes(r.status) && unknown.add(`TSA "${r.status}"`));
  if (unknown.size) result.warnings.push(`Onbekende statuswaarden: ${[...unknown].join(', ')}`);
  return result;
}

export function responsiblesIn({ ssv, tsa }) {
  const names = new Set();
  [...ssv, ...tsa].forEach((r) => r.responsible && names.add(r.responsible));
  return [...names].sort();
}
