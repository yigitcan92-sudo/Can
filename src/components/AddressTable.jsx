import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { STATUS_COLORS, groupOf } from '../lib/statuses.js';
import { useToast } from './Toast.jsx';

const SORTS = {
  address: (a, b) =>
    (a.street || a.address).localeCompare(b.street || b.address, 'nl') || (a.house_number ?? 0) - (b.house_number ?? 0) || a.address.localeCompare(b.address, 'nl', { numeric: true }),
  route: (a, b) => (a.route_order ?? 1e9) - (b.route_order ?? 1e9) || SORTS.address(a, b),
  updated: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)),
  status: (a, b) => a.status.localeCompare(b.status) || SORTS.address(a, b),
};

export default function AddressTable({ kind, cfg, rows, sort, onOpenDossier }) {
  const { responsibles } = useData();
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const g = r.gemeente || 'Onbekende gemeente';
      const p = r.pop || 'Zonder POP';
      if (!m.has(g)) m.set(g, new Map());
      const pm = m.get(g);
      if (!pm.has(p)) pm.set(p, []);
      pm.get(p).push(r);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([g, pm]) => ({
        gemeente: g,
        pops: [...pm.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'nl', { numeric: true }))
          .map(([pop, list]) => ({ pop, rows: [...list].sort(SORTS[sort]) })),
      }));
  }, [rows, sort]);

  const [open, setOpen] = useState({});
  const autoOpen = rows.length <= 60;
  const isOpen = (key) => open[key] ?? autoOpen;
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !isOpen(key) }));
  const activeResp = responsibles.filter((r) => r.active);

  if (!rows.length) return <div className="card empty">Geen adressen voor deze filters.</div>;

  return (
    <div className="card table-card">
      {groups.map((g) => (
        <section key={g.gemeente} className="gemeente">
          <h3>
            {g.gemeente} <small>{g.pops.reduce((s, p) => s + p.rows.length, 0)} adressen</small>
          </h3>
          {g.pops.map((p) => {
            const key = `${g.gemeente}|${p.pop}`;
            const done = p.rows.filter((r) => groupOf(r.status, cfg.groups) === 'afgerond').length;
            const pct = Math.round((done / p.rows.length) * 100);
            return (
              <div key={key} className="pop">
                <button className="pop-head" onClick={() => toggle(key)}>
                  <span className="chev">{isOpen(key) ? '▾' : '▸'}</span>
                  <strong>{p.pop}</strong>
                  <span className="muted">{p.rows.length} adressen</span>
                  <span className="progress" title={`${pct}% afgerond`}>
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <span className="muted">{pct}%</span>
                </button>
                {isOpen(key) && (
                  <div className="table-scroll">
                    <table className="rows">
                      <thead>
                        <tr>
                          {sort === 'route' && <th>#</th>}
                          <th>Adres</th>
                          {kind === 'ssv' && <th>Unit</th>}
                          <th>Verantwoordelijke</th>
                          <th>Status</th>
                          {kind === 'tsa' && <th>Contact</th>}
                          {kind === 'tsa' && <th>Pog.</th>}
                          {kind === 'tsa' && <th>AV</th>}
                          <th>Opmerkingen</th>
                          {kind === 'tsa' && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {p.rows.map((r) => (
                          <Row key={r.id} kind={kind} cfg={cfg} row={r} sort={sort} resp={activeResp} onOpenDossier={onOpenDossier} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function Row({ kind, cfg, row, sort, resp, onOpenDossier }) {
  const { perms, updateAddress } = useData();
  const toast = useToast();
  const editable = perms.canEditRow(row);
  const save = (patch) => updateAddress(kind, row.id, patch).catch((e) => toast(e.message, 'error'));
  const statusOptions = cfg.statuses.includes(row.status) ? cfg.statuses : [row.status, ...cfg.statuses];
  const respOptions = row.responsible && !resp.some((r) => r.name === row.responsible) ? [{ name: row.responsible }, ...resp] : resp;

  return (
    <tr>
      {sort === 'route' && <td className="muted">{row.route_order ?? ''}</td>}
      <td className="addr">
        {kind === 'tsa' ? (
          <button className="link" onClick={() => onOpenDossier(row.id)}>
            {row.address}
          </button>
        ) : (
          row.address
        )}
        {kind === 'tsa' && row.stop_negotiating && <span className="tag bad">stop</span>}
      </td>
      {kind === 'ssv' && <td>{row.unit_number}</td>}
      <td>
        {perms.isCoordinator ? (
          <select value={row.responsible || ''} onChange={(e) => save({ responsible: e.target.value || null })}>
            <option value="">—</option>
            {respOptions.map((r) => (
              <option key={r.name}>{r.name}</option>
            ))}
          </select>
        ) : (
          row.responsible || '—'
        )}
      </td>
      <td>
        {editable ? (
          <select
            className="status-select" value={row.status} style={{ '--c': STATUS_COLORS[row.status] || '#64748b' }}
            onChange={(e) => save({ status: e.target.value })}
          >
            {statusOptions.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        ) : (
          <span className="status-pill" style={{ '--c': STATUS_COLORS[row.status] || '#64748b' }}>
            {row.status}
          </span>
        )}
      </td>
      {kind === 'tsa' && (
        <td className="contact">
          <div>{row.contact_name}</div>
          {row.phone && <a href={`tel:${row.phone.replace(/\s/g, '')}`}>{row.phone}</a>}
        </td>
      )}
      {kind === 'tsa' && <td>{row.attempts || ''}</td>}
      {kind === 'tsa' && <td className="nowrap">{fmtDate(row.av_date)}</td>}
      <td className="remarks">
        {editable ? <RemarkInput value={row.remarks} onSave={(v) => save({ remarks: v })} /> : row.remarks}
      </td>
      {kind === 'tsa' && (
        <td>
          <button className="small" onClick={() => onOpenDossier(row.id)}>
            Dossier
          </button>
        </td>
      )}
    </tr>
  );
}

function RemarkInput({ value, onSave }) {
  const [v, setV] = useState(value || '');
  const [focused, setFocused] = useState(false);
  const shown = focused ? v : value || '';
  return (
    <input
      className="inline" value={shown} placeholder="—"
      onFocus={() => {
        setV(value || '');
        setFocused(true);
      }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if ((v || null) !== (value || null)) onSave(v.trim() || null);
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}
