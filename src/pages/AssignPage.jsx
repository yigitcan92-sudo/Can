import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { backend } from '../data/backend.js';
import { proposeAssignment } from '../lib/assign.js';
import { groupOf } from '../lib/statuses.js';
import { KIND_CONFIG } from './AddressDashboard.jsx';
import { useToast } from '../components/Toast.jsx';
import { downloadCsv } from '../lib/csv.js';

const PALETTE = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#b45309', '#4f46e5', '#0d9488'];

export default function AssignPage() {
  const { ssv, tsa, responsibles, reload } = useData();
  const toast = useToast();
  const [kind, setKind] = useState('ssv');
  const cfg = KIND_CONFIG[kind];
  const rows = kind === 'ssv' ? ssv : tsa;
  const [pops, setPops] = useState([]);
  const [groups, setGroups] = useState(['open']);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [surveyors, setSurveyors] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);

  const allPops = useMemo(
    () => [...new Set(rows.map((r) => r.pop).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true })),
    [rows],
  );
  const queueNames = useMemo(
    () => new Set(responsibles.filter((r) => r.kind === 'queue' || r.kind === 'team').map((r) => r.name)),
    [responsibles],
  );

  const scope = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!pops.length || pops.includes(r.pop)) &&
          groups.includes(groupOf(r.status, cfg.groups)) &&
          (!onlyUnassigned || !r.responsible || queueNames.has(r.responsible)),
      ),
    [rows, pops, groups, onlyUnassigned, cfg, queueNames],
  );
  const missingCoords = scope.filter((r) => r.lat == null).length;

  const toggle = (list, set, v) => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    setProposal(null);
  };

  function compute() {
    try {
      const res = proposeAssignment(scope, surveyors);
      const byId = new Map(scope.map((r) => [r.id, r]));
      const changed = res.assignments.filter((a) => byId.get(a.id).responsible !== a.responsible).length;
      setProposal({ ...res, byId, changed });
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function apply() {
    if (!confirm(`${proposal.assignments.length} adressen toewijzen (${proposal.changed} wijzigen van verantwoordelijke)?`)) return;
    setBusy(true);
    try {
      await backend.applyAssignments(kind, proposal.assignments);
      await reload([kind]);
      toast('Toewijzing toegepast', 'ok');
      setProposal(null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function geocode() {
    setBusy(true);
    try {
      const res = await backend.geocodeMissing(kind);
      await reload([kind]);
      toast(`${res?.geocoded ?? 0} adressen gegeocodeerd${res?.remaining ? `, nog ${res.remaining} te gaan — klik opnieuw` : ''}`, 'ok');
    } catch (e) {
      toast(`Geocoding mislukt: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  function exportRoutes() {
    const out = proposal.assignments
      .map((a) => ({ ...proposal.byId.get(a.id), responsible: a.responsible, route_order: a.route_order }))
      .sort((a, b) => a.responsible.localeCompare(b.responsible) || a.route_order - b.route_order);
    downloadCsv(`routes-${kind}-${new Date().toISOString().slice(0, 10)}.csv`, out, ['responsible', 'route_order', 'address', 'unit_number', 'pop', 'status', 'lat', 'lon']);
  }

  const color = (name) => PALETTE[surveyors.indexOf(name) % PALETTE.length];

  return (
    <div className="assign">
      <div className="page-head">
        <h2>Adressen toewijzen</h2>
        <div className="segmented">
          {['ssv', 'tsa'].map((k) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => { setKind(k); setPops([]); setProposal(null); }}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Adressen worden per straat geclusterd (een straat wordt nooit over twee mensen verdeeld), straten binnen dezelfde POP
        blijven samen, en elke surveyor krijgt een aaneengesloten gebied met een routevolgorde.
      </p>

      <div className="assign-grid">
        <div className="card">
          <h3>1. Welke adressen?</h3>
          <div className="checks">
            {Object.keys(cfg.groups).map((g) => (
              <label key={g}>
                <input type="checkbox" checked={groups.includes(g)} onChange={() => toggle(groups, setGroups, g)} /> {g}
              </label>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => { setOnlyUnassigned(e.target.checked); setProposal(null); }} />
            Enkel niet-toegewezen / wachtrij (Waiting Surveyor, CST…)
          </label>
          <h4>POP's {pops.length ? `(${pops.length})` : '(alle)'}</h4>
          <div className="checks pops">
            {allPops.map((p) => (
              <label key={p}>
                <input type="checkbox" checked={pops.includes(p)} onChange={() => toggle(pops, setPops, p)} /> {p}
              </label>
            ))}
          </div>
          <p>
            <strong>{scope.length}</strong> adressen geselecteerd
            {missingCoords > 0 && (
              <>
                {' '}· <span className="warn">{missingCoords} zonder coördinaten</span>{' '}
                <button className="small" disabled={busy} onClick={geocode}>Coördinaten ophalen</button>
              </>
            )}
          </p>
        </div>

        <div className="card">
          <h3>2. Wie gaat er op pad?</h3>
          <div className="checks">
            {responsibles.filter((r) => r.active).map((r) => (
              <label key={r.id}>
                <input type="checkbox" checked={surveyors.includes(r.name)} onChange={() => toggle(surveyors, setSurveyors, r.name)} />
                <span className="dot" style={{ background: surveyors.includes(r.name) ? color(r.name) : '#cbd5e1' }} />
                {r.name} <small className="muted">{r.kind}</small>
              </label>
            ))}
          </div>
          <button className="primary" disabled={!scope.length || !surveyors.length} onClick={compute}>
            3. Voorstel berekenen
          </button>
        </div>
      </div>

      {proposal && (
        <div className="card">
          <div className="page-head">
            <h3>Voorstel — {proposal.changed} van {proposal.assignments.length} adressen wisselen van verantwoordelijke</h3>
            <div className="actions">
              <button className="ghost" onClick={exportRoutes}>Routes CSV</button>
              <button className="primary" disabled={busy} onClick={apply}>Toewijzing toepassen</button>
            </div>
          </div>
          <div className="proposal">
            <MiniMap assignments={proposal.assignments} byId={proposal.byId} color={color} />
            <div className="summary">
              {proposal.summary.map((s) => (
                <details key={s.responsible} className="sum-card" style={{ borderColor: color(s.responsible) }}>
                  <summary>
                    <span className="dot" style={{ background: color(s.responsible) }} />
                    <strong>{s.responsible}</strong> — {s.count} adressen · {s.streets.length} straten
                    {s.km ? ` · ±${s.km} km` : ''}
                    <div className="muted">POP: {s.pops.join(', ')}</div>
                  </summary>
                  <ol>
                    {proposal.assignments
                      .filter((a) => a.responsible === s.responsible)
                      .map((a) => (
                        <li key={a.id}>{proposal.byId.get(a.id).address}</li>
                      ))}
                  </ol>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Eenvoudige spreidingskaart (lat/lon → SVG), zonder externe kaartdienst
function MiniMap({ assignments, byId, color }) {
  const pts = assignments.map((a) => ({ ...byId.get(a.id), who: a.responsible, order: a.route_order })).filter((p) => p.lat != null);
  if (!pts.length) return <div className="minimap empty muted">Geen coördinaten — haal ze eerst op voor een kaartweergave.</div>;
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const W = 460;
  const H = 360;
  const pad = 14;
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const sx = (W - 2 * pad) / Math.max(1e-6, (maxLon - minLon) * kx);
  const sy = (H - 2 * pad) / Math.max(1e-6, maxLat - minLat);
  const s = Math.min(sx, sy);
  const x = (lon) => pad + (lon - minLon) * kx * s;
  const y = (lat) => H - pad - (lat - minLat) * s;
  const byWho = {};
  pts.forEach((p) => (byWho[p.who] ??= []).push(p));
  return (
    <svg className="minimap" viewBox={`0 0 ${W} ${H}`}>
      {Object.entries(byWho).map(([who, list]) => (
        <g key={who}>
          <polyline
            points={list.sort((a, b) => a.order - b.order).map((p) => `${x(p.lon)},${y(p.lat)}`).join(' ')}
            fill="none" stroke={color(who)} strokeOpacity="0.35" strokeWidth="1.2"
          />
          {list.map((p) => (
            <circle key={p.id} cx={x(p.lon)} cy={y(p.lat)} r="3" fill={color(who)}>
              <title>{`${p.order}. ${p.address} → ${who}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}
