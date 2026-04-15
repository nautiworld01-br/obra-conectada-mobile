CREATE TABLE IF NOT EXISTS public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('contrato', 'alvara', 'laudo', 'nota_fiscal', 'outro')),
  expires_at DATE NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NULL,
  size_bytes BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS project_documents_project_id_idx ON public.project_documents(project_id);
CREATE INDEX IF NOT EXISTS project_documents_category_idx ON public.project_documents(category);
CREATE INDEX IF NOT EXISTS project_documents_expires_at_idx ON public.project_documents(expires_at);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_documents'
      AND policyname = 'Members can view project documents'
  ) THEN
    CREATE POLICY "Members can view project documents"
    ON public.project_documents FOR SELECT
    TO authenticated
    USING (public.is_member_of_project(project_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_documents'
      AND policyname = 'Owners can insert project documents'
  ) THEN
    CREATE POLICY "Owners can insert project documents"
    ON public.project_documents FOR INSERT
    TO authenticated
    WITH CHECK (public.can_write_project(project_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_documents'
      AND policyname = 'Owners can update project documents'
  ) THEN
    CREATE POLICY "Owners can update project documents"
    ON public.project_documents FOR UPDATE
    TO authenticated
    USING (public.can_write_project(project_id))
    WITH CHECK (public.can_write_project(project_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_documents'
      AND policyname = 'Owners can delete project documents'
  ) THEN
    CREATE POLICY "Owners can delete project documents"
    ON public.project_documents FOR DELETE
    TO authenticated
    USING (public.can_write_project(project_id));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members can view private project documents'
  ) THEN
    CREATE POLICY "Members can view private project documents"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'project-documents'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.is_member_of_project((storage.foldername(name))[1]::uuid)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Owners can upload private project documents'
  ) THEN
    CREATE POLICY "Owners can upload private project documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'project-documents'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Owners can update private project documents'
  ) THEN
    CREATE POLICY "Owners can update private project documents"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'project-documents'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    )
    WITH CHECK (
      bucket_id = 'project-documents'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Owners can delete private project documents'
  ) THEN
    CREATE POLICY "Owners can delete private project documents"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'project-documents'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    );
  END IF;
END $$;
