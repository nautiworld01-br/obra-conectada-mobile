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
begin
  insert into public.profiles (
    id,
    full_name,
    is_owner,
    is_employee,
    status,
    occupation_role
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_is_owner,
    v_is_employee,
    'ativo',
    case when v_is_employee then coalesce(v_occupation_role, 'Funcionário') else null end
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    is_owner = excluded.is_owner,
    is_employee = excluded.is_employee,
    status = coalesce(profiles.status, excluded.status),
    occupation_role = coalesce(profiles.occupation_role, excluded.occupation_role);

  if v_is_employee then
    select count(*)::int
    into v_project_count
    from public.projects;

    select id
    into v_project_id
    from public.projects
    order by created_at asc
    limit 1;

    if v_project_count = 1 and v_project_id is not null then
      insert into public.project_members (project_id, user_id, role, invited_by)
      values (v_project_id, new.id, 'empreiteiro', null)
      on conflict (project_id, user_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;
