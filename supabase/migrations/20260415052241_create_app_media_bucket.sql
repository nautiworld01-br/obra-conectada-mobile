INSERT INTO storage.buckets (id, name, public)
VALUES ('app-media', 'app-media', true)
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
      AND policyname = 'Authenticated users can view app media'
  ) THEN
    CREATE POLICY "Authenticated users can view app media"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'app-media'
      AND (
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'users'
          AND (storage.foldername(name))[2]::uuid = auth.uid()
        )
        OR
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'projects'
          AND public.is_member_of_project((storage.foldername(name))[2]::uuid)
        )
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload app media'
  ) THEN
    CREATE POLICY "Authenticated users can upload app media"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'app-media'
      AND (
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'users'
          AND (storage.foldername(name))[2]::uuid = auth.uid()
        )
        OR
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'projects'
          AND public.can_write_project((storage.foldername(name))[2]::uuid)
        )
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update app media'
  ) THEN
    CREATE POLICY "Authenticated users can update app media"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'app-media'
      AND (
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'users'
          AND (storage.foldername(name))[2]::uuid = auth.uid()
        )
        OR
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'projects'
          AND public.can_write_project((storage.foldername(name))[2]::uuid)
        )
      )
    )
    WITH CHECK (
      bucket_id = 'app-media'
      AND (
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'users'
          AND (storage.foldername(name))[2]::uuid = auth.uid()
        )
        OR
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'projects'
          AND public.can_write_project((storage.foldername(name))[2]::uuid)
        )
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete app media'
  ) THEN
    CREATE POLICY "Authenticated users can delete app media"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'app-media'
      AND (
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'users'
          AND (storage.foldername(name))[2]::uuid = auth.uid()
        )
        OR
        (
          COALESCE(array_length(storage.foldername(name), 1), 0) > 1
          AND (storage.foldername(name))[1] = 'projects'
          AND public.can_write_project((storage.foldername(name))[2]::uuid)
        )
      )
    );
  END IF;
END $$;
