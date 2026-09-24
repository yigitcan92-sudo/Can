import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { SSV_STATUSES, TSA_STATUSES, SSV_GROUPS, TSA_GROUPS, GEMEENTEN, groupOf } from '../lib/statuses.js';
import Filters from '../components/Filters.jsx';
import Kpis from '../components/Kpis.jsx';
import Charts from '../components/Charts.jsx';
import AddressTable from '../components/AddressTable.jsx';
import DossierModal from '../components/DossierModal.jsx';
import { downloadCsv } from '../lib/csv.js';

export const KIND_CONFIG = {
  ssv: { label: 'Site survey (SSV)', statuses: SSV_STATUSES, groups: SSV_GROUPS },
  tsa: { label: 'Syndicus-onderhandeling (TSA)', statuses: TSA_STATUSES, groups: TSA_GROUPS },
};

const EMPTY = { status: '', group: '', responsible: '', pop: '', gemeente: '', q: '', sort: 'address' };

export default function AddressDashboard({ kind }) {
  const { ssv, tsa, loading, profile } = useData();
  const cfg = KIND_CONFIG[kind];
  const rows = kind === 'ssv' ? ssv : tsa;
  const [filters, setFilters] = useState(() => ({
    ...EMPTY,
    sort: profile.role === 'surveyor' ? 'route' : 'address',
  }));
  const [dossierId, setDossierId] = useState(null);
  const [showCharts, setShowCharts] = useState(true);

  const options = useMemo(() => {
    const pops = [...new Set(rows.map((r) => r.pop).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
    const resp = [...new Set(rows.map((r) => r.responsible).filter(Boolean))].sort();
    const gem = [...new Set([...GEMEENTEN, ...rows.map((r) => r.gemeente).filter(Boolean)])];
    return { pops, resp, gem };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.status && r.status !== filters.status) return false;
      if (filters.group && groupOf(r.status, cfg.groups) !== filters.group) return false;
      if (filters.responsible === '__none' ? r.responsible : filters.responsible && r.responsible !== filters.responsible) return false;
      if (filters.pop && r.pop !== filters.pop) return false;
      if (filters.gemeente && r.gemeente !== filters.gemeente) return false;
      if (q) {
        const hay = [r.address, r.unit_number, r.remarks, r.contact_name, r.phone, r.email, r.pop].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, cfg]);

  function exportCsv() {
    const cols =
      kind === 'ssv'
        ? ['address', 'unit_number', 'pop', 'gemeente', 'responsible', 'status', 'remarks', 'route_order']
        : ['address', 'pop', 'gemeente', 'status', 'av_date', 'attempts', 'stop_negotiating', 'contact_name', 'phone', 'email', 'remarks', 'responsible', 'appointment_date', 'construction_date'];
    downloadCsv(`${kind}-export-${new Date().toISOString().slice(0, 10)}.csv`, filtered, cols);
  }

  if (loading) return <div className="center muted">Adressen laden…</div>;

  return (
    <div className="dashboard">
      <div className="page-head">
        <h2>{cfg.label}</h2>
        <div className="actions">
          <button className="ghost" onClick={() => setShowCharts((s) => !s)}>
            {showCharts ? 'Grafieken verbergen' : 'Grafieken tonen'}
          </button>
          <button className="ghost" onClick={exportCsv}>
            Export CSV ({filtered.length})
          </button>
        </div>
      </div>
      <Filters kind={kind} cfg={cfg} filters={filters} setFilters={setFilters} options={options} onReset={() => setFilters(EMPTY)} />
      <Kpis kind={kind} cfg={cfg} rows={filtered} />
      {showCharts && <Charts kind={kind} cfg={cfg} rows={filtered} onPick={(patch) => setFilters((f) => ({ ...f, ...patch }))} />}
      <AddressTable kind={kind} cfg={cfg} rows={filtered} sort={filters.sort} onOpenDossier={setDossierId} />
      {dossierId != null && <DossierModal tsaId={dossierId} onClose={() => setDossierId(null)} />}
    </div>
  );
}
