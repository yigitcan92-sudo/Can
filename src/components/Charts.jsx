import { useEffect, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';
import { STATUS_COLORS, groupOf } from '../lib/statuses.js';
import { backend } from '../data/backend.js';
import { useData } from '../data/DataContext.jsx';

const GROUP_COLORS = { afgerond: '#16a34a', open: '#3b82f6', geblokkeerd: '#dc2626' };

export default function Charts({ kind, cfg, rows, onPick }) {
  const byStatus = useMemo(() => {
    const m = {};
    rows.forEach((r) => (m[r.status] = (m[r.status] || 0) + 1));
    return cfg.statuses.filter((s) => m[s]).map((s) => ({ name: s, value: m[s] }))
      .concat(Object.keys(m).filter((s) => !cfg.statuses.includes(s)).map((s) => ({ name: s, value: m[s] })));
  }, [rows, cfg]);

  const byResp = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const k = r.responsible || '(geen)';
      m[k] ??= { name: k, afgerond: 0, open: 0, geblokkeerd: 0 };
      m[k][groupOf(r.status, cfg.groups)]++;
    });
    return Object.values(m).sort((a, b) => b.afgerond + b.open + b.geblokkeerd - (a.afgerond + a.open + a.geblokkeerd));
  }, [rows, cfg]);

  return (
    <div className="charts">
      <div className="card chart">
        <h3>Statusverdeling</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={byStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={1}
              onClick={(d) => onPick({ status: d.name })} cursor="pointer"
            >
              {byStatus.map((d) => (
                <Cell key={d.name} fill={STATUS_COLORS[d.name] || '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip />
            <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="card chart">
        <h3>Per verantwoordelijke</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={byResp} layout="vertical" margin={{ left: 20 }}>
            <XAxis type="number" allowDecimals={false} fontSize={11} />
            <YAxis type="category" dataKey="name" width={120} fontSize={11} />
            <Tooltip />
            {['afgerond', 'open', 'geblokkeerd'].map((g) => (
              <Bar key={g} dataKey={g} stackId="a" fill={GROUP_COLORS[g]} cursor="pointer"
                onClick={(d) => onPick({ responsible: d.name === '(geen)' ? '__none' : d.name, group: g })} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Trend kind={kind} cfg={cfg} rows={rows} />
      <Heatmap cfg={cfg} rows={rows} onPick={onPick} />
    </div>
  );
}

function Trend({ kind, cfg, rows }) {
  const { lastEvent } = useData();
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      backend.statusHistory(kind).then(setHistory).catch((e) => setErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [kind, lastEvent?.at]);

  const data = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    const events = history.filter((h) => ids.has(h.address_id));
    const weeks = 12;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const points = [];
    const state = new Map();
    let i = 0;
    for (let w = weeks - 1; w >= 0; w--) {
      const cutoff = new Date(end.getTime() - w * 7 * 864e5).toISOString();
      while (i < events.length && events[i].changed_at <= cutoff) {
        state.set(events[i].address_id, events[i].new_status);
        i++;
      }
      const c = { afgerond: 0, geblokkeerd: 0 };
      state.forEach((s) => {
        const g = groupOf(s, cfg.groups);
        if (g in c) c[g]++;
      });
      points.push({ week: cutoff.slice(5, 10).split('-').reverse().join('/'), ...c });
    }
    return points;
  }, [history, rows, cfg]);

  return (
    <div className="card chart">
      <h3>Trend (laatste 12 weken)</h3>
      {err ? (
        <p className="error">{err}</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="afgerond" stroke={GROUP_COLORS.afgerond} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="geblokkeerd" stroke={GROUP_COLORS.geblokkeerd} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Heatmap({ cfg, rows, onPick }) {
  const { pops, statuses, grid, max } = useMemo(() => {
    const grid = {};
    const popCount = {};
    rows.forEach((r) => {
      const p = r.pop || '—';
      grid[p] ??= {};
      grid[p][r.status] = (grid[p][r.status] || 0) + 1;
      popCount[p] = (popCount[p] || 0) + 1;
    });
    const pops = Object.keys(popCount).sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
    const statuses = cfg.statuses.filter((s) => pops.some((p) => grid[p][s]));
    const max = Math.max(1, ...pops.flatMap((p) => Object.values(grid[p])));
    return { pops, statuses, grid, max };
  }, [rows, cfg]);

  return (
    <div className="card chart wide">
      <h3>POP × status</h3>
      <div className="heatmap-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th>POP</th>
              {statuses.map((s) => (
                <th key={s}><span>{s}</span></th>
              ))}
              <th>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {pops.map((p) => (
              <tr key={p}>
                <th>{p}</th>
                {statuses.map((s) => {
                  const n = grid[p][s] || 0;
                  const color = STATUS_COLORS[s] || '#64748b';
                  return (
                    <td key={s} onClick={() => n && onPick({ pop: p === '—' ? '' : p, status: s })}
                      style={{ background: n ? `color-mix(in srgb, ${color} ${15 + (n / max) * 75}%, transparent)` : undefined, cursor: n ? 'pointer' : 'default' }}>
                      {n || ''}
                    </td>
                  );
                })}
                <td className="total">{Object.values(grid[p]).reduce((a, b) => a + b, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
