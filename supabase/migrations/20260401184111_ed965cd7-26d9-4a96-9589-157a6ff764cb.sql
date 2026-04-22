DROP POLICY "Members can view projects" ON public.projects;
CREATE POLICY "Members can view projects" ON public.projects
  FOR SELECT TO authenticated
  USING (is_member_of_project(id) OR owner_id = auth.uid());
