create or replace function public.upsert_daily_log_with_employees(
  p_project_id uuid,
  p_date date,
  p_activities text,
  p_weather text,
  p_observations text,
  p_created_by uuid,
  p_employee_ids uuid[] default '{}',
  p_photos_urls text[] default null,
  p_videos_urls text[] default null
)
returns table (
  id uuid,
  date date,
  activities text,
  weather text,
  observations text,
  created_by uuid,
  project_id uuid,
  photos_urls text[],
  videos_urls text[]
)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_log_id uuid;
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

  if not public.can_write_project(p_project_id) then
    raise exception 'Sem permissão para alterar registros deste projeto.';
  end if;

  insert into public.daily_logs (
    project_id,
    date,
    activities,
    weather,
    observations,
    created_by,
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
    case when coalesce(array_length(p_photos_urls, 1), 0) > 0 then p_photos_urls else null end,
    case when coalesce(array_length(p_videos_urls, 1), 0) > 0 then p_videos_urls else null end
  )
  on conflict (project_id, date)
  do update set
    activities = excluded.activities,
    weather = excluded.weather,
    observations = excluded.observations,
    created_by = excluded.created_by,
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
    logs.photos_urls,
    logs.videos_urls
  from public.daily_logs logs
  where logs.id = v_log_id;
end;
$function$;
