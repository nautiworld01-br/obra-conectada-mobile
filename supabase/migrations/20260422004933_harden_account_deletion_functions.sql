create or replace function public.has_owner_registered()
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  return exists (
    select 1
    from public.profiles
    where is_owner = true
  );
end;
$function$;

create or replace function public.is_member_of_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
  );
$function$;

create or replace function public.can_write_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and role in ('proprietario', 'empreiteiro')
  );
$function$;

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_user_id uuid := auth.uid();
  blocked_owner_project_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select members.project_id
  into blocked_owner_project_id
  from public.project_members members
  where members.user_id = current_user_id
    and members.role = 'proprietario'
    and not exists (
      select 1
      from public.project_members other_members
      where other_members.project_id = members.project_id
        and other_members.role = 'proprietario'
        and other_members.user_id <> current_user_id
    )
  limit 1;

  if blocked_owner_project_id is not null then
    raise exception 'Nao e permitido excluir o ultimo proprietario da obra.';
  end if;

  delete from public.project_members
  where user_id = current_user_id;

  delete from public.profiles
  where id = current_user_id;

  delete from auth.users
  where id = current_user_id;
end;
$function$;

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
  join public.project_members target_members
    on target_members.project_id = owner_members.project_id
   and target_members.user_id = p_user_id
  where owner_members.user_id = current_user_id
    and owner_members.role = 'proprietario'
  limit 1;

  if shared_project_id is null then
    raise exception 'Sem permissão para remover este usuário.';
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
