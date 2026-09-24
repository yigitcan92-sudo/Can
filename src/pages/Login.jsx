import { useState } from 'react';
import { backend } from '../data/backend.js';

const ROLE_LABEL = { coordinator: 'Coördinator', surveyor: 'Surveyor', management: 'Management' };

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (password) await backend.signIn(email, password);
      else {
        await backend.sendMagicLink(email);
        setMsg({ ok: true, text: 'Check je mailbox voor een aanmeldlink.' });
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="card login-card">
        <h1>
          <span className="logo">◉</span> Fiberklaar Waasland
        </h1>
        {backend.mode === 'demo' ? (
          <>
            <p className="muted">
              Demo-modus: er is nog geen Supabase gekoppeld. Kies een gebruiker om de rollen te bekijken. Open de app in
              twee tabbladen om live bijwerken te zien.
            </p>
            <div className="demo-users">
              {backend.demoUsers.map((u) => (
                <button key={u.id} onClick={() => backend.signIn(u.id)}>
                  <strong>{u.full_name}</strong>
                  <small>{ROLE_LABEL[u.role]}</small>
                </button>
              ))}
            </div>
            <button className="link" onClick={() => backend.resetDemo()}>
              Demo-data resetten
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              E-mail
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label>
              Wachtwoord <small className="muted">(leeg laten voor een aanmeldlink per mail)</small>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="primary" disabled={busy}>
              {password ? 'Aanmelden' : 'Stuur aanmeldlink'}
            </button>
            {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
