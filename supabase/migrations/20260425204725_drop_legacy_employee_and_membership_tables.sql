drop function if exists public.sync_project_member_employee(uuid, uuid);
drop function if exists public.sync_project_member_employee_trigger();
drop function if exists public.sync_profile_employee_trigger();

drop table if exists public.project_members cascade;
drop table if exists public.employees cascade;
