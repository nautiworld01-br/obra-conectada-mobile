drop policy if exists "Owners can view work crews" on public.work_crews;
create policy "Owners can view work crews"
on public.work_crews
for select
to authenticated
using (
  public.is_project_owner(project_id)
);

drop policy if exists "Owners can insert work crews" on public.work_crews;
create policy "Owners can insert work crews"
on public.work_crews
for insert
to authenticated
with check (
  public.is_project_owner(project_id)
);

drop policy if exists "Owners can update work crews" on public.work_crews;
create policy "Owners can update work crews"
on public.work_crews
for update
to authenticated
using (
  public.is_project_owner(project_id)
)
with check (
  public.is_project_owner(project_id)
);

drop policy if exists "Owners can delete work crews" on public.work_crews;
create policy "Owners can delete work crews"
on public.work_crews
for delete
to authenticated
using (
  public.is_project_owner(project_id)
);

drop policy if exists "Members can view private project documents" on storage.objects;
create policy "Members can view private project documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-documents'
  and public.is_member_of_project(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Owners can upload private project documents" on storage.objects;
create policy "Owners can upload private project documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-documents'
  and public.can_write_project(((storage.foldername(name))[1])::uuid)
);
