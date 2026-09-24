import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { backend } from './backend.js';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

const KIND_OF = { ssv_addresses: 'ssv', tsa_addresses: 'tsa' };

export function DataProvider({ profile, children }) {
  const [ssv, setSsv] = useState([]);
  const [tsa, setTsa] = useState([]);
  const [responsibles, setResponsibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dossierTick, setDossierTick] = useState(0);
  const [lastEvent, setLastEvent] = useState(null);
  const setters = useRef({ ssv: setSsv, tsa: setTsa });

  const reload = useCallback(async (which = ['ssv', 'tsa', 'responsibles']) => {
    try {
      const tasks = [];
      if (which.includes('ssv')) tasks.push(backend.listAddresses('ssv').then(setSsv));
      if (which.includes('tsa')) tasks.push(backend.listAddresses('tsa').then(setTsa));
      if (which.includes('responsibles')) tasks.push(backend.listResponsibles().then(setResponsibles));
      await Promise.all(tasks);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Live updates: rijwijzigingen direct toepassen, bulk-events -> herladen
  useEffect(() => {
    const unsub = backend.subscribe((evt) => {
      setLastEvent({ ...evt, at: Date.now() });
      const kind = KIND_OF[evt.table];
      if (kind) {
        const set = setters.current[kind];
        if (evt.eventType === 'UPDATE' && evt.new?.id) {
          const visible =
            profile.role !== 'surveyor' || evt.new.responsible === profile.responsible_name;
          set((rows) => {
            const exists = rows.some((r) => r.id === evt.new.id);
            if (!visible) return rows.filter((r) => r.id !== evt.new.id);
            return exists ? rows.map((r) => (r.id === evt.new.id ? { ...r, ...evt.new } : r)) : [...rows, evt.new];
          });
        } else if (evt.eventType === 'INSERT' && evt.new?.id) {
          set((rows) => (rows.some((r) => r.id === evt.new.id) ? rows : [...rows, evt.new]));
        } else if (evt.eventType === 'DELETE' && evt.old?.id) {
          set((rows) => rows.filter((r) => r.id !== evt.old.id));
        } else {
          reload([kind]);
        }
      } else if (evt.table === 'responsibles') {
        reload(['responsibles', 'ssv', 'tsa']);
      } else if (evt.table === 'dossier_entries' || evt.table === 'dossier_documents') {
        setDossierTick((t) => t + 1);
      }
    });
    // na terugkeren naar het tabblad: volledig verversen (vangt gemiste events op)
    const onFocus = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [reload, profile]);

  const updateAddress = useCallback(async (kind, id, patch) => {
    const set = setters.current[kind];
    let before;
    set((rows) => rows.map((r) => (r.id === id ? ((before = r), { ...r, ...patch }) : r)));
    try {
      const row = await backend.updateAddress(kind, id, patch);
      if (row) set((rows) => rows.map((r) => (r.id === id ? { ...r, ...row } : r)));
    } catch (e) {
      if (before) set((rows) => rows.map((r) => (r.id === id ? before : r)));
      throw e;
    }
  }, []);

  const perms = useMemo(
    () => ({
      isCoordinator: profile.role === 'coordinator',
      canEditRow: (row) =>
        profile.role === 'coordinator' || (profile.role === 'surveyor' && row.responsible === profile.responsible_name),
      readOnly: profile.role === 'management',
    }),
    [profile],
  );

  const value = {
    profile, perms, ssv, tsa, responsibles, loading, error, reload, updateAddress, dossierTick, lastEvent,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
