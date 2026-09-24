#!/usr/bin/env node
// Maakt een klein voorbeeldbestand met de scopelist-structuur, handig om de import te testen.
//   node scripts/make-sample-scopelist.mjs voorbeeld-scopelist.xlsx
import ExcelJS from 'exceljs';

const out = process.argv[2] ?? 'voorbeeld-scopelist.xlsx';
const wb = new ExcelJS.Workbook();
const ssv = wb.addWorksheet('SSV');
ssv.addRow(['ADDRESS', 'UNIT NUMBER', 'POP', 'SSV-RESPONSIBLE', 'SSV STATUS', 'A-NET REMARKS']);
ssv.addRow(['Stationsstraat 10, 9100 Sint-Niklaas', '', 'POP-SIN-01', 'Stijn Verdegem', 'Ongoing', '']);
ssv.addRow(['Stationsstraat 12, 9100 Sint-Niklaas', 'A', 'POP-SIN-01', 'Stijn Verdegem', 'Done', 'Kelder via achterdeur']);
ssv.addRow(['Kerkstraat 3, 9120 Beveren', '', 'POP-BEV-01', 'Nieuwe Onderaannemer', 'No Access', '']);
const tsa = wb.addWorksheet('TSA');
tsa.addRow(['Address', 'POP', 'TSA STATUS', 'AV DATE', 'Aantal Pogingen', 'Stop Onderhandelen', 'NAME', 'PHONE NUMBER', 'MAIL', 'TSA REMARKS', 'TSA responsible']);
tsa.addRow(['Residentie Parkzicht, Parklaan 5, 9100 Sint-Niklaas', 'POP-SIN-02', 'Last Call', new Date('2026-10-15'), 3, '', 'Syndicus Parkzicht', '0470 12 34 56', 'info@parkzicht.be', 'AV in oktober', 'Sharif Rasoli']);
await wb.xlsx.writeFile(out);
console.log(`Geschreven: ${out}`);
