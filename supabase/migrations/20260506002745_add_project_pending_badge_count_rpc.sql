create or replace function public.get_project_pending_badge_count(
  p_project_id uuid
)
returns table (
  open_fronts bigint,
  open_stages bigint
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    (
      select count(*)
      from public.daily_log_service_items as items
      join public.daily_logs as logs
        on logs.id = items.log_id
      where logs.project_id = p_project_id
        and items.status <> 'concluido'
    ) as open_fronts,
    (
      select count(*)
      from public.schedule_stages as stages
      where stages.project_id = p_project_id
        and stages.status in ('em_andamento', 'atrasado', 'bloqueado')
    ) as open_stages;
$function$;
