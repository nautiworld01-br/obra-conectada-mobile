create table if not exists public.daily_log_service_items (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.daily_logs(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  description text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.daily_log_service_items enable row level security;

create policy "Members can view log service items"
  on public.daily_log_service_items for select to authenticated
  using (
    exists (
      select 1
      from public.daily_logs as logs
      where logs.id = log_id
        and public.is_member_of_project(logs.project_id)
    )
  );

create policy "Writers can create log service items"
  on public.daily_log_service_items for insert to authenticated
  with check (
    exists (
      select 1
      from public.daily_logs as logs
      where logs.id = log_id
        and public.can_write_project(logs.project_id)
    )
  );

create policy "Writers can update log service items"
  on public.daily_log_service_items for update to authenticated
  using (
    exists (
      select 1
      from public.daily_logs as logs
      where logs.id = log_id
        and public.can_write_project(logs.project_id)
    )
  );

create policy "Writers can delete log service items"
  on public.daily_log_service_items for delete to authenticated
  using (
    exists (
      select 1
      from public.daily_logs as logs
      where logs.id = log_id
        and public.can_write_project(logs.project_id)
    )
  );

create index if not exists daily_log_service_items_log_id_idx on public.daily_log_service_items (log_id);
create index if not exists daily_log_service_items_room_id_idx on public.daily_log_service_items (room_id);
create index if not exists daily_log_service_items_log_order_idx on public.daily_log_service_items (log_id, order_index);

drop function if exists public.upsert_daily_log_with_profiles(
  uuid,
  date,
  text,
  text,
  text,
  uuid,
  uuid[],
  uuid[],
  jsonb,
  jsonb,
  text,
  text
);

create or replace function public.upsert_daily_log_with_profiles(
  p_project_id uuid,
  p_date date,
  p_activities text,
  p_weather text,
  p_observations text,
  p_created_by uuid,
  p_user_ids uuid[] default '{}',
  p_room_ids uuid[] default '{}',
  p_photos_urls jsonb default null,
  p_videos_urls jsonb default null,
  p_no_work_reason text default null,
  p_no_work_note text default null,
  p_service_items jsonb default '[]'::jsonb
)
returns table (
  id uuid,
  date date,
  activities text,
  weather text,
  observations text,
  created_by uuid,
  project_id uuid,
  room_id uuid,
  photos_urls jsonb,
  videos_urls jsonb,
  no_work_reason text,
  no_work_note text
)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_log_id uuid;
  v_photos_urls jsonb;
  v_videos_urls jsonb;
  v_no_work_reason text := nullif(trim(coalesce(p_no_work_reason, '')), '');
  v_no_work_note text := nullif(trim(coalesce(p_no_work_note, '')), '');
  v_room_ids uuid[] := '{}'::uuid[];
  v_primary_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_project_id is null then
    raise exception 'Projeto inválido.';
  end if;

  if p_date is null then
    raise exception 'Data inválida.';
  end if;

  if v_no_work_reason is null and coalesce(trim(p_activities), '') = '' then
    raise exception 'Atividades são obrigatórias.';
  end if;

  if v_no_work_reason is not null and v_no_work_reason not in (
    'feriado',
    'condominio fechado',
    'condominio nao autorizou realizar servicos',
    'chuva intensa',
    'outro'
  ) then
    raise exception 'Motivo de dia sem serviço inválido.';
  end if;

  if v_no_work_reason = 'outro' and v_no_work_note is null then
    raise exception 'Descreva o motivo de não ter tido serviço hoje.';
  end if;

  if p_created_by is null or p_created_by <> auth.uid() then
    raise exception 'Usuário criador inválido.';
  end if;

  if not public.can_write_project(p_project_id) then
    raise exception 'Sem permissão para alterar registros deste projeto.';
  end if;

  if p_service_items is not null and jsonb_typeof(p_service_items) <> 'array' then
    raise exception 'Serviços por cômodo inválidos. Esperado um array JSON.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_service_items, '[]'::jsonb)) with ordinality as input(item, ordinality)
    where nullif(trim(coalesce(input.item ->> 'description', '')), '') is null
  ) then
    raise exception 'Cada serviço por cômodo precisa de descrição.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_service_items, '[]'::jsonb)) with ordinality as input(item, ordinality)
    where nullif(input.item ->> 'room_id', '') is null
  ) then
    raise exception 'Cada serviço por cômodo precisa de um cômodo.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_room_ids, '{}'::uuid[])) as input(input_room_id)
    left join public.rooms as rooms
      on rooms.id = input.input_room_id
     and rooms.project_id = p_project_id
    where input.input_room_id is not null
      and rooms.id is null
  ) then
    raise exception 'Cômodo inválido para este projeto.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_service_items, '[]'::jsonb)) with ordinality as input(item, ordinality)
    left join public.rooms as rooms
      on rooms.id = nullif(input.item ->> 'room_id', '')::uuid
     and rooms.project_id = p_project_id
    where rooms.id is null
  ) then
    raise exception 'Serviço com cômodo inválido para este projeto.';
  end if;

  with normalized_room_ids as (
    select input.input_room_id as room_id, input.ordinality
    from unnest(coalesce(p_room_ids, '{}'::uuid[])) with ordinality as input(input_room_id, ordinality)
    where input.input_room_id is not null
    union
    select nullif(input.item ->> 'room_id', '')::uuid as room_id, 100000 + input.ordinality as ordinality
    from jsonb_array_elements(coalesce(p_service_items, '[]'::jsonb)) with ordinality as input(item, ordinality)
    where nullif(input.item ->> 'room_id', '') is not null
  )
  select coalesce(array_agg(selected.room_id order by selected.ordinality), '{}'::uuid[])
  into v_room_ids
  from (
    select distinct on (normalized_room_ids.room_id)
      normalized_room_ids.room_id,
      normalized_room_ids.ordinality
    from normalized_room_ids
    order by normalized_room_ids.room_id, normalized_room_ids.ordinality
  ) as selected;

  v_primary_room_id := v_room_ids[1];

  if p_photos_urls is not null and jsonb_typeof(p_photos_urls) <> 'array' then
    raise exception 'Fotos inválidas. Esperado um array JSON.';
  end if;

  if p_videos_urls is not null and jsonb_typeof(p_videos_urls) <> 'array' then
    raise exception 'Vídeos inválidos. Esperado um array JSON.';
  end if;

  if v_no_work_reason is null and exists (
    select 1
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as input(user_id)
    left join public.profiles as profiles
      on profiles.id = input.user_id
     and profiles.project_id = p_project_id
     and profiles.is_employee = true
     and coalesce(profiles.status, 'ativo') <> 'inativo'
    where input.user_id is not null
      and profiles.id is null
  ) then
    raise exception 'Funcionário inválido para este projeto.';
  end if;

  v_photos_urls := case
    when v_no_work_reason is not null then null
    when p_photos_urls is null or p_photos_urls = '[]'::jsonb then null
    else p_photos_urls
  end;

  v_videos_urls := case
    when v_no_work_reason is not null then null
    when p_videos_urls is null or p_videos_urls = '[]'::jsonb then null
    else p_videos_urls
  end;

  insert into public.daily_logs (
    project_id,
    date,
    activities,
    weather,
    observations,
    created_by,
    room_id,
    photos_urls,
    videos_urls,
    no_work_reason,
    no_work_note
  )
  values (
    p_project_id,
    p_date,
    case when v_no_work_reason is not null then '' else trim(coalesce(p_activities, '')) end,
    case when v_no_work_reason is not null then null else nullif(trim(coalesce(p_weather, '')), '') end,
    case when v_no_work_reason is not null then null else nullif(trim(coalesce(p_observations, '')), '') end,
    p_created_by,
    case when v_no_work_reason is not null then null else v_primary_room_id end,
    v_photos_urls,
    v_videos_urls,
    v_no_work_reason,
    v_no_work_note
  )
  on conflict on constraint daily_logs_project_id_date_key
  do update set
    activities = excluded.activities,
    weather = excluded.weather,
    observations = excluded.observations,
    created_by = excluded.created_by,
    room_id = excluded.room_id,
    photos_urls = excluded.photos_urls,
    videos_urls = excluded.videos_urls,
    no_work_reason = excluded.no_work_reason,
    no_work_note = excluded.no_work_note
  returning daily_logs.id
  into v_log_id;

  delete from public.daily_log_employees
  where log_id = v_log_id;

  delete from public.daily_log_rooms
  where log_id = v_log_id;

  delete from public.daily_log_service_items
  where log_id = v_log_id;

  if v_no_work_reason is null and coalesce(array_length(v_room_ids, 1), 0) > 0 then
    insert into public.daily_log_rooms (log_id, room_id)
    select v_log_id, selected.selected_room_id
    from unnest(v_room_ids) as selected(selected_room_id);
  end if;

  if v_no_work_reason is null and jsonb_array_length(coalesce(p_service_items, '[]'::jsonb)) > 0 then
    insert into public.daily_log_service_items (log_id, room_id, description, order_index)
    select
      v_log_id,
      nullif(input.item ->> 'room_id', '')::uuid,
      trim(input.item ->> 'description'),
      input.ordinality - 1
    from jsonb_array_elements(coalesce(p_service_items, '[]'::jsonb)) with ordinality as input(item, ordinality);
  end if;

  if v_no_work_reason is null and coalesce(array_length(p_user_ids, 1), 0) > 0 then
    insert into public.daily_log_employees (log_id, user_id)
    select
      v_log_id,
      selected_profiles.id
    from (
      select distinct input.user_id
      from unnest(coalesce(p_user_ids, '{}'::uuid[])) as input(user_id)
      where input.user_id is not null
    ) as selected_ids
    join public.profiles as selected_profiles
      on selected_profiles.id = selected_ids.user_id
     and selected_profiles.project_id = p_project_id
     and selected_profiles.is_employee = true
     and coalesce(selected_profiles.status, 'ativo') <> 'inativo';
  end if;

  return query
  select
    logs.id,
    logs.date,
    logs.activities,
    logs.weather,
    logs.observations,
    logs.created_by,
    logs.project_id,
    logs.room_id,
    logs.photos_urls,
    logs.videos_urls,
    logs.no_work_reason,
    logs.no_work_note
  from public.daily_logs as logs
  where logs.id = v_log_id;
end;
$function$;
