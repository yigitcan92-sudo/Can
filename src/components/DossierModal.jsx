import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { backend } from '../data/backend.js';
import { TSA_STATUSES, STATUS_COLORS } from '../lib/statuses.js';
import { useToast } from './Toast.jsx';

const OUTCOMES = ['Bereikt', 'Niet bereikt', 'Voicemail', 'Terugbellen', 'Afspraak gemaakt', 'Mail gestuurd', 'Weigering'];
const FIELDS = ['contact_name', 'phone', 'email', 'status', 'av_date', 'appointment_date', 'construction_date', 'attempts', 'stop_negotiating', 'remarks'];

export default function DossierModal({ tsaId, onClose }) {
  const { tsa, perms, profile, updateAddress, dossierTick } = useData();
  const toast = useToast();
  const row = tsa.find((r) => r.id === tsaId);
  const editable = row && perms.canEditRow(row);
  const [form, setForm] = useState(null);
  const [entries, setEntries] = useState([]);
  const [docs, setDocs] = useState([]);
  const [call, setCall] = useState({ outcome: 'Bereikt', body: '', kind: 'call' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row && !form) setForm(Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? (f === 'attempts' ? 0 : f === 'stop_negotiating' ? false : '')])));
  }, [row, form]);

  useEffect(() => {
    Promise.all([backend.listDossier(tsaId), backend.listDocuments(tsaId)])
      .then(([e, d]) => {
        setEntries(e);
        setDocs(d);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [tsaId, dossierTick, toast]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!row) return null;

  function buildPatch() {
    const patch = {};
    if (!form) return patch;
    FIELDS.forEach((f) => {
      let v = form[f];
      if (f === 'attempts') v = Number(v) || 0;
      else if (f === 'stop_negotiating') v = !!v;
      else if (v === '') v = null;
      const cur = row[f] ?? (f === 'attempts' ? 0 : f === 'stop_negotiating' ? false : null);
      if (v !== cur) patch[f] = v;
    });
    return patch;
  }
  const dirty = Object.keys(buildPatch()).length > 0;

  async function saveForm() {
    const patch = buildPatch();
    if (!Object.keys(patch).length) return;
    setBusy(true);
    try {
      await updateAddress('tsa', row.id, patch);
      toast('Dossier opgeslagen', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function logCall(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const entry = await backend.addDossierEntry(
        { tsa_id: row.id, kind: call.kind, outcome: call.kind === 'note' ? null : call.outcome, body: call.body.trim() || null },
        profile,
      );
      setEntries((l) => (l.some((x) => x.id === entry.id) ? l : [entry, ...l]));
      if (call.kind === 'call') {
        const attempts = (row.attempts || 0) + 1;
        await updateAddress('tsa', row.id, { attempts });
        setForm((f) => ({ ...f, attempts }));
      }
      setCall((c) => ({ ...c, body: '' }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id) {
    if (!confirm('Deze notitie verwijderen?')) return;
    try {
      await backend.deleteDossierEntry(id);
      setEntries((l) => l.filter((x) => x.id !== id));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function upload(e) {
    const files = [...e.target.files];
    e.target.value = '';
    setBusy(true);
    try {
      for (const f of files) await backend.uploadDocument(row.id, f, profile);
      setDocs(await backend.listDocuments(row.id));
      toast(`${files.length} document(en) opgeladen`, 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(doc) {
    if (!confirm(`"${doc.file_name}" verwijderen?`)) return;
    try {
      await backend.deleteDocument(doc);
      setDocs((l) => l.filter((d) => d.id !== doc.id));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const f = (name, label, type = 'text') => (
    <label>
      {label}
      <input type={type} value={form?.[name] ?? ''} disabled={!editable} onChange={(e) => setForm((s) => ({ ...s, [name]: e.target.value }))} />
    </label>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Klantendossier">
        <header>
          <div>
            <h2>{row.address}</h2>
            <p className="muted">
              {row.pop} · {row.gemeente} · verantwoordelijke: {row.responsible || '—'}
            </p>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Sluiten">✕</button>
        </header>
        <div className="modal-body">
          <section className="dossier-form">
            <h3>Gegevens</h3>
            {form && (
              <div className="grid2">
                {f('contact_name', 'Naam / syndicus')}
                {f('phone', 'Telefoon', 'tel')}
                {f('email', 'E-mail', 'email')}
                <label>
                  TSA-status
                  <select value={form.status} disabled={!editable} style={{ '--c': STATUS_COLORS[form.status] }} className="status-select"
                    onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                    {(TSA_STATUSES.includes(form.status) ? TSA_STATUSES : [form.status, ...TSA_STATUSES]).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {f('av_date', 'AV-datum', 'date')}
                {f('appointment_date', 'Afspraak', 'date')}
                {f('construction_date', 'Constructiedatum', 'date')}
                {f('attempts', 'Aantal pogingen', 'number')}
                <label className="check">
                  <input type="checkbox" checked={!!form.stop_negotiating} disabled={!editable}
                    onChange={(e) => setForm((s) => ({ ...s, stop_negotiating: e.target.checked }))} />
                  Stop onderhandelen
                </label>
                <label className="full">
                  Opmerkingen
                  <textarea rows={3} value={form.remarks ?? ''} disabled={!editable} onChange={(e) => setForm((s) => ({ ...s, remarks: e.target.value }))} />
                </label>
              </div>
            )}
            {editable && (
              <div className="row-actions">
                {form?.email && <a className="button ghost" href={`mailto:${form.email}`}>Mail</a>}
                {form?.phone && <a className="button ghost" href={`tel:${String(form.phone).replace(/\s/g, '')}`}>Bel</a>}
                <button className="primary" disabled={!dirty || busy} onClick={saveForm}>Opslaan</button>
              </div>
            )}
          </section>

          <section>
            <h3>Gespreksgeschiedenis</h3>
            {editable && (
              <form className="call-form" onSubmit={logCall}>
                <select value={call.kind} onChange={(e) => setCall((c) => ({ ...c, kind: e.target.value }))}>
                  <option value="call">Gesprek</option>
                  <option value="note">Notitie</option>
                  <option value="appointment">Afspraak</option>
                </select>
                {call.kind !== 'note' && (
                  <select value={call.outcome} onChange={(e) => setCall((c) => ({ ...c, outcome: e.target.value }))}>
                    {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                  </select>
                )}
                <input placeholder="Notitie…" value={call.body} onChange={(e) => setCall((c) => ({ ...c, body: e.target.value }))} />
                <button className="primary" disabled={busy}>Toevoegen</button>
              </form>
            )}
            <ul className="timeline">
              {entries.length === 0 && <li className="muted">Nog geen gesprekken geregistreerd.</li>}
              {entries.map((e) => (
                <li key={e.id}>
                  <div className="when">
                    {new Date(e.created_at).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })}
                    <span> · {e.created_by_name || 'onbekend'}</span>
                  </div>
                  <div>
                    <span className={`tag ${e.kind}`}>{e.kind === 'call' ? 'Gesprek' : e.kind === 'note' ? 'Notitie' : 'Afspraak'}</span>
                    {e.outcome && <strong> {e.outcome}</strong>}
                    {e.body && <span> — {e.body}</span>}
                  </div>
                  {(perms.isCoordinator || e.created_by === profile.id) && (
                    <button className="link danger" onClick={() => removeEntry(e.id)}>verwijder</button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Documenten</h3>
            {editable && (
              <label className="upload">
                <input type="file" multiple onChange={upload} disabled={busy} />
                <span>+ Document opladen (bv. getekende TSA)</span>
              </label>
            )}
            <ul className="docs">
              {docs.length === 0 && <li className="muted">Geen documenten.</li>}
              {docs.map((d) => (
                <li key={d.id}>
                  <button className="link" onClick={() => backend.downloadDocument(d).catch((e) => toast(e.message, 'error'))}>
                    📄 {d.file_name}
                  </button>
                  <span className="muted">
                    {d.size ? `${Math.max(1, Math.round(d.size / 1024))} kB · ` : ''}
                    {d.uploaded_by_name} · {new Date(d.uploaded_at).toLocaleDateString('nl-BE')}
                  </span>
                  {(perms.isCoordinator || d.uploaded_by === profile.id) && (
                    <button className="link danger" onClick={() => removeDoc(d)}>verwijder</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
