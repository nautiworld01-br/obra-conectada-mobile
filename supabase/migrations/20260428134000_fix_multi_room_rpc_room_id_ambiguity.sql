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
  p_no_work_note text default null
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

  select coalesce(array_agg(selected.room_id order by selected.ordinality), '{}'::uuid[])
  into v_room_ids
  from (
    select distinct on (input.input_room_id)
      input.input_room_id as room_id,
      input.ordinality
    from unnest(coalesce(p_room_ids, '{}'::uuid[])) with ordinality as input(input_room_id, ordinality)
    where input.input_room_id is not null
    order by input.input_room_id, input.ordinality
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

  if v_no_work_reason is null and coalesce(array_length(v_room_ids, 1), 0) > 0 then
    insert into public.daily_log_rooms (log_id, room_id)
    select v_log_id, selected.selected_room_id
    from unnest(v_room_ids) as selected(selected_room_id);
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

create or replace function public.upsert_weekly_update_with_rooms(
  p_id uuid default null,
  p_project_id uuid default null,
  p_user_id uuid default null,
  p_week_ref text default '',
  p_summary text default '',
  p_status public.week_status default 'no_prazo',
  p_services_completed text[] default '{}',
  p_services_not_completed text[] default '{}',
  p_difficulties text default null,
  p_materials_received text[] default '{}',
  p_materials_missing text[] default '{}',
  p_next_week_plan text default null,
  p_observations text default null,
  p_photos text[] default '{}',
  p_videos text[] default '{}',
  p_room_ids uuid[] default '{}',
  p_owner_comments text default null
)
returns public.weekly_updates
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_project_id uuid;
  v_update public.weekly_updates%rowtype;
  v_room_ids uuid[] := '{}'::uuid[];
  v_primary_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_id is null then
    if p_project_id is null then
      raise exception 'Projeto inválido.';
    end if;

    if p_user_id is null or p_user_id <> auth.uid() then
      raise exception 'Usuário criador inválido.';
    end if;

    v_project_id := p_project_id;
  else
    select updates.project_id
    into v_project_id
    from public.weekly_updates as updates
    where updates.id = p_id;

    if v_project_id is null then
      raise exception 'Relatório inválido.';
    end if;

    if p_project_id is not null and p_project_id <> v_project_id then
      raise exception 'Projeto inválido para este relatório.';
    end if;
  end if;

  if not public.can_write_project(v_project_id) then
    raise exception 'Sem permissão para alterar relatórios deste projeto.';
  end if;

  if nullif(trim(coalesce(p_week_ref, '')), '') is null then
    raise exception 'Semana do relatório inválida.';
  end if;

  if nullif(trim(coalesce(p_summary, '')), '') is null then
    raise exception 'Resumo das atividades é obrigatório.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_room_ids, '{}'::uuid[])) as input(input_room_id)
    left join public.rooms as rooms
      on rooms.id = input.input_room_id
     and rooms.project_id = v_project_id
    where input.input_room_id is not null
      and rooms.id is null
  ) then
    raise exception 'Cômodo inválido para este projeto.';
  end if;

  select coalesce(array_agg(selected.room_id order by selected.ordinality), '{}'::uuid[])
  into v_room_ids
  from (
    select distinct on (input.input_room_id)
      input.input_room_id as room_id,
      input.ordinality
    from unnest(coalesce(p_room_ids, '{}'::uuid[])) with ordinality as input(input_room_id, ordinality)
    where input.input_room_id is not null
    order by input.input_room_id, input.ordinality
  ) as selected;

  v_primary_room_id := v_room_ids[1];

  if p_id is null then
    insert into public.weekly_updates (
      project_id,
      created_by,
      week_ref,
      summary,
      status,
      services_completed,
      services_not_completed,
      difficulties,
      materials_received,
      materials_missing,
      next_week_plan,
      observations,
      photos,
      videos,
      room_id,
      owner_comments
    )
    values (
      v_project_id,
      auth.uid(),
      trim(p_week_ref),
      trim(p_summary),
      p_status,
      coalesce(p_services_completed, '{}'),
      coalesce(p_services_not_completed, '{}'),
      nullif(trim(coalesce(p_difficulties, '')), ''),
      coalesce(p_materials_received, '{}'),
      coalesce(p_materials_missing, '{}'),
      nullif(trim(coalesce(p_next_week_plan, '')), ''),
      nullif(trim(coalesce(p_observations, '')), ''),
      coalesce(p_photos, '{}'),
      coalesce(p_videos, '{}'),
      v_primary_room_id,
      nullif(trim(coalesce(p_owner_comments, '')), '')
    )
    returning *
    into v_update;
  else
    update public.weekly_updates
    set
      week_ref = trim(p_week_ref),
      summary = trim(p_summary),
      status = p_status,
      services_completed = coalesce(p_services_completed, '{}'),
      services_not_completed = coalesce(p_services_not_completed, '{}'),
      difficulties = nullif(trim(coalesce(p_difficulties, '')), ''),
      materials_received = coalesce(p_materials_received, '{}'),
      materials_missing = coalesce(p_materials_missing, '{}'),
      next_week_plan = nullif(trim(coalesce(p_next_week_plan, '')), ''),
      observations = nullif(trim(coalesce(p_observations, '')), ''),
      photos = coalesce(p_photos, '{}'),
      videos = coalesce(p_videos, '{}'),
      room_id = v_primary_room_id,
      owner_comments = nullif(trim(coalesce(p_owner_comments, '')), '')
    where id = p_id
    returning *
    into v_update;
  end if;

  delete from public.weekly_update_rooms
  where update_id = v_update.id;

  if coalesce(array_length(v_room_ids, 1), 0) > 0 then
    insert into public.weekly_update_rooms (update_id, room_id)
    select v_update.id, selected.selected_room_id
    from unnest(v_room_ids) as selected(selected_room_id);
  end if;

  return v_update;
end;
$function$;
