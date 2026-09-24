import { groupOf } from '../lib/statuses.js';

export default function Kpis({ kind, cfg, rows }) {
  const total = rows.length;
  const count = { open: 0, afgerond: 0, geblokkeerd: 0 };
  rows.forEach((r) => count[groupOf(r.status, cfg.groups)]++);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  const extra = [];
  if (kind === 'tsa') {
    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const upcoming = rows.filter((r) => {
      const d = r.appointment_date || r.av_date;
      return d && d >= today && d <= in14;
    }).length;
    extra.push({ label: 'Afspraken/AV komende 14 d.', value: upcoming });
    extra.push({ label: 'Stop onderhandelen', value: rows.filter((r) => r.stop_negotiating).length, tone: 'bad' });
    const withAttempts = rows.filter((r) => r.attempts > 0);
    extra.push({
      label: 'Gem. pogingen',
      value: withAttempts.length ? (withAttempts.reduce((s, r) => s + r.attempts, 0) / withAttempts.length).toFixed(1) : '–',
    });
  } else {
    extra.push({ label: 'Done', value: rows.filter((r) => r.status === 'Done').length, tone: 'good' });
    extra.push({ label: 'Pending Validation', value: rows.filter((r) => r.status === 'Pending Validation').length });
    extra.push({ label: 'Niet toegewezen / wachtend', value: rows.filter((r) => !r.responsible || r.responsible === 'Waiting Surveyor').length });
  }

  return (
    <div className="kpis">
      <div className="kpi">
        <span>Adressen</span>
        <strong>{total}</strong>
      </div>
      <div className="kpi good">
        <span>Afgerond</span>
        <strong>{count.afgerond}</strong>
        <em>{pct(count.afgerond)}%</em>
        <div className="bar">
          <i style={{ width: `${pct(count.afgerond)}%` }} />
        </div>
      </div>
      <div className="kpi">
        <span>Open</span>
        <strong>{count.open}</strong>
        <em>{pct(count.open)}%</em>
      </div>
      <div className="kpi bad">
        <span>Geblokkeerd</span>
        <strong>{count.geblokkeerd}</strong>
        <em>{pct(count.geblokkeerd)}%</em>
      </div>
      {extra.map((k) => (
        <div key={k.label} className={`kpi ${k.tone || ''}`}>
          <span>{k.label}</span>
          <strong>{k.value}</strong>
        </div>
      ))}
    </div>
  );
}
