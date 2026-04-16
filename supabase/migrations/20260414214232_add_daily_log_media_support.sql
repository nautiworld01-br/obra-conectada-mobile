-- Adiciona suporte a armazenamento de URLs de midia (fotos e videos) na tabela de registros diarios.
-- Armazenado como JSONB para flexibilidade de múltiplos arquivos.
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS photos_urls jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS videos_urls jsonb DEFAULT NULL;

-- Cria o bucket de armazenamento para mídias do diario de obra.
-- Publico setado como true para permitir acesso via URL assinada ou publica simples.
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-logs', 'daily-logs', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- Bloco anonimo para criacao segura de politicas de storage (evita erros de duplicidade).
-- future_fix: Adicionar limite de tamanho de arquivo (file_size_limit) diretamente na criacao do bucket via SQL.
DO $$
BEGIN
  -- Permissao de Leitura: Qualquer membro autenticado do projeto pode ver as midias.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can view daily log media'
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

  -- Permissao de Escrita/Upload: Restrito a quem tem permissao de edicao no projeto.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Writers can upload daily log media'
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

  -- Permissao de Atualizacao: Permite substituir arquivos existentes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Writers can update daily log media'
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

  -- Permissao de Exclusao: Permite remover midias do diario.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Writers can delete daily log media'
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
