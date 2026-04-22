-- =============================================
-- 1. ENUMS
-- =============================================
CREATE TYPE public.project_role AS ENUM ('proprietario', 'empreiteiro', 'financeiro');
CREATE TYPE public.week_status AS ENUM ('adiantado', 'no_prazo', 'atrasado');
CREATE TYPE public.stage_status AS ENUM ('nao_iniciado', 'em_andamento', 'concluido', 'atrasado', 'bloqueado');
CREATE TYPE public.payment_status AS ENUM ('pendente', 'em_analise', 'aprovado', 'pago', 'recusado');
CREATE TYPE public.extra_status AS ENUM ('aguardando_aprovacao', 'aprovado', 'recusado', 'contratado');
CREATE TYPE public.urgency_level AS ENUM ('baixa', 'media', 'alta');
CREATE TYPE public.employee_status AS ENUM ('ativo', 'inativo');
CREATE TYPE public.extra_category AS ENUM ('material', 'mao_de_obra', 'frete', 'locacao', 'outro');
-- =============================================
-- 2. HELPER: update_updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
-- =============================================
-- 3. BASE TABLES
-- =============================================

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  total_contract_value NUMERIC(12,2) DEFAULT 0,
  payment_frequency TEXT DEFAULT 'quinzenal',
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
-- Project Members
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_role NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
-- Weekly Updates
CREATE TABLE public.weekly_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  week_ref TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  services_completed TEXT[] DEFAULT '{}',
  services_not_completed TEXT[] DEFAULT '{}',
  difficulties TEXT DEFAULT '',
  materials_received TEXT[] DEFAULT '{}',
  materials_missing TEXT[] DEFAULT '{}',
  next_week_plan TEXT DEFAULT '',
  observations TEXT DEFAULT '',
  status public.week_status NOT NULL DEFAULT 'no_prazo',
  photos TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  stage_id UUID,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.weekly_updates ENABLE ROW LEVEL SECURITY;
-- Update Media
CREATE TABLE public.update_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  update_id UUID NOT NULL REFERENCES public.weekly_updates(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'photo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.update_media ENABLE ROW LEVEL SECURITY;
-- Schedule Stages
CREATE TABLE public.schedule_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  substage TEXT,
  responsible TEXT DEFAULT '',
  planned_start DATE,
  planned_end DATE,
  actual_start DATE,
  actual_end DATE,
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  status public.stage_status NOT NULL DEFAULT 'nao_iniciado',
  depends_on UUID REFERENCES public.schedule_stages(id),
  observations TEXT,
  parent_id UUID REFERENCES public.schedule_stages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_stages ENABLE ROW LEVEL SECURITY;
-- Payments
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  period TEXT NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_amount NUMERIC(12,2) DEFAULT 0,
  requested_amount NUMERIC(12,2) NOT NULL,
  stage_id UUID REFERENCES public.schedule_stages(id),
  description TEXT NOT NULL DEFAULT '',
  percent_work INTEGER DEFAULT 0,
  observations TEXT,
  status public.payment_status NOT NULL DEFAULT 'pendente',
  approval_date DATE,
  payment_date DATE,
  approved_by UUID REFERENCES auth.users(id),
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- Extra Budgets
CREATE TABLE public.extra_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category public.extra_category NOT NULL DEFAULT 'outro',
  description TEXT NOT NULL DEFAULT '',
  supplier TEXT DEFAULT '',
  quoted_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  deadline TEXT,
  urgency public.urgency_level NOT NULL DEFAULT 'media',
  justification TEXT DEFAULT '',
  attachments TEXT[] DEFAULT '{}',
  status public.extra_status NOT NULL DEFAULT 'aguardando_aprovacao',
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.extra_budgets ENABLE ROW LEVEL SECURITY;
-- Documents
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  description TEXT,
  file_url TEXT NOT NULL,
  expiry_date DATE,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
-- Employees
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  company TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  start_date DATE,
  status public.employee_status NOT NULL DEFAULT 'ativo',
  photo TEXT,
  emergency_contact TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
-- Daily Attendance
CREATE TABLE public.daily_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_present INTEGER DEFAULT 0,
  observations TEXT,
  weather TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, date)
);
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;
-- Attendance Entries
CREATE TABLE public.attendance_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_id UUID NOT NULL REFERENCES public.daily_attendance(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_today TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;
-- Comments (polymorphic)
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  related_table TEXT NOT NULL,
  related_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
-- =============================================
-- 4. TRIGGERS for updated_at
-- =============================================
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_updates_updated_at BEFORE UPDATE ON public.weekly_updates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_stages_updated_at BEFORE UPDATE ON public.schedule_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_extra_budgets_updated_at BEFORE UPDATE ON public.extra_budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- =============================================
-- 5. SECURITY DEFINER HELPER FUNCTIONS
-- =============================================

-- Check if current user is a member of a project
CREATE OR REPLACE FUNCTION public.is_member_of_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;
-- Get user's role in a project
CREATE OR REPLACE FUNCTION public.get_user_project_role(p_project_id UUID)
RETURNS public.project_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = auth.uid()
  LIMIT 1;
$$;
-- Check if current user is the project owner
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'proprietario'
  );
$$;
-- Check if current user is a contractor
CREATE OR REPLACE FUNCTION public.is_project_contractor(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'empreiteiro'
  );
