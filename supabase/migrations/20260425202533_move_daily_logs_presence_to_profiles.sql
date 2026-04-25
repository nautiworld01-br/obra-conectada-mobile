alter table public.daily_log_employees
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;

alter table public.daily_log_employees
  alter column employee_id drop not null;

update public.daily_log_employees as daily_log_employees
set user_id = employees.user_id
from public.employees as employees
where daily_log_employees.employee_id = employees.id
  and daily_log_employees.user_id is null
  and employees.user_id is not null;

with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by log_id, user_id
      order by created_at asc, id asc
    ) as row_number
  from public.daily_log_employees
  where user_id is not null
)
delete from public.daily_log_employees as daily_log_employees
using ranked_duplicates
where daily_log_employees.id = ranked_duplicates.id
  and ranked_duplicates.row_number > 1;

create index if not exists daily_log_employees_user_id_idx
  on public.daily_log_employees (user_id);

create unique index if not exists daily_log_employees_log_user_id_key
  on public.daily_log_employees (log_id, user_id)
  where user_id is not null;

create or replace function public.upsert_daily_log_with_profiles(
  p_project_id uuid,
  p_date date,
  p_activities text,
  p_weather text,
  p_observations text,
  p_created_by uuid,
  p_user_ids uuid[] default '{}',
  p_room_id uuid default null,
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
    case when v_no_work_reason is not null then null else p_room_id end,
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

  if v_no_work_reason is null and coalesce(array_length(p_user_ids, 1), 0) > 0 then
    insert into public.daily_log_employees (log_id, user_id, employee_id)
    select
      v_log_id,
      selected_profiles.id,
      employees.id
    from (
      select distinct input.user_id
      from unnest(coalesce(p_user_ids, '{}'::uuid[])) as input(user_id)
      where input.user_id is not null
    ) as selected_ids
    join public.profiles as selected_profiles
      on selected_profiles.id = selected_ids.user_id
     and selected_profiles.project_id = p_project_id
     and selected_profiles.is_employee = true
     and coalesce(selected_profiles.status, 'ativo') <> 'inativo'
    left join public.employees as employees
      on employees.project_id = p_project_id
     and employees.user_id = selected_profiles.id;
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
  v_user_ids uuid[];
begin
  select coalesce(
    array_agg(distinct employees.user_id) filter (where employees.user_id is not null),
    '{}'::uuid[]
  )
  into v_user_ids
  from public.employees as employees
  where employees.id = any(coalesce(p_employee_ids, '{}'::uuid[]));

  return query
  select *
  from public.upsert_daily_log_with_profiles(
    p_project_id => p_project_id,
    p_date => p_date,
    p_activities => p_activities,
    p_weather => p_weather,
    p_observations => p_observations,
    p_created_by => p_created_by,
    p_user_ids => v_user_ids,
    p_room_id => p_room_id,
    p_photos_urls => p_photos_urls,
    p_videos_urls => p_videos_urls,
    p_no_work_reason => p_no_work_reason,
    p_no_work_note => p_no_work_note
  );
end;
$function$;
