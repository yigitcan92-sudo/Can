import { useEffect, useState } from 'react';
import { backend } from './data/backend.js';
import { DataProvider, useData } from './data/DataContext.jsx';
import Login from './pages/Login.jsx';
import AddressDashboard from './pages/AddressDashboard.jsx';
import AssignPage from './pages/AssignPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import GuidePage from './pages/GuidePage.jsx';
import LiveIndicator from './components/LiveIndicator.jsx';

const ROLE_LABEL = { coordinator: 'Coördinator', surveyor: 'Surveyor', management: 'Management (alleen lezen)' };

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    backend.getSession().then(setSession);
    return backend.onAuthChange(setSession);
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    backend
      .getProfile()
      .then((p) => {
        setProfile(p);
        setProfileError(p ? null : 'Geen profiel gevonden voor dit account');
      })
      .catch((e) => setProfileError(e.message));
  }, [session]);

  if (session === undefined) return <div className="center muted">Laden…</div>;
  if (!session) return <Login />;
  if (profileError)
    return (
      <div className="center">
        <p className="error">{profileError}</p>
        <button onClick={() => backend.signOut()}>Afmelden</button>
      </div>
    );
  if (!profile) return <div className="center muted">Profiel laden…</div>;

  return (
    <DataProvider profile={profile}>
      <Shell profile={profile} />
    </DataProvider>
  );
}

function Shell({ profile }) {
  const { error, perms } = useData();
  const tabs = [
    { id: 'ssv', label: 'SSV' },
    { id: 'tsa', label: 'TSA' },
    ...(perms.isCoordinator ? [{ id: 'assign', label: 'Toewijzing' }, { id: 'admin', label: 'Beheer' }] : []),
    { id: 'guide', label: 'Surveyor-gids' },
  ];
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.slice(1);
    return tabs.some((t) => t.id === h) ? h : 'ssv';
  });
  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◉</span> Fiberklaar Waasland
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="user">
          <LiveIndicator />
          {backend.mode === 'demo' && <span className="badge demo">Demo</span>}
          <span className="who">
            {profile.full_name || profile.email}
            <small>{ROLE_LABEL[profile.role]}</small>
          </span>
          <button className="ghost" onClick={() => backend.signOut()}>
            Afmelden
          </button>
        </div>
      </header>
      {error && <div className="banner error">Fout bij laden: {error}</div>}
      {profile.role === 'surveyor' && !profile.responsible_name && (
        <div className="banner">
          Je account is nog niet gekoppeld aan een verantwoordelijke. Vraag de coördinator om je te koppelen in Beheer.
        </div>
      )}
      <main>
        {tab === 'ssv' && <AddressDashboard kind="ssv" />}
        {tab === 'tsa' && <AddressDashboard kind="tsa" />}
        {tab === 'assign' && <AssignPage />}
        {tab === 'admin' && <AdminPage />}
        {tab === 'guide' && <GuidePage />}
      </main>
    </div>
  );
}
