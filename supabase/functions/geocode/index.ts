// Supabase Edge Function: haalt ontbrekende coördinaten op voor SSV/TSA-adressen.
// Enkel voor de coördinator. De Google-sleutel blijft server-side.
//
//   supabase secrets set GOOGLE_MAPS_API_KEY=...
//   supabase functions deploy geocode
//
// Zonder GOOGLE_MAPS_API_KEY valt de functie terug op OpenStreetMap Nominatim (1 verzoek/s).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const key = (a: string) => a.toLowerCase().replace(/\s+/g, ' ').trim();

// "Kerkstraat 12A bus 3, 9120 Beveren" -> "Kerkstraat 12A, 9120 Beveren, België"
function query(address: string) {
  const cleaned = address.replace(/\s+(bus|bte|b\.)\s*\S+/i, '').replace(/\s*\(.*?\)\s*/g, ' ');
  return `${cleaned.replace(/\s+/g, ' ').trim()}, België`;
}

async function geocode(address: string, googleKey?: string) {
  const q = query(address);
  if (googleKey) {
    const r = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?region=be&address=${encodeURIComponent(q)}&key=${googleKey}`,
    );
    const j = await r.json();
    if (j.status === 'ZERO_RESULTS') return null;
    if (j.status !== 'OK') throw new Error(`Google: ${j.status}`);
    const g = j.results[0];
    return { lat: g.geometry.location.lat, lon: g.geometry.location.lng, formatted: g.formatted_address, provider: 'google' };
  }
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=be&q=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': 'fiberklaar-waasland/1.0' } },
  );
  if (!r.ok) throw new Error(`Nominatim: HTTP ${r.status}`);
  const j = await r.json();
  if (!j.length) return null;
  return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon), formatted: j[0].display_name, provider: 'nominatim' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    // rechten controleren met de sessie van de gebruiker
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isCoord, error: roleErr } = await userClient.rpc('is_coordinator');
    if (roleErr || !isCoord) return json({ error: 'Enkel de coördinator kan geocoderen' }, 403);

    const { kind = 'ssv', limit = 200 } = await req.json().catch(() => ({}));
    const table = kind === 'tsa' ? 'tsa_addresses' : 'ssv_addresses';
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? undefined;
    // Nominatim: max 1/s, dus kleinere batches om binnen de functie-timeout te blijven
    const batch = Math.min(Number(limit) || 200, googleKey ? 500 : 40);

    // alle adressen zonder coördinaten; adressen die eerder niet gevonden werden
    // (lat null in de cache) worden overgeslagen zodat de batch niet blijft hangen
    const { data: allRows, error } = await admin.from(table).select('id, address').is('lat', null).limit(10000);
    if (error) throw error;
    const allKeys = [...new Set(allRows.map((r) => key(r.address)))];
    const cache = new Map();
    for (let i = 0; i < allKeys.length; i += 200) {
      const { data: cached } = await admin.from('geocode_cache').select('*').in('address_key', allKeys.slice(i, i + 200));
      (cached ?? []).forEach((c) => cache.set(c.address_key, c));
    }
    const todo = allKeys.filter((k) => !cache.has(k));
    const keys = todo.slice(0, batch);
    const rows = allRows.filter((r) => keys.includes(key(r.address)) || cache.get(key(r.address))?.lat != null);

    let failed = 0;
    for (const k of keys) {
      if (cache.has(k)) continue;
      try {
        const hit = await geocode(k, googleKey);
        const row = { address_key: k, lat: hit?.lat ?? null, lon: hit?.lon ?? null, formatted: hit?.formatted ?? null, provider: hit?.provider ?? (googleKey ? 'google' : 'nominatim') };
        cache.set(k, row);
        await admin.from('geocode_cache').upsert(row);
      } catch (_e) {
        failed++;
      }
      if (!googleKey) await new Promise((r) => setTimeout(r, 1100));
    }

    let geocoded = 0;
    for (const r of rows) {
      const hit = cache.get(key(r.address));
      if (hit?.lat == null) continue;
      await admin.from(table).update({ lat: hit.lat, lon: hit.lon }).eq('id', r.id);
      geocoded++;
    }
    const notFound = allKeys.filter((k) => cache.has(k) && cache.get(k).lat == null).length;
    return json({ geocoded, failed, notFound, remaining: Math.max(0, todo.length - keys.length) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
