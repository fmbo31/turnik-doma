create table if not exists public.workout_documents (
  user_id uuid not null default auth.uid(),
  path text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);

alter table public.workout_documents enable row level security;

revoke all on public.workout_documents from anon;
grant select, insert, update, delete on public.workout_documents to authenticated;
grant select, insert, update, delete on public.workout_documents to service_role;

drop policy if exists workout_select_own on public.workout_documents;
create policy workout_select_own on public.workout_documents
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists workout_insert_own on public.workout_documents;
create policy workout_insert_own on public.workout_documents
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists workout_update_own on public.workout_documents;
create policy workout_update_own on public.workout_documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists workout_delete_own on public.workout_documents;
create policy workout_delete_own on public.workout_documents
  for delete to authenticated using ((select auth.uid()) = user_id);
