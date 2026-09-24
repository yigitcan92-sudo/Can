import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { backend } from '../data/backend.js';
import { useToast } from '../components/Toast.jsx';
import { parseScopelist, responsiblesIn } from '../lib/scopelist.js';

const KINDS = { surveyor: 'Surveyor', subcontractor: 'Onderaannemer', team: 'Team', queue: 'Wachtrij' };
const ROLES = { coordinator: 'Coördinator', surveyor: 'Surveyor', management: 'Management (alleen lezen)' };

export default function AdminPage() {
  return (
    <div className="admin">
      <h2>Beheer</h2>
      <div className="admin-grid">
        <Responsibles />
        <Users />
      </div>
      <Import />
    </div>
  );
}

function Responsibles() {
  const { responsibles, ssv, tsa, reload } = useData();
  const toast = useToast();
  const [draft, setDraft] = useState({ name: '', kind: 'surveyor' });
  const [editing, setEditing] = useState(null);

  const counts = {};
  [...ssv, ...tsa].forEach((r) => r.responsible && (counts[r.responsible] = (counts[r.responsible] || 0) + 1));

  async function save(r) {
    try {
      if (!r.name.trim()) throw new Error('Naam is verplicht');
      await backend.saveResponsible({ ...r, name: r.name.trim() });
      await reload(['responsibles', 'ssv', 'tsa']);
      setEditing(null);
      setDraft({ name: '', kind: 'surveyor' });
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  async function remove(r) {
    if (!confirm(`"${r.name}" verwijderen? ${counts[r.name] || 0} adressen worden dan niet-toegewezen.`)) return;
    try {
      await backend.deleteResponsible(r.id);
      await reload(['responsibles', 'ssv', 'tsa']);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="card">
      <h3>Verantwoordelijken</h3>
      <p className="muted">Surveyors, onderaannemers en wachtrijen. Een naam wijzigen past ook alle toegewezen adressen aan.</p>
      <table className="rows">
        <thead>
          <tr><th>Naam</th><th>Type</th><th>Actief</th><th>Adressen</th><th /></tr>
        </thead>
        <tbody>
          {responsibles.map((r) =>
            editing?.id === r.id ? (
              <tr key={r.id}>
                <td><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></td>
                <td>
                  <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                    {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /></td>
                <td>{counts[r.name] || 0}</td>
                <td className="nowrap">
                  <button className="small primary" onClick={() => save(editing)}>Bewaar</button>
                  <button className="small ghost" onClick={() => setEditing(null)}>Annuleer</button>
                </td>
              </tr>
            ) : (
              <tr key={r.id} className={r.active ? '' : 'inactive'}>
                <td>{r.name}</td>
                <td>{KINDS[r.kind] || r.kind}</td>
                <td>{r.active ? 'ja' : 'nee'}</td>
                <td>{counts[r.name] || 0}</td>
                <td className="nowrap">
                  <button className="small ghost" onClick={() => setEditing(r)}>Wijzig</button>
                  <button className="small ghost danger" onClick={() => remove(r)}>✕</button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
        <input placeholder="Nieuwe naam" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="primary">Toevoegen</button>
      </form>
    </div>
  );
}

function Users() {
  const { responsibles, profile } = useData();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  useEffect(() => {
    backend.listProfiles().then(setUsers).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  async function update(u, patch) {
    if (u.id === profile.id && patch.role && patch.role !== 'coordinator' && !confirm('Je ontneemt jezelf de coördinatorrechten. Doorgaan?')) return;
    try {
      await backend.updateProfile(u.id, patch);
      setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, ...patch } : x)));
      toast('Gebruiker bijgewerkt — de gebruiker moet de app herladen', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="card">
      <h3>Gebruikers & rollen</h3>
      <p className="muted">
        {backend.mode === 'demo'
          ? 'Demo-gebruikers.'
          : 'Nieuwe gebruikers nodig je uit via Supabase (Authentication → Users → Invite). Ze verschijnen hier na hun eerste aanmelding.'}{' '}
        Surveyors zien enkel adressen van de gekoppelde verantwoordelijke.
      </p>
      <table className="rows">
        <thead>
          <tr><th>Gebruiker</th><th>Rol</th><th>Gekoppeld aan</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}<div className="muted small-text">{u.email}</div></td>
              <td>
                <select value={u.role} onChange={(e) => update(u, { role: e.target.value })}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td>
                <select value={u.responsible_name || ''} onChange={(e) => update(u, { responsible_name: e.target.value || null })}>
                  <option value="">—</option>
                  {responsibles.map((r) => <option key={r.id}>{r.name}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Import() {
  const { reload, ssv, tsa } = useData();
  const toast = useToast();
  const [parsed, setParsed] = useState(null);
  const [mode, setMode] = useState('new');
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const data = parseScopelist(wb);
      const ssvKeys = new Set(ssv.map((r) => `${r.address.toLowerCase()}|${(r.unit_number || '').toLowerCase()}`));
      const tsaKeys = new Set(tsa.map((r) => r.address.toLowerCase()));
      data.newSsv = data.ssv.filter((r) => !ssvKeys.has(`${r.address.toLowerCase()}|${(r.unit_number || '').toLowerCase()}`)).length;
      data.newTsa = data.tsa.filter((r) => !tsaKeys.has(r.address.toLowerCase())).length;
      setParsed({ file: file.name, ...data });
    } catch (err) {
      toast(`Kon bestand niet lezen: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    try {
      await backend.importScopelist(parsed, mode);
      await reload();
      toast('Import voltooid', 'ok');
      setParsed(null);
    } catch (e) {
      toast(`Import mislukt: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Import vanuit Excel-scopelist</h3>
      <p className="muted">
        Leest de tabbladen <code>SSV</code> en <code>TSA</code> (kolommen zoals in de scopelist). De import is herhaalbaar:
        adressen worden herkend op adres (+ unitnummer bij SSV).
      </p>
      <label className="upload">
        <input type="file" accept=".xlsx,.xlsm" onChange={onFile} disabled={busy} />
        <span>{busy ? 'Bezig…' : 'Kies scopelist (.xlsx)'}</span>
      </label>
      {parsed && (
        <div className="import-preview">
          <p>
            <strong>{parsed.file}</strong>: {parsed.ssv.length} SSV-adressen ({parsed.newSsv} nieuw), {parsed.tsa.length} TSA-adressen (
            {parsed.newTsa} nieuw). Verantwoordelijken: {responsiblesIn(parsed).join(', ') || '—'}
          </p>
          {parsed.warnings.map((w) => <p key={w} className="warn">⚠ {w}</p>)}
          <label className="check">
            <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />
            Enkel nieuwe adressen toevoegen — wijzigingen in de app blijven behouden (aanbevolen na de eerste import)
          </label>
          <label className="check">
            <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} />
            Alles overschrijven met de Excel-waarden (status, verantwoordelijke, opmerkingen…)
          </label>
          <button className="primary" disabled={busy} onClick={run}>Importeren</button>{' '}
          <button className="ghost" onClick={() => setParsed(null)}>Annuleren</button>
        </div>
      )}
    </div>
  );
}
