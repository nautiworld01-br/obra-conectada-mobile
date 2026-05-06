create index if not exists payments_project_request_date_idx
  on public.payments (project_id, request_date desc);

create index if not exists schedule_stages_project_planned_start_idx
  on public.schedule_stages (project_id, planned_start asc);

create index if not exists schedule_stages_project_active_status_idx
  on public.schedule_stages (project_id, status)
  where status in ('em_andamento', 'atrasado', 'bloqueado');

create index if not exists profiles_project_employee_status_name_idx
  on public.profiles (project_id, is_employee, status, full_name);

create index if not exists daily_log_service_items_open_log_id_idx
  on public.daily_log_service_items (log_id)
  where status <> 'concluido';

create or replace function public.get_project_pending_items(
  p_project_id uuid
)
returns table (
  item_id uuid,
  kind text,
  source_label text,
  title text,
  room_name text,
  item_date date,
  log_id uuid,
  service_item_id uuid,
  stage_id uuid,
  priority integer
)
language sql
stable
security invoker
set search_path = public
as $function$
  with front_items as (
    select
      items.id as item_id,
      'front'::text as kind,
      'Dia a Dia'::text as source_label,
      coalesce(rooms.name, 'Cômodo removido') as title,
      coalesce(rooms.name, 'Cômodo removido') as room_name,
      logs.date as item_date,
      logs.id as log_id,
      items.id as service_item_id,
      null::uuid as stage_id,
      0 as priority
    from public.daily_log_service_items as items
    join public.daily_logs as logs
      on logs.id = items.log_id
    left join public.rooms as rooms
      on rooms.id = items.room_id
    where logs.project_id = p_project_id
      and items.status <> 'concluido'
  ),
  stage_items as (
    select
      stages.id as item_id,
      'stage'::text as kind,
      'Etapas'::text as source_label,
      stages.name as title,
      coalesce(
        rooms.name,
        case
          when stages.room_id is null then 'Sem cômodo'
          else 'Cômodo removido'
        end
      ) as room_name,
      coalesce(stages.created_at::date, stages.planned_start, stages.planned_end) as item_date,
      null::uuid as log_id,
      null::uuid as service_item_id,
      stages.id as stage_id,
      case stages.status
        when 'atrasado' then 3
        when 'bloqueado' then 2
        when 'em_andamento' then 1
        else 0
      end as priority
    from public.schedule_stages as stages
    left join public.rooms as rooms
      on rooms.id = stages.room_id
    where stages.project_id = p_project_id
      and stages.status in ('em_andamento', 'atrasado', 'bloqueado')
  )
  select *
  from front_items

  union all

  select *
  from stage_items;
$function$;
