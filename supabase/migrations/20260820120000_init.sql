-- Eerste migratie. Elke wijziging aan de database komt als een nieuw bestand in
-- deze map, nooit met de hand in de Supabase-console: anders loopt de repo uit de
-- pas met de werkelijkheid en is de historie waardeloos.

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now()
);

create index items_owner_id_created_at_idx on public.items (owner_id, created_at desc);

-- Zonder server is de database de beveiliging. RLS aanzetten en policies schrijven
-- is dus geen extra stap, het is de enige stap.
alter table public.items enable row level security;

-- Postgres kent twee sloten op een tabel en je moet ze allebei openzetten:
--   1. GRANT bepaalt óf een rol de tabel überhaupt mag benaderen;
--   2. RLS-policies bepalen wélke rijen die rol dan ziet.
-- Vergeet je de grant, dan krijgt de app "permission denied for table" terwijl de
-- policies perfect zijn. Vergeet je de policies, dan ziet de rol niets (of alles,
-- als RLS uit staat). De grant is dus ruim, de policy maakt hem smal.
grant select, insert, update, delete on public.items to authenticated;

create policy "items_select_own"
  on public.items
  for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "items_insert_own"
  on public.items
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "items_update_own"
  on public.items
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "items_delete_own"
  on public.items
  for delete
  to authenticated
  using (auth.uid() = owner_id);
