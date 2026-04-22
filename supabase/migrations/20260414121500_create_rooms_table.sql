CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_rooms_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Members can view rooms"
ON public.rooms
FOR SELECT
TO authenticated
USING (public.is_member_of_project(project_id));
CREATE POLICY "Writers can create rooms"
ON public.rooms
FOR INSERT
TO authenticated
WITH CHECK (public.can_write_project(project_id));
CREATE POLICY "Writers can update rooms"
ON public.rooms
FOR UPDATE
TO authenticated
USING (public.can_write_project(project_id));
CREATE POLICY "Owners can delete rooms"
ON public.rooms
FOR DELETE
TO authenticated
USING (public.is_project_owner(project_id));
