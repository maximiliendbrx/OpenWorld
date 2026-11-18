-- OpenWorld : passage en service public multi-utilisateurs avec plans Gratuit / Pro.
-- À exécuter dans le SQL Editor Supabase (remplace la restriction « un seul utilisateur » de setup.sql).
-- Prérequis : setup.sql a déjà été exécuté. Ce script est rejouable.
begin;

-- 1) Chaque utilisateur accède uniquement à ses propres documents (plus de liste de membres).
drop policy if exists openworld_documents_read on public.openworld_documents;
drop policy if exists openworld_documents_insert on public.openworld_documents;
drop policy if exists openworld_documents_update on public.openworld_documents;
drop policy if exists openworld_documents_delete on public.openworld_documents;
create policy openworld_documents_read on public.openworld_documents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy openworld_documents_insert on public.openworld_documents for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy openworld_documents_update on public.openworld_documents for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy openworld_documents_delete on public.openworld_documents for delete to authenticated
  using ((select auth.uid()) = user_id);
grant delete on public.openworld_documents to authenticated;

-- 2) Abonnements : lecture seule pour l'utilisateur, écriture réservée au webhook Stripe (service_role).
create table if not exists public.openworld_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'inactive',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.openworld_subscriptions enable row level security;
revoke all on public.openworld_subscriptions from public, anon, authenticated;
grant select on public.openworld_subscriptions to authenticated;
drop policy if exists openworld_subscriptions_read on public.openworld_subscriptions;
create policy openworld_subscriptions_read on public.openworld_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.openworld_is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.openworld_subscriptions s
    where s.user_id = uid and s.plan = 'pro' and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
revoke all on function public.openworld_is_pro(uuid) from public, anon;
grant execute on function public.openworld_is_pro(uuid) to authenticated;

-- 3) Limite du plan gratuit appliquée côté serveur : 3 parcours enregistrés (le client ne peut pas la contourner).
create or replace function public.openworld_enforce_free_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.document_key = 'saved' and jsonb_typeof(new.payload) = 'array'
     and jsonb_array_length(new.payload) > 3 and not public.openworld_is_pro(new.user_id) then
    raise exception 'free_plan_limit' using errcode = 'P0001', hint = 'Passez au plan Pro pour enregistrer plus de 3 parcours.';
  end if;
  return new;
end $$;
drop trigger if exists openworld_free_limit on public.openworld_documents;
create trigger openworld_free_limit before insert or update on public.openworld_documents
  for each row execute function public.openworld_enforce_free_limit();

-- 4) Suppression de compte à la demande de l'utilisateur (RGPD).
create or replace function public.openworld_delete_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.openworld_delete_account() from public, anon;
grant execute on function public.openworld_delete_account() to authenticated;

commit;

-- Ensuite, dans Supabase → Authentication :
--   * activer les inscriptions (Sign ups) et la confirmation par e-mail ;
--   * renseigner l'URL du site dans « Site URL » et « Redirect URLs » ;
--   * configurer un SMTP personnalisé avant le lancement public (le SMTP par défaut est très limité).
