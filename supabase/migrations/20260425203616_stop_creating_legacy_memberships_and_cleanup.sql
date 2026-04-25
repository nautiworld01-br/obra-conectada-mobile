create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_is_owner boolean := coalesce((new.raw_user_meta_data->>'is_owner')::boolean, false);
  v_is_employee boolean := coalesce((new.raw_user_meta_data->>'is_employee')::boolean, false);
  v_project_id uuid;
  v_project_count integer;
  v_occupation_role text := nullif(trim(coalesce(new.raw_user_meta_data->>'occupation_role', '')), '');
begin
  if v_is_employee then
    select count(*)::int
    into v_project_count
    from public.projects;

    select id
    into v_project_id
    from public.projects
    order by created_at asc
    limit 1;
  end if;

  insert into public.profiles (
    id,
    full_name,
    is_owner,
    is_employee,
    status,
    occupation_role,
    project_id
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_is_owner,
    v_is_employee,
    'ativo',
    case when v_is_employee then coalesce(v_occupation_role, 'Funcionário') else null end,
    case when v_is_employee and v_project_count = 1 then v_project_id else null end
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    is_owner = excluded.is_owner,
    is_employee = excluded.is_employee,
    status = coalesce(profiles.status, excluded.status),
    occupation_role = coalesce(profiles.occupation_role, excluded.occupation_role),
    project_id = coalesce(profiles.project_id, excluded.project_id);

  return new;
end;
$function$;

create or replace function public.upsert_full_project(
  p_project_id uuid default null,
  p_user_id uuid default null,
  p_name text default null,
  p_address text default null,
  p_photo_url text default null,
  p_observations text default null,
  p_rooms jsonb default '[]'::jsonb,
  p_employees jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_project_id uuid;
  v_room_names text[];
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'Usuário inválido para esta operação.';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da obra é obrigatório.';
  end if;

  if p_rooms is not null and jsonb_typeof(p_rooms) <> 'array' then
    raise exception 'Cômodos inválidos. Esperado um array JSON.';
  end if;

  if p_employees is not null and jsonb_typeof(p_employees) <> 'array' then
    raise exception 'Equipe inválida. Esperado um array JSON.';
  end if;

  if p_project_id is null then
    insert into public.projects (
      name,
      address,
      photo_url,
      observations,
      owner_id
    )
    values (
      trim(p_name),
      nullif(trim(coalesce(p_address, '')), ''),
      nullif(trim(coalesce(p_photo_url, '')), ''),
      nullif(trim(coalesce(p_observations, '')), ''),
      p_user_id
    )
    returning id into v_project_id;
  else
    if not public.is_project_owner(p_project_id) then
      raise exception 'Sem permissão para alterar esta obra.';
    end if;

    update public.projects
    set
      name = trim(p_name),
      address = nullif(trim(coalesce(p_address, '')), ''),
      photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
      observations = nullif(trim(coalesce(p_observations, '')), '')
    where id = p_project_id;

    v_project_id := p_project_id;
  end if;

  update public.profiles
  set
    project_id = v_project_id,
    is_owner = true,
    is_employee = false
  where id = p_user_id;

  with parsed_rooms as (
    select
      nullif(item->>'id', '')::uuid as id,
      trim(item->>'name') as name,
      ordinality::integer - 1 as display_order
    from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) with ordinality as t(item, ordinality)
    where coalesce(trim(item->>'name'), '') <> ''
  ),
  normalized_rooms as (
    select distinct on (lower(name))
      id,
      name,
      display_order
    from parsed_rooms
    order by lower(name), display_order
  )
  update public.rooms as rooms
  set
    name = normalized_rooms.name,
    display_order = normalized_rooms.display_order
  from normalized_rooms
  where rooms.project_id = v_project_id
    and normalized_rooms.id is not null
    and rooms.id = normalized_rooms.id;

  with parsed_rooms as (
    select
      nullif(item->>'id', '')::uuid as id,
      trim(item->>'name') as name,
      ordinality::integer - 1 as display_order
    from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) with ordinality as t(item, ordinality)
    where coalesce(trim(item->>'name'), '') <> ''
  ),
  normalized_rooms as (
    select distinct on (lower(name))
      id,
      name,
      display_order
    from parsed_rooms
    order by lower(name), display_order
  )
  insert into public.rooms (project_id, name, display_order)
  select
    v_project_id,
    normalized_rooms.name,
    normalized_rooms.display_order
  from normalized_rooms
  where not exists (
    select 1
    from public.rooms as rooms
    where rooms.project_id = v_project_id
      and (
        (normalized_rooms.id is not null and rooms.id = normalized_rooms.id)
        or lower(rooms.name) = lower(normalized_rooms.name)
      )
  )
  on conflict (project_id, name) do update
    set display_order = excluded.display_order;

  with parsed_rooms as (
    select
      nullif(item->>'id', '')::uuid as id,
      trim(item->>'name') as name
    from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) as t(item)
    where coalesce(trim(item->>'name'), '') <> ''
  ),
  normalized_rooms as (
    select distinct on (lower(name))
      id,
      name
    from parsed_rooms
    order by lower(name), id nulls last
  )
  delete from public.rooms as rooms
  where rooms.project_id = v_project_id
    and not exists (
      select 1
      from normalized_rooms
      where (normalized_rooms.id is not null and normalized_rooms.id = rooms.id)
         or lower(normalized_rooms.name) = lower(rooms.name)
    );

  select coalesce(array_agg(rooms.name order by rooms.display_order, rooms.created_at), '{}')
  into v_room_names
  from public.rooms as rooms
  where rooms.project_id = v_project_id;

  update public.projects
  set rooms = v_room_names
  where id = v_project_id;

  return v_project_id;
end;
$function$;

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

  delete from public.profiles
  where id = p_user_id;

  delete from auth.users
  where id = p_user_id;
end;
$function$;
