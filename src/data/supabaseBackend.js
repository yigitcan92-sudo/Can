import { createClient } from '@supabase/supabase-js';

const PAGE = 1000;

export function createSupabaseBackend(url, anonKey) {
  const sb = createClient(url, anonKey);

  async function run(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
  }

  async function fetchAll(table, order = 'id') {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const rows = await run(sb.from(table).select('*').order(order).range(from, from + PAGE - 1));
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  const TABLE = { ssv: 'ssv_addresses', tsa: 'tsa_addresses' };

  return {
    mode: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      await run(sb.auth.signInWithPassword({ email, password }));
    },
    async sendMagicLink(email) {
      await run(sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } }));
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async getProfile() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      return run(sb.from('profiles').select('*').eq('id', data.user.id).single());
    },

    listResponsibles: () => run(sb.from('responsibles').select('*').order('name')),
    saveResponsible: (r) =>
      r.id
        ? run(sb.from('responsibles').update({ name: r.name, kind: r.kind, active: r.active }).eq('id', r.id))
        : run(sb.from('responsibles').insert({ name: r.name, kind: r.kind, active: r.active ?? true })),
    deleteResponsible: (id) => run(sb.from('responsibles').delete().eq('id', id)),

    listProfiles: () => run(sb.from('profiles').select('*').order('email')),
    updateProfile: (id, patch) => run(sb.from('profiles').update(patch).eq('id', id)),

    listAddresses: (kind) => fetchAll(TABLE[kind]),
    updateAddress: (kind, id, patch) => run(sb.from(TABLE[kind]).update(patch).eq('id', id).select().single()),
    applyAssignments: (kind, items) => run(sb.rpc('apply_assignments', { p_kind: kind, p_items: items })),

    statusHistory: (kind) =>
      run(sb.from('status_history').select('address_id, new_status, old_status, changed_at').eq('kind', kind).order('changed_at').limit(20000)),

    listDossier: (tsaId) =>
      run(sb.from('dossier_entries').select('*').eq('tsa_id', tsaId).order('created_at', { ascending: false })),
    async addDossierEntry(entry, profile) {
      return run(sb.from('dossier_entries').insert({ ...entry, created_by_name: profile.full_name || profile.email }).select().single());
    },
    deleteDossierEntry: (id) => run(sb.from('dossier_entries').delete().eq('id', id)),

    listDocuments: (tsaId) =>
      run(sb.from('dossier_documents').select('*').eq('tsa_id', tsaId).order('uploaded_at', { ascending: false })),
    async uploadDocument(tsaId, file, profile) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `tsa/${tsaId}/${Date.now()}_${safe}`;
      await run(sb.storage.from('dossiers').upload(path, file, { contentType: file.type || undefined }));
      try {
        return await run(
          sb.from('dossier_documents').insert({
            tsa_id: tsaId, storage_path: path, file_name: file.name, size: file.size,
            content_type: file.type, uploaded_by_name: profile.full_name || profile.email,
          }).select().single(),
        );
      } catch (e) {
        await sb.storage.from('dossiers').remove([path]);
        throw e;
      }
    },
    async downloadDocument(doc) {
      const data = await run(sb.storage.from('dossiers').createSignedUrl(doc.storage_path, 60, { download: doc.file_name }));
      window.location.href = data.signedUrl;
    },
    async deleteDocument(doc) {
      await run(sb.storage.from('dossiers').remove([doc.storage_path]));
      await run(sb.from('dossier_documents').delete().eq('id', doc.id));
    },

    async importScopelist(data, mode) {
      const names = [...new Set([...data.ssv, ...data.tsa].map((r) => r.responsible).filter(Boolean))];
      if (names.length)
        await run(sb.from('responsibles').upsert(names.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true }));
      const opts = (onConflict) => ({ onConflict, ignoreDuplicates: mode === 'new' });
      for (let i = 0; i < data.ssv.length; i += 500)
        await run(sb.from('ssv_addresses').upsert(data.ssv.slice(i, i + 500), opts('address,unit_number')));
      for (let i = 0; i < data.tsa.length; i += 500)
        await run(sb.from('tsa_addresses').upsert(data.tsa.slice(i, i + 500), opts('address')));
    },

    async geocodeMissing(kind, limit = 200) {
      return run(sb.functions.invoke('geocode', { body: { kind, limit } }));
    },

    // Realtime: roept cb({table, eventType, new, old}) aan bij elke wijziging
    subscribe(cb) {
      const ch = sb.channel('fiberklaar-live');
      for (const table of ['ssv_addresses', 'tsa_addresses', 'dossier_entries', 'dossier_documents', 'responsibles'])
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) =>
          cb({ table, eventType: p.eventType, new: p.new, old: p.old }),
        );
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}
