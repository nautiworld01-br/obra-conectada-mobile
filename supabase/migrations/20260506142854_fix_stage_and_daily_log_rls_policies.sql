drop policy if exists "Logs visíveis apenas para perfis ativos" on public.daily_logs;
drop policy if exists "Etapas visíveis apenas para perfis ativos" on public.schedule_stages;

drop policy if exists "Members can view daily logs" on public.daily_logs;
create policy "Members can view daily logs"
  on public.daily_logs
  for select
  to authenticated
  using (public.is_member_of_project(project_id));

drop policy if exists "Writers can create daily logs" on public.daily_logs;
create policy "Writers can create daily logs"
  on public.daily_logs
  for insert
  to authenticated
  with check (
    public.can_write_project(project_id)
    and created_by = auth.uid()
  );

drop policy if exists "Writers can update daily logs" on public.daily_logs;
create policy "Writers can update daily logs"
  on public.daily_logs
  for update
  to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

drop policy if exists "Owners can delete daily logs" on public.daily_logs;
drop policy if exists "Writers can delete daily logs" on public.daily_logs;
create policy "Writers can delete daily logs"
  on public.daily_logs
  for delete
  to authenticated
  using (public.can_write_project(project_id));

drop policy if exists "Members can view stages" on public.schedule_stages;
create policy "Members can view stages"
  on public.schedule_stages
  for select
  to authenticated
  using (public.is_member_of_project(project_id));

drop policy if exists "Writers can create stages" on public.schedule_stages;
create policy "Writers can create stages"
  on public.schedule_stages
  for insert
  to authenticated
  with check (public.can_write_project(project_id));

drop policy if exists "Writers can update stages" on public.schedule_stages;
create policy "Writers can update stages"
  on public.schedule_stages
  for update
  to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

drop policy if exists "Owners can delete stages" on public.schedule_stages;
drop policy if exists "Writers can delete stages" on public.schedule_stages;
create policy "Writers can delete stages"
  on public.schedule_stages
  for delete
  to authenticated
  using (public.can_write_project(project_id));
