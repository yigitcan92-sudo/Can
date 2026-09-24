// Toewijzing van adressen aan surveyors op basis van POP + straat-clustering.
// Regels:
//  - een straat (straat + gemeente) wordt nooit opgesplitst over twee mensen;
//  - straten binnen dezelfde POP blijven zoveel mogelijk bij elkaar;
//  - volgorde volgt een ruimtelijke keten (nearest neighbour) zodat elke surveyor
//    een aaneengesloten gebied krijgt; werklast wordt gebalanceerd op aantal adressen.
import { streetKey, parseAddress } from './address.js';

const R = 6371;
export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const hasCoords = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

function centroid(points) {
  const pts = points.filter(hasCoords);
  if (!pts.length) return null;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
  };
}

// Nearest-neighbour keten; items zonder coördinaten achteraan (alfabetisch).
function chain(items, getPoint, fallbackSort) {
  const withPt = items.filter((i) => hasCoords(getPoint(i)));
  const without = items.filter((i) => !hasCoords(getPoint(i))).sort(fallbackSort);
  if (!withPt.length) return without;
  // start bij het meest westelijke punt: deterministisch en meestal een rand
  let current = withPt.reduce((a, b) => (getPoint(b).lon < getPoint(a).lon ? b : a));
  const rest = new Set(withPt);
  const out = [];
  while (rest.size) {
    rest.delete(current);
    out.push(current);
    let best = null;
    let bestD = Infinity;
    for (const c of rest) {
      const d = haversineKm(getPoint(current), getPoint(c));
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    current = best;
    if (!current) break;
  }
  return [...out, ...without];
}

export function buildStreetClusters(addresses) {
  const map = new Map();
  for (const a of addresses) {
    const key = streetKey(a.address);
    if (!map.has(key)) map.set(key, { key, street: parseAddress(a.address).street, items: [], pops: {} });
    const c = map.get(key);
    c.items.push(a);
    const pop = a.pop || '—';
    c.pops[pop] = (c.pops[pop] || 0) + 1;
  }
  return [...map.values()].map((c) => ({
    ...c,
    pop: Object.entries(c.pops).sort((x, y) => y[1] - x[1])[0][0],
    center: centroid(c.items),
  }));
}

function byStreetName(a, b) {
  return a.key.localeCompare(b.key);
}

function orderClusters(clusters) {
  // 1) POPs in ruimtelijke volgorde, 2) straten binnen POP als keten
  const pops = new Map();
  for (const c of clusters) {
    if (!pops.has(c.pop)) pops.set(c.pop, []);
    pops.get(c.pop).push(c);
  }
  const popList = [...pops.entries()].map(([pop, cs]) => ({ pop, cs, center: centroid(cs.map((c) => c.center).filter(Boolean)) }));
  const orderedPops = chain(popList, (p) => p.center, (a, b) => a.pop.localeCompare(b.pop, 'nl', { numeric: true }));
  return orderedPops.flatMap((p) => chain(p.cs, (c) => c.center, byStreetName));
}

// Verdeelt de geordende keten in k aaneengesloten stukken met ongeveer gelijke aantallen.
function partition(ordered, k) {
  const total = ordered.reduce((s, c) => s + c.items.length, 0);
  const parts = Array.from({ length: k }, () => []);
  let acc = 0;
  let idx = 0;
  for (const c of ordered) {
    const target = (total * (idx + 1)) / k;
    // ga naar volgende persoon als deze straat meer dan de helft over het doel zou gaan
    if (idx < k - 1 && acc > 0 && acc + c.items.length / 2 > target) idx++;
    parts[idx].push(c);
    acc += c.items.length;
  }
  return parts;
}

function routeWithin(clusters) {
  const ordered = chain(clusters, (c) => c.center, byStreetName);
  const route = [];
  let last = null;
  for (const c of ordered) {
    let items = [...c.items].sort(
      (a, b) => (a.house_number ?? 0) - (b.house_number ?? 0) || String(a.address).localeCompare(String(b.address)),
    );
    // loop de straat af vanaf het uiteinde dat het dichtst bij de vorige stop ligt
    if (last && hasCoords(last) && hasCoords(items[0]) && hasCoords(items[items.length - 1])) {
      if (haversineKm(last, items[items.length - 1]) < haversineKm(last, items[0])) items.reverse();
    }
    route.push(...items);
    last = items[items.length - 1];
  }
  return route;
}

/**
 * @param addresses [{id, address, pop, house_number, lat, lon}]
 * @param surveyors namen van surveyors die meedoen
 * @returns {assignments: [{id, responsible, route_order}], summary: [{responsible, count, streets, pops, km}]}
 */
export function proposeAssignment(addresses, surveyors) {
  if (!surveyors.length) throw new Error('Kies minstens één surveyor');
  const clusters = buildStreetClusters(addresses);
  const parts = partition(orderClusters(clusters), surveyors.length);
  const assignments = [];
  const summary = [];
  parts.forEach((cs, i) => {
    const responsible = surveyors[i];
    const route = routeWithin(cs);
    let km = 0;
    route.forEach((a, n) => {
      assignments.push({ id: a.id, responsible, route_order: n + 1 });
      if (n > 0 && hasCoords(a) && hasCoords(route[n - 1])) km += haversineKm(route[n - 1], a);
    });
    summary.push({
      responsible,
      count: route.length,
      streets: cs.map((c) => c.street),
      pops: [...new Set(cs.map((c) => c.pop))],
      km: Math.round(km * 10) / 10,
    });
  });
  return { assignments, summary };
}
