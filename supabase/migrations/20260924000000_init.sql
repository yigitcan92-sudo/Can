-- Fiberklaar Waasland — initieel schema
-- Rollen: coordinator (volledige rechten), surveyor (enkel eigen adressen), management (read-only)

-- ─────────────────────────────────────────────────────────── basistabellen

create table public.responsibles (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  kind        text not null default 'surveyor' check (kind in ('surveyor', 'team', 'subcontractor', 'queue')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  full_name         text,
  role              text not null default 'surveyor' check (role in ('coordinator', 'surveyor', 'management')),
  responsible_name  text references public.responsibles (name) on update cascade on delete set null,
  created_at        timestamptz not null default now()
);

create table public.ssv_addresses (
  id            bigint generated always as identity primary key,
  address       text not null,
  unit_number   text not null default '',
  pop           text,
  gemeente      text,
  street        text,
  house_number  integer,
  responsible   text references public.responsibles (name) on update cascade on delete set null,
  status        text not null default 'Ongoing',
  remarks       text,
  route_order   integer,
  lat           double precision,
  lon           double precision,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  unique (address, unit_number)
);

create table public.tsa_addresses (
  id                 bigint generated always as identity primary key,
  address            text not null unique,
  pop                text,
  gemeente           text,
  street             text,
  house_number       integer,
  status             text not null default 'Ongoing',
  av_date            date,
  attempts           integer not null default 0,
  stop_negotiating   boolean not null default false,
  contact_name       text,
  phone              text,
  email              text,
  remarks            text,
  responsible        text references public.responsibles (name) on update cascade on delete set null,
  appointment_date   date,
  construction_date  date,
  route_order        integer,
  lat                double precision,
  lon                double precision,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);

create index on public.ssv_addresses (responsible);
create index on public.ssv_addresses (pop);
create index on public.tsa_addresses (responsible);
create index on public.tsa_addresses (pop);

-- Klantendossier: gespreksgeschiedenis en notities per TSA-adres
create table public.dossier_entries (
  id               bigint generated always as identity primary key,
  tsa_id           bigint not null references public.tsa_addresses (id) on delete cascade,
  kind             text not null default 'call' check (kind in ('call', 'note', 'appointment')),
  outcome          text,
  body             text,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name  text,
  created_at       timestamptz not null default now()
);
create index on public.dossier_entries (tsa_id, created_at desc);

-- Metadata van documenten; het bestand zelf staat in Storage-bucket "dossiers"
create table public.dossier_documents (
  id            bigint generated always as identity primary key,
  tsa_id        bigint not null references public.tsa_addresses (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  size          bigint,
  content_type  text,
  uploaded_by   uuid default auth.uid() references auth.users (id) on delete set null,
  uploaded_by_name text,
  uploaded_at   timestamptz not null default now()
);
create index on public.dossier_documents (tsa_id);

-- Historiek van toewijzingen (wie had welk adres wanneer)
create table public.assignments (
  id                    bigint generated always as identity primary key,
  kind                  text not null check (kind in ('ssv', 'tsa')),
  address_id            bigint not null,
  responsible           text,
  previous_responsible  text,
  route_order           integer,
  assigned_by           uuid references auth.users (id) on delete set null,
  assigned_at           timestamptz not null default now()
);
create index on public.assignments (kind, address_id);

-- Statushistoriek (voedt de trendlijn)
create table public.status_history (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('ssv', 'tsa')),
  address_id  bigint not null,
  responsible text,
  old_status  text,
  new_status  text not null,
  changed_by  uuid references auth.users (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index on public.status_history (kind, changed_at);

-- Geocoding-cache zodat de API niet bij elke routeberekening bevraagd wordt
create table public.geocode_cache (
  address_key  text primary key,
  lat          double precision,
  lon          double precision,
  formatted    text,
  provider     text,
  fetched_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────── helpers

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_responsible() returns text
language sql stable security definer set search_path = public as $$
  select responsible_name from public.profiles where id = auth.uid()
$$;

create or replace function public.is_coordinator() returns boolean
language sql stable as $$ select coalesce(public.app_role() = 'coordinator', false) $$;

create or replace function public.can_read_all() returns boolean
language sql stable as $$ select coalesce(public.app_role() in ('coordinator', 'management'), false) $$;

-- Nieuw account → profiel met rol surveyor zonder toewijzing (ziet niets tot de coördinator koppelt)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- updated_at/updated_by + surveyors mogen geen toewijzing of adresgegevens wijzigen
create or replace function public.guard_address_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if auth.uid() is not null and not public.is_coordinator() then
    if new.responsible is distinct from old.responsible
       or new.address is distinct from old.address
       or new.pop is distinct from old.pop
       or new.route_order is distinct from old.route_order then
      raise exception 'Enkel de coördinator kan adressen toewijzen of wijzigen';
    end if;
  end if;
  return new;
end $$;

create trigger ssv_guard before update on public.ssv_addresses
for each row execute function public.guard_address_update();
create trigger tsa_guard before update on public.tsa_addresses
for each row execute function public.guard_address_update();

-- Historiek bijhouden (security definer: schrijft in tabellen zonder insert-policy)
create or replace function public.log_address_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text := case when tg_table_name = 'ssv_addresses' then 'ssv' else 'tsa' end;
begin
  if tg_op = 'INSERT' then
    insert into status_history (kind, address_id, responsible, old_status, new_status, changed_by)
    values (k, new.id, new.responsible, null, new.status, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into status_history (kind, address_id, responsible, old_status, new_status, changed_by)
    values (k, new.id, new.responsible, old.status, new.status, auth.uid());
  end if;
  if new.responsible is distinct from old.responsible or new.route_order is distinct from old.route_order then
    insert into assignments (kind, address_id, responsible, previous_responsible, route_order, assigned_by)
    values (k, new.id, new.responsible, old.responsible, new.route_order, auth.uid());
  end if;
  return new;
end $$;

create trigger ssv_log after insert or update on public.ssv_addresses
for each row execute function public.log_address_change();
create trigger tsa_log after insert or update on public.tsa_addresses
for each row execute function public.log_address_change();

-- Toewijzing in één transactie toepassen: items = [{"id": 1, "responsible": "X", "route_order": 3}, ...]
create or replace function public.apply_assignments(p_kind text, p_items jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  n integer;
begin
  if not public.is_coordinator() then
    raise exception 'Enkel de coördinator kan adressen toewijzen';
  end if;
  if p_kind = 'ssv' then
    update ssv_addresses a set responsible = i.responsible, route_order = i.route_order
    from jsonb_to_recordset(p_items) as i(id bigint, responsible text, route_order integer)
    where a.id = i.id;
  elsif p_kind = 'tsa' then
    update tsa_addresses a set responsible = i.responsible, route_order = i.route_order
    from jsonb_to_recordset(p_items) as i(id bigint, responsible text, route_order integer)
    where a.id = i.id;
  else
    raise exception 'Onbekend type %', p_kind;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- ─────────────────────────────────────────────────────────── row level security

alter table public.responsibles      enable row level security;
alter table public.profiles          enable row level security;
alter table public.ssv_addresses     enable row level security;
alter table public.tsa_addresses     enable row level security;
alter table public.dossier_entries   enable row level security;
alter table public.dossier_documents enable row level security;
alter table public.assignments       enable row level security;
alter table public.status_history    enable row level security;
alter table public.geocode_cache     enable row level security;

-- responsibles: iedereen leest, coördinator beheert
create policy "responsibles read" on public.responsibles for select to authenticated using (true);
create policy "responsibles write" on public.responsibles for all to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator());

-- profiles: eigen profiel, of alles voor coördinator/management; enkel coördinator wijzigt
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_read_all());
create policy "profiles write" on public.profiles for update to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator());

-- adressen
create policy "ssv read" on public.ssv_addresses for select to authenticated
  using (public.can_read_all() or responsible = public.app_responsible());
create policy "ssv update" on public.ssv_addresses for update to authenticated
  using (public.is_coordinator() or (public.app_role() = 'surveyor' and responsible = public.app_responsible()))
  with check (public.is_coordinator() or (public.app_role() = 'surveyor' and responsible = public.app_responsible()));
create policy "ssv insert" on public.ssv_addresses for insert to authenticated with check (public.is_coordinator());
create policy "ssv delete" on public.ssv_addresses for delete to authenticated using (public.is_coordinator());

create policy "tsa read" on public.tsa_addresses for select to authenticated
  using (public.can_read_all() or responsible = public.app_responsible());
create policy "tsa update" on public.tsa_addresses for update to authenticated
  using (public.is_coordinator() or (public.app_role() = 'surveyor' and responsible = public.app_responsible()))
  with check (public.is_coordinator() or (public.app_role() = 'surveyor' and responsible = public.app_responsible()));
create policy "tsa insert" on public.tsa_addresses for insert to authenticated with check (public.is_coordinator());
create policy "tsa delete" on public.tsa_addresses for delete to authenticated using (public.is_coordinator());

-- dossier: zichtbaar als het TSA-adres zichtbaar is (subquery valt zelf onder RLS)
create or replace function public.can_edit_tsa(p_tsa_id bigint) returns boolean
language sql stable as $$
  select public.is_coordinator() or (
    public.app_role() = 'surveyor'
    and exists (select 1 from public.tsa_addresses t where t.id = p_tsa_id and t.responsible = public.app_responsible())
  )
$$;

create policy "dossier read" on public.dossier_entries for select to authenticated
  using (exists (select 1 from public.tsa_addresses t where t.id = tsa_id));
create policy "dossier insert" on public.dossier_entries for insert to authenticated
  with check (public.can_edit_tsa(tsa_id) and created_by = auth.uid());
create policy "dossier delete" on public.dossier_entries for delete to authenticated
  using (public.is_coordinator() or created_by = auth.uid());

create policy "documents read" on public.dossier_documents for select to authenticated
  using (exists (select 1 from public.tsa_addresses t where t.id = tsa_id));
create policy "documents insert" on public.dossier_documents for insert to authenticated
  with check (public.can_edit_tsa(tsa_id));
create policy "documents delete" on public.dossier_documents for delete to authenticated
  using (public.is_coordinator() or uploaded_by = auth.uid());

-- historiek: lezen wie het adres mag zien; schrijven enkel via triggers
create policy "assignments read" on public.assignments for select to authenticated
  using (public.can_read_all() or responsible = public.app_responsible());
create policy "history read" on public.status_history for select to authenticated
  using (public.can_read_all() or responsible = public.app_responsible());

create policy "geocode read" on public.geocode_cache for select to authenticated using (true);
create policy "geocode write" on public.geocode_cache for all to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator());

-- ─────────────────────────────────────────────────────────── storage

insert into storage.buckets (id, name, public) values ('dossiers', 'dossiers', false)
on conflict (id) do nothing;

-- pad: tsa/<tsa_id>/<bestandsnaam>
create policy "dossier files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'dossiers'
    and exists (select 1 from public.tsa_addresses t where t.id::text = (storage.foldername(name))[2])
  );
create policy "dossier files insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dossiers'
    and (storage.foldername(name))[2] ~ '^\d+$'
    and public.can_edit_tsa(((storage.foldername(name))[2])::bigint)
  );
create policy "dossier files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'dossiers' and (public.is_coordinator() or owner = auth.uid()));

-- ─────────────────────────────────────────────────────────── realtime

alter publication supabase_realtime add table
  public.ssv_addresses, public.tsa_addresses, public.dossier_entries,
  public.dossier_documents, public.responsibles;

-- ─────────────────────────────────────────────────────────── startdata

insert into public.responsibles (name, kind) values
  ('Mehmet Can Yigit', 'surveyor'),
  ('Stijn Verdegem', 'surveyor'),
  ('Sharif Rasoli', 'surveyor'),
  ('Stefanos Stylianidis', 'surveyor'),
  ('CST To manage', 'team'),
  ('Waiting Surveyor', 'queue')
on conflict (name) do nothing;
