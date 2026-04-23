alter table public.comments
  alter column author_id drop not null;

alter table public.documents
  alter column uploaded_by drop not null;

alter table public.extra_budgets
  alter column requested_by drop not null;

alter table public.payments
  alter column requested_by drop not null;

alter table public.weekly_updates
  alter column created_by drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'comments_author_id_fkey'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments drop constraint comments_author_id_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'documents_uploaded_by_fkey'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents drop constraint documents_uploaded_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'extra_budgets_requested_by_fkey'
      and conrelid = 'public.extra_budgets'::regclass
  ) then
    alter table public.extra_budgets drop constraint extra_budgets_requested_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'payments_requested_by_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments drop constraint payments_requested_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'payments_approved_by_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments drop constraint payments_approved_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'project_documents_created_by_fkey'
      and conrelid = 'public.project_documents'::regclass
  ) then
    alter table public.project_documents drop constraint project_documents_created_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'project_members_invited_by_fkey'
      and conrelid = 'public.project_members'::regclass
  ) then
    alter table public.project_members drop constraint project_members_invited_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'weekly_updates_created_by_fkey'
      and conrelid = 'public.weekly_updates'::regclass
  ) then
    alter table public.weekly_updates drop constraint weekly_updates_created_by_fkey;
  end if;
end $$;

alter table public.comments
  add constraint comments_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

alter table public.documents
  add constraint documents_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users(id) on delete set null;

alter table public.extra_budgets
  add constraint extra_budgets_requested_by_fkey
  foreign key (requested_by) references auth.users(id) on delete set null;

alter table public.payments
  add constraint payments_requested_by_fkey
  foreign key (requested_by) references auth.users(id) on delete set null;

alter table public.payments
  add constraint payments_approved_by_fkey
  foreign key (approved_by) references auth.users(id) on delete set null;

alter table public.project_documents
  add constraint project_documents_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.project_members
  add constraint project_members_invited_by_fkey
  foreign key (invited_by) references auth.users(id) on delete set null;

alter table public.weekly_updates
  add constraint weekly_updates_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

create or replace function public.delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_user_id uuid := auth.uid();
  shared_project_id uuid;
  target_is_project_owner boolean;
begin
  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_user_id is null then
    raise exception 'Usuário alvo inválido.';
  end if;

  if p_user_id = current_user_id then
    perform public.delete_user_account();
    return;
  end if;

  select owner_members.project_id
  into shared_project_id
  from public.project_members owner_members
  left join public.project_members target_members
    on target_members.project_id = owner_members.project_id
   and target_members.user_id = p_user_id
  left join public.employees target_employee
    on target_employee.project_id = owner_members.project_id
   and target_employee.user_id = p_user_id
  left join public.profiles target_profile
    on target_profile.id = p_user_id
  where owner_members.user_id = current_user_id
    and owner_members.role = 'proprietario'
    and (
      target_members.user_id is not null
      or target_employee.user_id is not null
      or target_profile.id is not null
    )
  limit 1;

  if shared_project_id is null then
    raise exception 'Sem permissão para remover este funcionário.';
  end if;

  select exists (
    select 1
    from public.project_members
    where project_id = shared_project_id
      and user_id = p_user_id
      and role = 'proprietario'
  )
  into target_is_project_owner;

  if target_is_project_owner then
    raise exception 'Nao e permitido remover outro proprietario por este fluxo.';
  end if;

  delete from public.push_subscriptions
  where user_id = p_user_id;

  delete from public.employees
  where project_id = shared_project_id
    and user_id = p_user_id;

  delete from public.project_members
  where user_id = p_user_id
    and project_id = shared_project_id;

  if not exists (
    select 1
    from public.project_members
    where user_id = p_user_id
  ) then
    delete from public.profiles
    where id = p_user_id;

    delete from auth.users
    where id = p_user_id;
  end if;
end;
$function$;
