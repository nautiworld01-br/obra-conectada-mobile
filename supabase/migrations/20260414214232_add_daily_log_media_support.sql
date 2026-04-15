ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS photos_urls jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS videos_urls jsonb DEFAULT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-logs', 'daily-logs', true)
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
      AND policyname = 'Authenticated users can view daily log media'
  ) THEN
    CREATE POLICY "Authenticated users can view daily log media"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'daily-logs'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.is_member_of_project((storage.foldername(name))[1]::uuid)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Writers can upload daily log media'
  ) THEN
    CREATE POLICY "Writers can upload daily log media"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'daily-logs'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Writers can update daily log media'
  ) THEN
    CREATE POLICY "Writers can update daily log media"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'daily-logs'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    )
    WITH CHECK (
      bucket_id = 'daily-logs'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Writers can delete daily log media'
  ) THEN
    CREATE POLICY "Writers can delete daily log media"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'daily-logs'
      AND COALESCE(array_length(storage.foldername(name), 1), 0) > 0
      AND public.can_write_project((storage.foldername(name))[1]::uuid)
    );
  END IF;
END $$;
