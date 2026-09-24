#!/usr/bin/env node
// Importeert de scopelist (SSV/TSA-tabbladen) in Supabase. Herhaalbaar.
//
//   node scripts/import-excel.mjs scopelist.xlsx [--mode=new|full] [--geocode] [--dry-run]
//
//   --mode=new   (standaard) enkel adressen toevoegen die nog niet bestaan;
//                bestaande rijen (die in de app bewerkt kunnen zijn) blijven ongemoeid
//   --mode=full  alle velden overschrijven met de waarden uit Excel
//   --geocode    ontbrekende coördinaten ophalen (Google als GOOGLE_MAPS_API_KEY gezet is,
//                anders OpenStreetMap Nominatim) en cachen in geocode_cache
//
// Vereist: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY (bv. in .env)
import { readFileSync, existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { parseScopelist, responsiblesIn } from '../src/lib/scopelist.js';
import { geocodeMany, geocodeKey } from '../src/lib/geocode.js';

function loadEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name) => args.includes(`--${name}`);
const mode = (args.find((a) => a.startsWith('--mode=')) ?? '--mode=new').split('=')[1];

if (!file || !['new', 'full'].includes(mode)) {
  console.error('Gebruik: node scripts/import-excel.mjs <scopelist.xlsx> [--mode=new|full] [--geocode] [--dry-run]');
  process.exit(1);
}

loadEnv();
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const data = parseScopelist(wb);
console.log(`Gelezen: ${data.ssv.length} SSV-adressen, ${data.tsa.length} TSA-adressen`);
data.warnings.forEach((w) => console.warn(`⚠ ${w}`));

if (flag('dry-run')) {
  console.log('Verantwoordelijken:', responsiblesIn(data).join(', '));
  console.log('Voorbeeld SSV:', data.ssv[0]);
  console.log('Voorbeeld TSA:', data.tsa[0]);
  process.exit(0);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function check(promise, what) {
  const { data: d, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return d;
}

// 1) onbekende verantwoordelijken aanmaken (anders faalt de foreign key)
const names = responsiblesIn(data);
if (names.length) {
  await check(
    db.from('responsibles').upsert(names.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true }),
    'verantwoordelijken',
  );
}

// 2) adressen upserten in blokken
async function upsert(table, rows, onConflict) {
  const size = 500;
  for (let i = 0; i < rows.length; i += size) {
    await check(
      db.from(table).upsert(rows.slice(i, i + size), { onConflict, ignoreDuplicates: mode === 'new' }),
      table,
    );
  }
  console.log(`✓ ${table}: ${rows.length} rijen verwerkt (mode=${mode})`);
}
await upsert('ssv_addresses', data.ssv, 'address,unit_number');
await upsert('tsa_addresses', data.tsa, 'address');

// 3) optioneel geocoderen
if (flag('geocode')) {
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const cacheRows = await check(db.from('geocode_cache').select('address_key, lat, lon'), 'geocode_cache');
  const cache = new Map(cacheRows.map((r) => [r.address_key, r]));
  const all = [...data.ssv, ...data.tsa].map((r) => r.address);
  console.log(`Geocoding via ${googleKey ? 'Google' : 'Nominatim'}…`);
  const fresh = await geocodeMany(all, cache, {
    googleKey,
    onProgress: ({ done, total, error }) => {
      if (error) console.warn(`  ${done}/${total} fout: ${error}`);
      else if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`);
    },
  });
  if (fresh.length) await check(db.from('geocode_cache').upsert(fresh), 'geocode_cache opslaan');

  for (const table of ['ssv_addresses', 'tsa_addresses']) {
    const rows = await check(db.from(table).select('id, address').is('lat', null), table);
    let n = 0;
    for (const r of rows) {
      const hit = cache.get(geocodeKey(r.address));
      if (hit?.lat == null) continue;
      await check(db.from(table).update({ lat: hit.lat, lon: hit.lon }).eq('id', r.id), `${table} coördinaten`);
      n++;
    }
    console.log(`✓ ${table}: ${n} adressen kregen coördinaten`);
  }
}
console.log('Klaar.');
