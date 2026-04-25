alter table public.profiles
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists profiles_project_id_idx
  on public.profiles (project_id);

update public.profiles as profiles
set project_id = membership.project_id
from (
  select distinct on (members.user_id)
    members.user_id,
    members.project_id
  from public.project_members as members
  order by members.user_id, members.created_at asc, members.project_id asc
) as membership
where profiles.id = membership.user_id
  and profiles.project_id is null;

update public.profiles as profiles
set project_id = owned_projects.id
from (
  select distinct on (projects.owner_id)
    projects.owner_id,
    projects.id
  from public.projects as projects
  order by projects.owner_id, projects.created_at asc, projects.id asc
) as owned_projects
where profiles.id = owned_projects.owner_id
  and profiles.project_id is null;

create or replace function public.get_user_project_role(p_project_id uuid)
returns public.project_role
language sql
stable
security definer
set search_path = public
as $function$
  select case
    when profiles.project_id = p_project_id
      and coalesce(profiles.status, 'ativo') <> 'inativo'
      and profiles.is_owner = true
    then 'proprietario'::public.project_role
    when profiles.project_id = p_project_id
      and coalesce(profiles.status, 'ativo') <> 'inativo'
      and profiles.is_employee = true
    then 'empreiteiro'::public.project_role
    else null
  end
  from public.profiles as profiles
  where profiles.id = auth.uid()
  limit 1;
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
    from public.profiles as profiles
    where profiles.id = auth.uid()
      and profiles.project_id = p_project_id
      and coalesce(profiles.status, 'ativo') <> 'inativo'
      and (profiles.is_owner = true or profiles.is_employee = true)
  );
$function$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles as profiles
    where profiles.id = auth.uid()
      and profiles.project_id = p_project_id
      and coalesce(profiles.status, 'ativo') <> 'inativo'
      and profiles.is_owner = true
  );
$function$;

create or replace function public.is_project_contractor(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles as profiles
    where profiles.id = auth.uid()
      and profiles.project_id = p_project_id
      and coalesce(profiles.status, 'ativo') <> 'inativo'
      and profiles.is_employee = true
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
    from public.profiles as profiles
    where profiles.id = auth.uid()
      and profiles.project_id = p_project_id
      and coalesce(profiles.status, 'ativo') <> 'inativo'
      and (profiles.is_owner = true or profiles.is_employee = true)
  );
$function$;

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
  v_profile_project_id uuid := null;
begin
  select count(*)::int
  into v_project_count
  from public.projects;

  select id
  into v_project_id
  from public.projects
  order by created_at asc
  limit 1;

  if v_project_count = 1 and v_project_id is not null then
    v_profile_project_id := v_project_id;
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
    v_profile_project_id
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    is_owner = excluded.is_owner,
    is_employee = excluded.is_employee,
    status = coalesce(profiles.status, excluded.status),
    occupation_role = coalesce(profiles.occupation_role, excluded.occupation_role),
    project_id = coalesce(profiles.project_id, excluded.project_id);

  if v_is_employee and v_project_count = 1 and v_project_id is not null then
    insert into public.project_members (project_id, user_id, role, invited_by)
    values (v_project_id, new.id, 'empreiteiro', null)
    on conflict (project_id, user_id) do nothing;
  end if;

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
  v_manage_employees boolean := coalesce(jsonb_array_length(coalesce(p_employees, '[]'::jsonb)), 0) > 0;
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

  if v_manage_employees then
    with parsed_employees as (
      select
        nullif(item->>'id', '')::uuid as id,
        trim(item->>'full_name') as full_name,
        trim(coalesce(item->>'role', '')) as role,
        nullif(trim(coalesce(item->>'photo', '')), '') as photo
      from jsonb_array_elements(coalesce(p_employees, '[]'::jsonb)) as t(item)
      where coalesce(trim(item->>'full_name'), '') <> ''
    )
    update public.employees as employees
    set
      full_name = parsed_employees.full_name,
      role = coalesce(nullif(parsed_employees.role, ''), employees.role),
      photo = parsed_employees.photo
    from parsed_employees
    where employees.project_id = v_project_id
      and parsed_employees.id is not null
      and employees.id = parsed_employees.id;

    with parsed_employees as (
      select
        nullif(item->>'id', '')::uuid as id,
        trim(item->>'full_name') as full_name,
        trim(coalesce(item->>'role', '')) as role,
        nullif(trim(coalesce(item->>'photo', '')), '') as photo
      from jsonb_array_elements(coalesce(p_employees, '[]'::jsonb)) as t(item)
      where coalesce(trim(item->>'full_name'), '') <> ''
    )
    insert into public.employees (
      project_id,
      full_name,
      role,
      photo
    )
    select
      v_project_id,
      parsed_employees.full_name,
      coalesce(nullif(parsed_employees.role, ''), ''),
      parsed_employees.photo
    from parsed_employees
    where not exists (
      select 1
      from public.employees as employees
      where employees.project_id = v_project_id
        and (
          (parsed_employees.id is not null and employees.id = parsed_employees.id)
          or lower(employees.full_name) = lower(parsed_employees.full_name)
        )
    );

    with parsed_employees as (
      select
        nullif(item->>'id', '')::uuid as id,
        trim(item->>'full_name') as full_name
      from jsonb_array_elements(coalesce(p_employees, '[]'::jsonb)) as t(item)
      where coalesce(trim(item->>'full_name'), '') <> ''
    )
    delete from public.employees as employees
    where employees.project_id = v_project_id
      and not exists (
        select 1
        from parsed_employees
        where (parsed_employees.id is not null and parsed_employees.id = employees.id)
           or lower(parsed_employees.full_name) = lower(employees.full_name)
      );
  end if;

  return v_project_id;
end;
$function$;
