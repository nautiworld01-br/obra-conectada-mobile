-- 1. Add duration columns to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS duration_value integer,
  ADD COLUMN IF NOT EXISTS duration_unit text DEFAULT 'meses';
-- 2. Create daily_logs table
CREATE TABLE public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  activities text DEFAULT '',
  weather text,
  observations text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, date)
);
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view daily logs"
  ON public.daily_logs FOR SELECT TO authenticated
  USING (is_member_of_project(project_id));
CREATE POLICY "Writers can create daily logs"
  ON public.daily_logs FOR INSERT TO authenticated
  WITH CHECK (can_write_project(project_id) AND created_by = auth.uid());
CREATE POLICY "Writers can update daily logs"
  ON public.daily_logs FOR UPDATE TO authenticated
  USING (can_write_project(project_id));
CREATE POLICY "Owners can delete daily logs"
  ON public.daily_logs FOR DELETE TO authenticated
  USING (is_project_owner(project_id));
CREATE TRIGGER update_daily_logs_updated_at
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- 3. Create daily_log_employees table
CREATE TABLE public.daily_log_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.daily_logs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_log_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view log employees"
  ON public.daily_log_employees FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_logs dl WHERE dl.id = log_id AND is_member_of_project(dl.project_id)));
CREATE POLICY "Writers can create log employees"
  ON public.daily_log_employees FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_logs dl WHERE dl.id = log_id AND can_write_project(dl.project_id)));
CREATE POLICY "Writers can delete log employees"
  ON public.daily_log_employees FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_logs dl WHERE dl.id = log_id AND can_write_project(dl.project_id)));
-- 4. Create daily_log_media table
CREATE TABLE public.daily_log_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.daily_logs(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'photo',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_log_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view log media"
  ON public.daily_log_media FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_logs dl WHERE dl.id = log_id AND is_member_of_project(dl.project_id)));
CREATE POLICY "Writers can create log media"
  ON public.daily_log_media FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_logs dl WHERE dl.id = log_id AND can_write_project(dl.project_id)));
CREATE POLICY "Writers can delete log media"
  ON public.daily_log_media FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_logs dl WHERE dl.id = log_id AND can_write_project(dl.project_id)));
