// Demo-backend: zelfde interface als de Supabase-backend, maar alles in localStorage.
// Wijzigingen worden via BroadcastChannel live gedeeld tussen tabbladen, zodat het
// "live bijwerken" ook zonder server te zien is. Rechten worden nagebootst.
import { SSV_STATUSES, TSA_STATUSES } from '../lib/statuses.js';
import { parseAddress } from '../lib/address.js';

const KEY = 'fiberklaar-demo-v1';
const SESSION_KEY = 'fiberklaar-demo-session';

const DEMO_USERS = [
  { id: 'u-mehmet', email: 'mehmet@demo', full_name: 'Mehmet Can Yigit', role: 'coordinator', responsible_name: 'Mehmet Can Yigit' },
  { id: 'u-stijn', email: 'stijn@demo', full_name: 'Stijn Verdegem', role: 'surveyor', responsible_name: 'Stijn Verdegem' },
  { id: 'u-sharif', email: 'sharif@demo', full_name: 'Sharif Rasoli', role: 'surveyor', responsible_name: 'Sharif Rasoli' },
  { id: 'u-baas', email: 'management@demo', full_name: 'Management', role: 'management', responsible_name: null },
];

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function seed() {
  const r = rng(42);
  const pick = (arr, w) => {
    if (!w) return arr[Math.floor(r() * arr.length)];
    const t = w.reduce((a, b) => a + b, 0);
    let x = r() * t;
    for (let i = 0; i < arr.length; i++) if ((x -= w[i]) < 0) return arr[i];
    return arr[arr.length - 1];
  };
  const places = [
    { g: 'Beveren', pc: '9120', lat: 51.212, lon: 4.256, streets: ['Kerkstraat', 'Grote Markt', 'Stationsstraat', 'Gentseweg', 'Oost-Hul', 'Kallobaan', 'Vrasenestraat'] },
    { g: 'Kruibeke', pc: '9150', lat: 51.17, lon: 4.31, streets: ['Dorpstraat', 'Molenstraat', 'Bazelstraat', 'Scheldestraat', 'Kapelstraat'] },
    { g: 'Temse', pc: '9140', lat: 51.127, lon: 4.213, streets: ['Kasteelstraat', 'Frans Courtensstraat', 'Wilfordkaai', 'Krijgsbaan', 'Hollebeek'] },
    { g: 'Sint-Niklaas', pc: '9100', lat: 51.165, lon: 4.143, streets: ['Ankerstraat', 'Stationsstraat', 'Plezantstraat', 'Mercatorstraat', 'Parklaan', 'Hofstraat', 'Kokkelbeekstraat'] },
    { g: 'Waasmunster', pc: '9250', lat: 51.108, lon: 4.086, streets: ['Gemeenteplein', 'Belselestraat', 'Kerkstraat', 'Ommegangstraat'] },
  ];
  const people = ['Mehmet Can Yigit', 'Stijn Verdegem', 'Sharif Rasoli', 'Stefanos Stylianidis', 'CST To manage', 'Waiting Surveyor'];
  const ssv = [];
  const tsa = [];
  const history = [];
  let id = 1;
  const now = Date.now();
  places.forEach((p, pi) => {
    p.streets.forEach((s, si) => {
      const pop = `POP-${p.g.slice(0, 3).toUpperCase()}-${String(1 + (si % 3)).padStart(2, '0')}`;
      const baseLat = p.lat + (r() - 0.5) * 0.03;
      const baseLon = p.lon + (r() - 0.5) * 0.04;
      const dir = r() * Math.PI;
      const owner = people[(pi + si) % 4];
      const n = 6 + Math.floor(r() * 12);
      for (let k = 0; k < n; k++) {
        const nr = 1 + k * 2 + Math.floor(r() * 2);
        const address = `${s} ${nr}, ${p.pc} ${p.g}`;
        const status = pick(SSV_STATUSES, [30, 35, 6, 5, 5, 6, 3, 3, 7]);
        const row = {
          id: id++, address, unit_number: '', pop, gemeente: p.g, street: s, house_number: nr,
          responsible: r() < 0.12 ? pick(['Waiting Surveyor', 'CST To manage']) : owner,
          status, remarks: r() < 0.2 ? pick(['Klant niet thuis', 'Sleutel bij buren', 'Terugkomen na 17u', 'Kelder onder water']) : null,
          route_order: null,
          lat: baseLat + Math.cos(dir) * k * 0.0004, lon: baseLon + Math.sin(dir) * k * 0.0006,
          updated_at: new Date(now - r() * 30 * 864e5).toISOString(),
        };
        ssv.push(row);
        history.push({ kind: 'ssv', address_id: row.id, old_status: null, new_status: 'Ongoing', changed_at: new Date(now - (84 + r() * 20) * 864e5).toISOString() });
        if (status !== 'Ongoing')
          history.push({ kind: 'ssv', address_id: row.id, old_status: 'Ongoing', new_status: status, changed_at: new Date(now - r() * 84 * 864e5).toISOString() });
        if (k % 4 === 0) {
          const ts = pick(TSA_STATUSES, [30, 10, 5, 20, 8, 6, 5, 8, 4]);
          const t = {
            id: id++, address: `${s} ${nr} (residentie), ${p.pc} ${p.g}`, pop, gemeente: p.g, street: s, house_number: nr,
            status: ts, av_date: r() < 0.3 ? new Date(now + (r() - 0.3) * 60 * 864e5).toISOString().slice(0, 10) : null,
            attempts: Math.floor(r() * 5), stop_negotiating: r() < 0.05,
            contact_name: pick(['Syndicus Waasland BV', 'Immo De Vos', 'VME Residentie', 'Beheer Janssens']),
            phone: `04${Math.floor(70 + r() * 29)} ${Math.floor(10 + r() * 89)} ${Math.floor(10 + r() * 89)} ${Math.floor(10 + r() * 89)}`,
            email: `info@syndicus${Math.floor(r() * 90)}.be`, remarks: null,
            responsible: owner, appointment_date: null, construction_date: null, route_order: null,
            lat: row.lat, lon: row.lon, updated_at: new Date(now - r() * 30 * 864e5).toISOString(),
          };
          tsa.push(t);
          history.push({ kind: 'tsa', address_id: t.id, old_status: null, new_status: 'Ongoing', changed_at: new Date(now - (84 + r() * 20) * 864e5).toISOString() });
          if (ts !== 'Ongoing')
            history.push({ kind: 'tsa', address_id: t.id, old_status: 'Ongoing', new_status: ts, changed_at: new Date(now - r() * 84 * 864e5).toISOString() });
        }
      }
    });
  });
  const responsibles = people.map((name, i) => ({
    id: i + 1, name, kind: name === 'CST To manage' ? 'team' : name === 'Waiting Surveyor' ? 'queue' : 'surveyor', active: true,
  }));
  return { nextId: id, ssv, tsa, responsibles, profiles: DEMO_USERS, dossier: [], documents: [], history };
}

