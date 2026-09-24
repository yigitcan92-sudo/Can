import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseAddress } from '../src/lib/address.js';
import { parseScopelist } from '../src/lib/scopelist.js';
import { proposeAssignment } from '../src/lib/assign.js';

test('parseAddress splitst straat, nummer, postcode en gemeente', () => {
  assert.deepEqual(parseAddress('Kerkstraat 12A bus 3, 9120 Beveren'), {
    full: 'Kerkstraat 12A bus 3, 9120 Beveren', street: 'Kerkstraat', number: 12, suffix: 'A', postcode: '9120', gemeente: 'Beveren',
  });
  const b = parseAddress('Grote Markt 5 Sint-Niklaas');
  assert.equal(b.street, 'Grote Markt');
  assert.equal(b.number, 5);
  assert.equal(b.gemeente, 'Sint-Niklaas');
  assert.equal(parseAddress('Onbekend').street, 'Onbekend');
  assert.equal(parseAddress('Residentie Parkzicht, Parklaan 5, 9100 Sint-Niklaas').street, 'Parklaan');
});

test('parseScopelist leest SSV- en TSA-tabbladen', async () => {
  const wb = new ExcelJS.Workbook();
  const ssv = wb.addWorksheet('SSV');
  ssv.addRow(['Scopelist Fiberklaar']);
  ssv.addRow(['ADDRESS', 'UNIT NUMBER', 'POP', 'SSV-RESPONSIBLE', 'SSV STATUS', 'A-NET REMARKS']);
  ssv.addRow(['Kerkstraat 1, 9120 Beveren', '', 'POP-01', 'Stijn Verdegem', 'done', 'ok']);
  ssv.addRow(['Kerkstraat 1, 9120 Beveren', '', 'POP-01', 'Stijn Verdegem', 'Ongoing', 'dubbel']);
  ssv.addRow([null, null]);
  const tsa = wb.addWorksheet('TSA ');
  tsa.addRow(['Address', 'POP', 'TSA STATUS', 'AV DATE', 'Aantal Pogingen', 'Stop Onderhandelen', 'NAME', 'PHONE NUMBER', 'MAIL', 'TSA REMARKS', 'TSA responsible']);
  tsa.addRow(['Markt 3, 9150 Kruibeke', 'POP-02', 'last call', new Date('2026-03-01'), 2, 'ja', 'Syndicus BV', '0470', 'a@b.be', 'x', 'Sharif Rasoli']);
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  const res = parseScopelist(wb2);
  assert.equal(res.ssv.length, 1);
  assert.equal(res.ssv[0].status, 'Ongoing');
  assert.equal(res.ssv[0].gemeente, 'Beveren');
  assert.equal(res.tsa.length, 1);
  assert.equal(res.tsa[0].status, 'Last Call');
  assert.equal(res.tsa[0].av_date, '2026-03-01');
  assert.equal(res.tsa[0].stop_negotiating, true);
  assert.equal(res.tsa[0].attempts, 2);
});

test('proposeAssignment splitst geen straten en balanceert', () => {
  const addrs = [];
  let id = 0;
  const streets = [['A-straat', 51.20, 4.25], ['B-straat', 51.21, 4.26], ['C-straat', 51.25, 4.30], ['D-straat', 51.26, 4.31]];
  for (const [s, lat, lon] of streets)
    for (let n = 1; n <= 10; n++)
      addrs.push({ id: ++id, address: `${s} ${n}, 9120 Beveren`, pop: 'P1', house_number: n, lat: lat + n * 1e-4, lon });
  const { assignments, summary } = proposeAssignment(addrs, ['X', 'Y']);
  assert.equal(assignments.length, 40);
  const perStreet = new Map();
  for (const a of assignments) {
    const s = addrs.find((x) => x.id === a.id).address.split(' ')[0];
    perStreet.set(s, (perStreet.get(s) || new Set()).add(a.responsible));
  }
  for (const set of perStreet.values()) assert.equal(set.size, 1);
  assert.deepEqual(summary.map((s) => s.count), [20, 20]);
  // nabije straten samen
  assert.equal([...perStreet.get('A-straat')][0], [...perStreet.get('B-straat')][0]);
});
