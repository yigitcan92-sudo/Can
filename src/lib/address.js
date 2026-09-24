import { GEMEENTEN } from './statuses.js';

// Splitst "Kerkstraat 12A bus 3, 9120 Beveren" in onderdelen.
// Robuust genoeg voor de schrijfwijzen in de scopelist; wat niet herkend wordt
// valt terug op de volledige string als straat.
export function parseAddress(raw) {
  const full = String(raw ?? '').replace(/\s+/g, ' ').trim();
  let rest = full;
  let postcode = null;
  let gemeente = null;

  const pc = rest.match(/,?\s*(\d{4})\s+([A-Za-zÀ-ÿ' -]+)$/);
  if (pc) {
    postcode = pc[1];
    gemeente = pc[2].trim();
    rest = rest.slice(0, pc.index).trim();
  } else {
    const g = GEMEENTEN.find((name) => new RegExp(`[, ]${name}$`, 'i').test(rest));
    if (g) {
      gemeente = g;
      rest = rest.slice(0, rest.length - g.length).replace(/[,\s]+$/, '');
    }
  }
  if (gemeente) {
    const known = GEMEENTEN.find((g) => g.toLowerCase() === gemeente.toLowerCase());
    if (known) gemeente = known;
  }

  const m = rest.match(/^(.*?)[ ,]+(\d+)\s*([A-Za-z]?)(?:\s*(?:bus|bte|b\.?|\/)\s*(\S+))?\s*$/i);
  let street = rest;
  let number = null;
  let suffix = '';
  if (m && m[1]) {
    // "Residentie Parkzicht, Parklaan 5" -> straat is het laatste deel
    street = m[1].split(',').pop().trim();
    number = parseInt(m[2], 10);
    suffix = (m[3] || '').toUpperCase();
  }
  return { full, street, number, suffix, postcode, gemeente };
}

export function streetKey(raw) {
  const { street, gemeente } = parseAddress(raw);
  return `${street.toLowerCase()}|${(gemeente || '').toLowerCase()}`;
}