$$;
-- Check if current user is NOT financeiro (can write)
CREATE OR REPLACE FUNCTION public.can_write_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role IN ('proprietario', 'empreiteiro')
  );
$$;
-- =============================================
-- 6. RLS POLICIES
-- =============================================

-- Profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
-- Projects
CREATE POLICY "Members can view projects" ON public.projects FOR SELECT TO authenticated USING (public.is_member_of_project(id));
CREATE POLICY "Authenticated can create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can update projects" ON public.projects FOR UPDATE TO authenticated USING (public.is_project_owner(id));
CREATE POLICY "Owners can delete projects" ON public.projects FOR DELETE TO authenticated USING (public.is_project_owner(id));
-- Project Members
CREATE POLICY "Members can view project members" ON public.project_members FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Owners can insert project members" ON public.project_members FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(project_id) OR project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
CREATE POLICY "Owners can update project members" ON public.project_members FOR UPDATE TO authenticated USING (public.is_project_owner(project_id));
CREATE POLICY "Owners can delete project members" ON public.project_members FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Weekly Updates
CREATE POLICY "Members can view updates" ON public.weekly_updates FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create updates" ON public.weekly_updates FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id) AND created_by = auth.uid());
CREATE POLICY "Writers can edit updates" ON public.weekly_updates FOR UPDATE TO authenticated USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete updates" ON public.weekly_updates FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Update Media (get project_id via join)
CREATE POLICY "Members can view media" ON public.update_media FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.weekly_updates wu WHERE wu.id = update_id AND public.is_member_of_project(wu.project_id))
);
CREATE POLICY "Writers can insert media" ON public.update_media FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.weekly_updates wu WHERE wu.id = update_id AND public.can_write_project(wu.project_id))
);
CREATE POLICY "Writers can delete media" ON public.update_media FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.weekly_updates wu WHERE wu.id = update_id AND public.can_write_project(wu.project_id))
);
-- Schedule Stages
CREATE POLICY "Members can view stages" ON public.schedule_stages FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create stages" ON public.schedule_stages FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id));
CREATE POLICY "Writers can update stages" ON public.schedule_stages FOR UPDATE TO authenticated USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete stages" ON public.schedule_stages FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Payments
CREATE POLICY "Members can view payments" ON public.payments FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id) AND requested_by = auth.uid());
CREATE POLICY "Writers can update payments" ON public.payments FOR UPDATE TO authenticated USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete payments" ON public.payments FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Extra Budgets
CREATE POLICY "Members can view extras" ON public.extra_budgets FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create extras" ON public.extra_budgets FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id) AND requested_by = auth.uid());
CREATE POLICY "Writers can update extras" ON public.extra_budgets FOR UPDATE TO authenticated USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete extras" ON public.extra_budgets FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Documents
CREATE POLICY "Members can view documents" ON public.documents FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id) AND uploaded_by = auth.uid());
CREATE POLICY "Writers can update documents" ON public.documents FOR UPDATE TO authenticated USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete documents" ON public.documents FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Employees
CREATE POLICY "Members can view employees" ON public.employees FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id));
CREATE POLICY "Writers can update employees" ON public.employees FOR UPDATE TO authenticated USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete employees" ON public.employees FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Daily Attendance
CREATE POLICY "Members can view attendance" ON public.daily_attendance FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create attendance" ON public.daily_attendance FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id));
CREATE POLICY "Writers can update attendance" ON public.daily_attendance FOR UPDATE TO authenticated USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete attendance" ON public.daily_attendance FOR DELETE TO authenticated USING (public.is_project_owner(project_id));
-- Attendance Entries
CREATE POLICY "Members can view entries" ON public.attendance_entries FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.daily_attendance da WHERE da.id = attendance_id AND public.is_member_of_project(da.project_id))
);
CREATE POLICY "Writers can create entries" ON public.attendance_entries FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.daily_attendance da WHERE da.id = attendance_id AND public.can_write_project(da.project_id))
);
CREATE POLICY "Writers can update entries" ON public.attendance_entries FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.daily_attendance da WHERE da.id = attendance_id AND public.can_write_project(da.project_id))
);
CREATE POLICY "Writers can delete entries" ON public.attendance_entries FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.daily_attendance da WHERE da.id = attendance_id AND public.can_write_project(da.project_id))
);
-- Comments
CREATE POLICY "Members can view comments" ON public.comments FOR SELECT TO authenticated USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (public.can_write_project(project_id) AND author_id = auth.uid());
CREATE POLICY "Authors can update comments" ON public.comments FOR UPDATE TO authenticated USING (author_id = auth.uid());
CREATE POLICY "Authors can delete comments" ON public.comments FOR DELETE TO authenticated USING (author_id = auth.uid());
-- =============================================
-- 7. TRIGGER: Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- =============================================
-- 8. STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
-- Storage policies: use folder structure project_id/filename
CREATE POLICY "Members can view photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND public.is_member_of_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Writers can upload photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND public.can_write_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Writers can delete photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND public.can_write_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Members can view videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND public.is_member_of_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Writers can upload videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND public.can_write_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Writers can delete videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'videos' AND public.can_write_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Members can view docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_member_of_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Writers can upload docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.can_write_project((storage.foldername(name))[1]::uuid));
CREATE POLICY "Writers can delete docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.can_write_project((storage.foldername(name))[1]::uuid));
