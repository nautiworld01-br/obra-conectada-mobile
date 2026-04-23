alter table public.employees
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists employees_project_user_id_key
  on public.employees (project_id, user_id)
  where user_id is not null;

create index if not exists employees_user_id_idx
  on public.employees (user_id);

drop policy if exists "Writers can delete daily logs" on public.daily_logs;
create policy "Writers can delete daily logs"
  on public.daily_logs
  for delete
  to authenticated
  using (public.can_write_project(project_id));

create or replace function public.sync_project_member_employee(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_profile record;
  v_member record;
begin
  if p_project_id is null or p_user_id is null then
    return;
  end if;

  select profiles.full_name, profiles.avatar_url, profiles.status, profiles.occupation_role
  into v_profile
  from public.profiles
  where profiles.id = p_user_id;

  select project_members.role
  into v_member
  from public.project_members
  where project_members.project_id = p_project_id
    and project_members.user_id = p_user_id;

  if not found then
    update public.employees
    set status = 'inativo'
    where project_id = p_project_id
      and user_id = p_user_id;
    return;
  end if;

  if v_member.role = 'proprietario' then
    update public.employees
    set status = 'inativo'
    where project_id = p_project_id
      and user_id = p_user_id;
    return;
  end if;

  insert into public.employees (
    project_id,
    user_id,
    full_name,
    role,
    status,
    photo
  )
  values (
    p_project_id,
    p_user_id,
    coalesce(nullif(trim(v_profile.full_name), ''), 'Funcionário'),
    coalesce(nullif(trim(v_profile.occupation_role), ''), 'Funcionário'),
    case when coalesce(v_profile.status, 'ativo') = 'inativo' then 'inativo'::public.employee_status else 'ativo'::public.employee_status end,
    v_profile.avatar_url
  )
  on conflict (project_id, user_id) where user_id is not null
  do update set
    full_name = excluded.full_name,
    role = excluded.role,
    status = excluded.status,
    photo = excluded.photo,
    updated_at = now();
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
    perform public.sync_project_member_employee(old.project_id, old.user_id);
    return old;
  end if;

  perform public.sync_project_member_employee(new.project_id, new.user_id);
  return new;
end;
$function$;

create or replace function public.sync_profile_employee_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_member record;
begin
  for v_member in
    select project_members.project_id, project_members.user_id
    from public.project_members
    where project_members.user_id = new.id
  loop
    perform public.sync_project_member_employee(v_member.project_id, v_member.user_id);
  end loop;

  return new;
end;
$function$;

drop trigger if exists sync_project_member_employee_after_change on public.project_members;
create trigger sync_project_member_employee_after_change
  after insert or update or delete on public.project_members
  for each row
  execute function public.sync_project_member_employee_trigger();

drop trigger if exists sync_profile_employee_after_change on public.profiles;
create trigger sync_profile_employee_after_change
  after update of full_name, avatar_url, status, occupation_role on public.profiles
  for each row
  execute function public.sync_profile_employee_trigger();

insert into public.employees (
  project_id,
  user_id,
  full_name,
  role,
  status,
  photo
)
select
  members.project_id,
  members.user_id,
  coalesce(nullif(trim(profiles.full_name), ''), 'Funcionário'),
  coalesce(nullif(trim(profiles.occupation_role), ''), 'Funcionário'),
  case when coalesce(profiles.status, 'ativo') = 'inativo' then 'inativo'::public.employee_status else 'ativo'::public.employee_status end,
  profiles.avatar_url
from public.project_members as members
join public.profiles as profiles
  on profiles.id = members.user_id
where members.role <> 'proprietario'
on conflict (project_id, user_id) where user_id is not null
do update set
  full_name = excluded.full_name,
  role = excluded.role,
  status = excluded.status,
  photo = excluded.photo,
  updated_at = now();

update public.employees as employees
set status = 'inativo'
where employees.user_id is null
  and exists (
    select 1
    from public.project_members as members
    join public.profiles as profiles
      on profiles.id = members.user_id
    where members.project_id = employees.project_id
      and members.role = 'proprietario'
      and lower(profiles.full_name) like lower(employees.full_name) || '%'
  );