// Browseropslag kan geblokkeerd zijn (privévenster, ingesloten frames): nooit laten crashen
const store = {
  get: (s, k) => { try { return s().getItem(k); } catch { return null; } },
  set: (s, k, v) => { try { s().setItem(k, v); return true; } catch { return false; } },
  del: (s, k) => { try { s().removeItem(k); } catch { /* genegeerd */ } },
};
const local = () => localStorage;
const session = () => sessionStorage;
let memorySession = null;

export function createDemoBackend() {
  let db;
  try {
    db = JSON.parse(store.get(local, KEY)) || seed();
  } catch {
    db = seed();
  }
  const listeners = new Set();
  const authListeners = new Set();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fiberklaar-demo') : null;

  const persist = () => {
    store.set(local, KEY, JSON.stringify(db));
  };
  persist();

  function emit(evt, broadcast = true) {
    listeners.forEach((cb) => cb(evt));
    if (broadcast) channel?.postMessage(evt);
  }
  channel?.addEventListener('message', (m) => {
    try {
      db = JSON.parse(store.get(local, KEY)) || db;
    } catch { /* oude stand houden */ }
    emit(m.data, false);
  });

  const me = () => {
    const id = store.get(session, SESSION_KEY) ?? memorySession;
    return db.profiles.find((p) => p.id === id) || null;
  };
  const role = () => me()?.role;
  const canSee = (row) => ['coordinator', 'management'].includes(role()) || row.responsible === me()?.responsible_name;
  const canEdit = (row) => role() === 'coordinator' || (role() === 'surveyor' && row.responsible === me()?.responsible_name);
  const requireCoord = () => {
    if (role() !== 'coordinator') throw new Error('Enkel de coördinator kan dit doen');
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const TABLE = { ssv: 'ssv_addresses', tsa: 'tsa_addresses' };

  function writeAddress(kind, id, patch) {
    const row = db[kind].find((r) => r.id === id);
    if (!row || !canEdit(row)) throw new Error('Geen rechten op dit adres');
    if (role() !== 'coordinator' && ['responsible', 'address', 'pop', 'route_order'].some((k) => k in patch && patch[k] !== row[k]))
      throw new Error('Enkel de coördinator kan adressen toewijzen of wijzigen');
    const old = clone(row);
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    if (patch.status && patch.status !== old.status)
      db.history.push({ kind, address_id: id, old_status: old.status, new_status: patch.status, changed_at: row.updated_at });
    return { old, row };
  }

  return {
    mode: 'demo',
    demoUsers: DEMO_USERS,

    async getSession() {
      return me() ? { user: { id: me().id, email: me().email } } : null;
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signIn(userId) {
      memorySession = userId;
      store.set(session, SESSION_KEY, userId);
      authListeners.forEach((cb) => cb({ user: { id: userId } }));
    },
    async signOut() {
      memorySession = null;
      store.del(session, SESSION_KEY);
      authListeners.forEach((cb) => cb(null));
    },
    async getProfile() {
      return clone(me());
    },
    resetDemo() {
      store.del(local, KEY);
      window.location.reload();
    },

    async listResponsibles() {
      return clone(db.responsibles).sort((a, b) => a.name.localeCompare(b.name));
    },
    async saveResponsible(r) {
      requireCoord();
      if (r.id) {
        const cur = db.responsibles.find((x) => x.id === r.id);
        const oldName = cur.name;
        Object.assign(cur, { name: r.name, kind: r.kind, active: r.active });
        if (oldName !== r.name) {
          // "on update cascade" nabootsen
          for (const k of ['ssv', 'tsa']) db[k].forEach((a) => a.responsible === oldName && (a.responsible = r.name));
          db.profiles.forEach((p) => p.responsible_name === oldName && (p.responsible_name = r.name));
        }
      } else {
        if (db.responsibles.some((x) => x.name === r.name)) throw new Error('Naam bestaat al');
        db.responsibles.push({ id: db.nextId++, name: r.name, kind: r.kind || 'surveyor', active: r.active ?? true });
      }
      persist();
      emit({ table: 'responsibles', eventType: 'UPDATE' });
    },
    async deleteResponsible(id) {
      requireCoord();
      const cur = db.responsibles.find((x) => x.id === id);
      db.responsibles = db.responsibles.filter((x) => x.id !== id);
      for (const k of ['ssv', 'tsa']) db[k].forEach((a) => a.responsible === cur?.name && (a.responsible = null));
      persist();
      emit({ table: 'responsibles', eventType: 'DELETE' });
    },

    async listProfiles() {
      return clone(role() === 'surveyor' ? [me()] : db.profiles);
    },
    async updateProfile(id, patch) {
      requireCoord();
      Object.assign(db.profiles.find((p) => p.id === id), patch);
      persist();
    },

    async listAddresses(kind) {
      return clone(db[kind].filter(canSee));
    },
    async updateAddress(kind, id, patch) {
      const { old, row } = writeAddress(kind, id, patch);
      persist();
      emit({ table: TABLE[kind], eventType: 'UPDATE', new: clone(row), old });
      return clone(row);
    },
    async applyAssignments(kind, items) {
      requireCoord();
      for (const i of items) {
        const row = db[kind].find((r) => r.id === i.id);
        if (row) Object.assign(row, { responsible: i.responsible, route_order: i.route_order });
      }
      persist();
      emit({ table: TABLE[kind], eventType: 'BULK' });
      return items.length;
    },
    async statusHistory(kind) {
      const visible = new Set(db[kind].filter(canSee).map((r) => r.id));
      return clone(db.history.filter((h) => h.kind === kind && visible.has(h.address_id))).sort((a, b) =>
        a.changed_at.localeCompare(b.changed_at),
      );
    },

    async listDossier(tsaId) {
      return clone(db.dossier.filter((d) => d.tsa_id === tsaId)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async addDossierEntry(entry, profile) {
      const row = db.tsa.find((r) => r.id === entry.tsa_id);
      if (!row || !canEdit(row)) throw new Error('Geen rechten op dit dossier');
      const e = { id: db.nextId++, ...entry, created_by: profile.id, created_by_name: profile.full_name, created_at: new Date().toISOString() };
      db.dossier.push(e);
      persist();
      emit({ table: 'dossier_entries', eventType: 'INSERT', new: e });
      return e;
    },
    async deleteDossierEntry(id) {
      const e = db.dossier.find((d) => d.id === id);
      if (role() !== 'coordinator' && e?.created_by !== me()?.id) throw new Error('Geen rechten');
      db.dossier = db.dossier.filter((d) => d.id !== id);
      persist();
      emit({ table: 'dossier_entries', eventType: 'DELETE', old: { id, tsa_id: e?.tsa_id } });
    },

    async listDocuments(tsaId) {
      return clone(db.documents.filter((d) => d.tsa_id === tsaId).map(({ data, ...d }) => d));
    },
    async uploadDocument(tsaId, file, profile) {
      const row = db.tsa.find((r) => r.id === tsaId);
      if (!row || !canEdit(row)) throw new Error('Geen rechten op dit dossier');
      if (file.size > 1.5e6) throw new Error('Demo-modus: max. 1,5 MB per bestand (met Supabase geen beperking)');
      const data = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      const d = {
        id: db.nextId++, tsa_id: tsaId, file_name: file.name, size: file.size, content_type: file.type,
        uploaded_by: profile.id, uploaded_by_name: profile.full_name, uploaded_at: new Date().toISOString(), data,
      };
      db.documents.push(d);
      persist();
      emit({ table: 'dossier_documents', eventType: 'INSERT', new: { id: d.id, tsa_id: tsaId } });
    },
    async downloadDocument(doc) {
      const d = db.documents.find((x) => x.id === doc.id);
      const a = document.createElement('a');
      a.href = d.data;
      a.download = d.file_name;
      a.click();
    },
    async deleteDocument(doc) {
      if (role() !== 'coordinator' && doc.uploaded_by !== me()?.id) throw new Error('Geen rechten');
      db.documents = db.documents.filter((x) => x.id !== doc.id);
      persist();
      emit({ table: 'dossier_documents', eventType: 'DELETE', old: { id: doc.id, tsa_id: doc.tsa_id } });
    },

    async importScopelist(data, mode) {
      requireCoord();
      for (const name of new Set([...data.ssv, ...data.tsa].map((r) => r.responsible).filter(Boolean)))
        if (!db.responsibles.some((r) => r.name === name))
          db.responsibles.push({ id: db.nextId++, name, kind: 'surveyor', active: true });
      const merge = (kind, recs, keyFn) => {
        const idx = new Map(db[kind].map((r) => [keyFn(r), r]));
        for (const rec of recs) {
          const cur = idx.get(keyFn(rec));
          if (cur) {
            if (mode === 'full') Object.assign(cur, rec);
          } else {
            const row = { id: db.nextId++, route_order: null, lat: null, lon: null, ...rec, updated_at: new Date().toISOString() };
            db[kind].push(row);
            db.history.push({ kind, address_id: row.id, old_status: null, new_status: row.status, changed_at: row.updated_at });
          }
        }
      };
      merge('ssv', data.ssv, (r) => `${r.address.toLowerCase()}|${(r.unit_number || '').toLowerCase()}`);
      merge('tsa', data.tsa, (r) => r.address.toLowerCase());
      persist();
      emit({ table: 'ssv_addresses', eventType: 'BULK' });
      emit({ table: 'tsa_addresses', eventType: 'BULK' });
    },

    async geocodeMissing(kind) {
      requireCoord();
      // Demo: benadering op basis van het gemeentecentrum (geen externe API)
      const centers = { Beveren: [51.212, 4.256], Kruibeke: [51.17, 4.31], Temse: [51.127, 4.213], 'Sint-Niklaas': [51.165, 4.143], Waasmunster: [51.108, 4.086] };
      let n = 0;
      for (const row of db[kind]) {
        if (row.lat != null) continue;
        const c = centers[row.gemeente || parseAddress(row.address).gemeente];
        if (!c) continue;
        row.lat = c[0] + (Math.random() - 0.5) * 0.02;
        row.lon = c[1] + (Math.random() - 0.5) * 0.03;
        n++;
      }
      persist();
      emit({ table: TABLE[kind], eventType: 'BULK' });
      return { geocoded: n, remaining: 0 };
    },

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
