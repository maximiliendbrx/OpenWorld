-- Exécuter dans le SQL Editor APRÈS avoir créé l'unique utilisateur dans Authentication.
-- Cette transaction échoue si le projet ne contient pas exactement un utilisateur.
begin;

create table if not exists public.openworld_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.openworld_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null check (document_key in ('draft', 'saved')),
  payload jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, document_key)
);

alter table public.openworld_members enable row level security;
alter table public.openworld_documents enable row level security;
revoke all on public.openworld_members from public, anon, authenticated;
revoke all on public.openworld_documents from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.openworld_members to authenticated;
grant select, insert, update on public.openworld_documents to authenticated;

drop policy if exists openworld_member_read on public.openworld_members;
create policy openworld_member_read on public.openworld_members for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists openworld_documents_read on public.openworld_documents;
create policy openworld_documents_read on public.openworld_documents for select to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.openworld_members m where m.user_id = (select auth.uid())));
drop policy if exists openworld_documents_insert on public.openworld_documents;
create policy openworld_documents_insert on public.openworld_documents for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.openworld_members m where m.user_id = (select auth.uid())));
drop policy if exists openworld_documents_update on public.openworld_documents;
create policy openworld_documents_update on public.openworld_documents for update to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.openworld_members m where m.user_id = (select auth.uid())))
  with check ((select auth.uid()) = user_id and exists (select 1 from public.openworld_members m where m.user_id = (select auth.uid())));

do $$
declare account_id uuid;
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Créez exactement un utilisateur dans Authentication → Users, puis relancez ce script.';
  end if;
  select id into account_id from auth.users limit 1;
  if exists (select 1 from public.openworld_members where user_id <> account_id) then
    raise exception 'Un autre utilisateur OpenWorld existe déjà. Vérifiez la configuration avant de continuer.';
  end if;
  insert into public.openworld_members (user_id) values (account_id) on conflict do nothing;
end $$;

commit;
