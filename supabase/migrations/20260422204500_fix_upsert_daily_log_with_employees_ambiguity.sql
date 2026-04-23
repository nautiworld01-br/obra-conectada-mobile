create or replace function public.upsert_daily_log_with_employees(
  p_project_id uuid,
  p_date date,
  p_activities text,
  p_weather text,
  p_observations text,
  p_created_by uuid,
  p_employee_ids uuid[] default '{}',
  p_room_id uuid default null,
  p_photos_urls jsonb default null,
  p_videos_urls jsonb default null
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
  videos_urls jsonb
)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_log_id uuid;
  v_photos_urls jsonb;
  v_videos_urls jsonb;
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

  if coalesce(trim(p_activities), '') = '' then
    raise exception 'Atividades são obrigatórias.';
  end if;

  if p_created_by is null or p_created_by <> auth.uid() then
    raise exception 'Usuário criador inválido.';
  end if;

  if p_room_id is not null and not exists (
    select 1
    from public.rooms as rooms
    where rooms.id = p_room_id
      and rooms.project_id = p_project_id
  ) then
    raise exception 'Cômodo inválido para este projeto.';
  end if;

  if p_photos_urls is not null and jsonb_typeof(p_photos_urls) <> 'array' then
    raise exception 'Fotos inválidas. Esperado um array JSON.';
  end if;

  if p_videos_urls is not null and jsonb_typeof(p_videos_urls) <> 'array' then
    raise exception 'Vídeos inválidos. Esperado um array JSON.';
  end if;

  if not public.can_write_project(p_project_id) then
    raise exception 'Sem permissão para alterar registros deste projeto.';
  end if;

  v_photos_urls := case
    when p_photos_urls is null or p_photos_urls = '[]'::jsonb then null
    else p_photos_urls
  end;

  v_videos_urls := case
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
    videos_urls
  )
  values (
    p_project_id,
    p_date,
    trim(p_activities),
    nullif(trim(coalesce(p_weather, '')), ''),
    nullif(trim(coalesce(p_observations, '')), ''),
    p_created_by,
    p_room_id,
    v_photos_urls,
    v_videos_urls
  )
  on conflict on constraint daily_logs_project_id_date_key
  do update set
    activities = excluded.activities,
    weather = excluded.weather,
    observations = excluded.observations,
    created_by = excluded.created_by,
    room_id = excluded.room_id,
    photos_urls = excluded.photos_urls,
    videos_urls = excluded.videos_urls
  returning daily_logs.id
  into v_log_id;

  delete from public.daily_log_employees
  where log_id = v_log_id;

  if coalesce(array_length(p_employee_ids, 1), 0) > 0 then
    insert into public.daily_log_employees (log_id, employee_id)
    select distinct v_log_id, employee_id
    from unnest(p_employee_ids) as employee_id
    where employee_id is not null;
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
    logs.videos_urls
  from public.daily_logs as logs
  where logs.id = v_log_id;
end;
$function$;
