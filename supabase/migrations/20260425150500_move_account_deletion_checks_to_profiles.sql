create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_user_id uuid := auth.uid();
  current_project_id uuid;
  current_is_owner boolean;
  other_owner_exists boolean;
begin
  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select profiles.project_id, coalesce(profiles.is_owner, false)
  into current_project_id, current_is_owner
  from public.profiles as profiles
  where profiles.id = current_user_id;

  if current_is_owner and current_project_id is not null then
    select exists (
      select 1
      from public.profiles as profiles
      where profiles.project_id = current_project_id
        and profiles.id <> current_user_id
        and coalesce(profiles.status, 'ativo') <> 'inativo'
        and profiles.is_owner = true
    )
    into other_owner_exists;

    if not other_owner_exists then
      raise exception 'Nao e permitido excluir o ultimo proprietario da obra.';
    end if;
  end if;

  delete from public.push_subscriptions
  where user_id = current_user_id;

  delete from public.employees
  where user_id = current_user_id;

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
  current_is_owner boolean;
  target_project_id uuid;
  target_is_owner boolean;
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

  select profiles.project_id, coalesce(profiles.is_owner, false)
  into shared_project_id, current_is_owner
  from public.profiles as profiles
  where profiles.id = current_user_id;

  if not current_is_owner or shared_project_id is null then
    raise exception 'Sem permissão para remover este usuário.';
  end if;

  select profiles.project_id, coalesce(profiles.is_owner, false)
  into target_project_id, target_is_owner
  from public.profiles as profiles
  where profiles.id = p_user_id;

  if target_project_id is distinct from shared_project_id then
    raise exception 'Sem permissão para remover este usuário.';
  end if;

  if target_is_owner then
    raise exception 'Nao e permitido remover outro proprietario por este fluxo.';
  end if;

  delete from public.push_subscriptions
  where user_id = p_user_id;

  delete from public.employees
  where user_id = p_user_id;

  delete from public.project_members
  where user_id = p_user_id;

  delete from public.profiles
  where id = p_user_id;

  delete from auth.users
  where id = p_user_id;
end;
$function$;
