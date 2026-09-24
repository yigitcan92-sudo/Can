// Geocoding met cache. Gebruikt Google Geocoding als er een API-sleutel is,
// anders OpenStreetMap Nominatim (max. 1 verzoek per seconde).
import { parseAddress } from './address.js';

export function geocodeKey(address) {
  return String(address).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Adres zonder busnummer en met land, geschikt voor de geocoder
export function geocodeQuery(address) {
  const a = parseAddress(address);
  const nr = a.number ? ` ${a.number}${a.suffix}` : '';
  const place = [a.postcode, a.gemeente].filter(Boolean).join(' ');
  return `${a.street}${nr}${place ? `, ${place}` : ''}, België`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function geocodeOne(address, { googleKey, fetchImpl = fetch } = {}) {
  const q = geocodeQuery(address);
  if (googleKey) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?region=be&address=${encodeURIComponent(q)}&key=${googleKey}`;
    const res = await fetchImpl(url);
    const json = await res.json();
    if (json.status === 'ZERO_RESULTS') return null;
    if (json.status !== 'OK') throw new Error(`Google geocoding: ${json.status} ${json.error_message ?? ''}`);
    const r = json.results[0];
    return { lat: r.geometry.location.lat, lon: r.geometry.location.lng, formatted: r.formatted_address, provider: 'google' };
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=be&q=${encodeURIComponent(q)}`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'fiberklaar-waasland/1.0' } });
  if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.length) return null;
  return { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon), formatted: json[0].display_name, provider: 'nominatim' };
}

/**
 * Geocodeert een lijst adressen; `cache` is een Map(key -> {lat, lon}).
 * Geeft nieuwe cache-rijen terug (ook mislukte, met lat/lon null, zodat ze niet
 * telkens opnieuw worden opgevraagd).
 */
export async function geocodeMany(addresses, cache, { googleKey, onProgress, fetchImpl } = {}) {
  const todo = [...new Set(addresses.map(geocodeKey))].filter((k) => !cache.has(k));
  const fresh = [];
  for (let i = 0; i < todo.length; i++) {
    const key = todo[i];
    let hit = null;
    try {
      hit = await geocodeOne(key, { googleKey, fetchImpl });
    } catch (e) {
      onProgress?.({ done: i + 1, total: todo.length, error: e.message });
      if (/OVER_QUERY_LIMIT|REQUEST_DENIED|HTTP 429/.test(e.message)) break;
      continue;
    }
    const row = { address_key: key, lat: hit?.lat ?? null, lon: hit?.lon ?? null, formatted: hit?.formatted ?? null, provider: hit?.provider ?? (googleKey ? 'google' : 'nominatim') };
    cache.set(key, row);
    fresh.push(row);
    onProgress?.({ done: i + 1, total: todo.length });
    if (!googleKey) await sleep(1100);
  }
  return fresh;
}
