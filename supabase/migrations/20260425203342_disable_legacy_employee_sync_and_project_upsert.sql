create or replace function public.sync_project_member_employee(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  return;
end;
$function$;

create or replace function public.sync_project_member_employee_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

create or replace function public.sync_profile_employee_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  return new;
end;
$function$;

drop trigger if exists sync_project_member_employee_after_change on public.project_members;
drop trigger if exists sync_profile_employee_after_change on public.profiles;

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

    insert into public.project_members (project_id, user_id, role)
    values (v_project_id, p_user_id, 'proprietario')
    on conflict (project_id, user_id) do update
      set role = excluded.role;
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
