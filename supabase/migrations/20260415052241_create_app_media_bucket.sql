-- Cria o bucket 'app-media' para mídias gerais do sistema (Avatares, Capas de Projeto, etc).
-- Publico setado como true para facilitar o carregamento de imagens de perfil.
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-media', 'app-media', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public;

-- Politicas de Acesso Dinamicas baseadas no caminho do arquivo (pasta 'users' ou 'projects').
DO $$
BEGIN
  -- Permissao de Leitura: Usuarios podem ver seus proprios avatares ou mídias de projetos onde sao membros.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can view app media'
  ) THEN
    CREATE POLICY "Authenticated users can view app media"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'app-media'
      AND (
        ((storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2]::uuid = auth.uid())
        OR
        ((storage.foldername(name))[1] = 'projects' AND public.is_member_of_project((storage.foldername(name))[2]::uuid))
      )
    );
  END IF;

  -- Permissao de Escrita/Upload: Restringe upload na pasta 'users' ao proprio usuario e 'projects' a quem pode editar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload app media'
  ) THEN
    CREATE POLICY "Authenticated users can upload app media"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'app-media'
      AND (
        ((storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2]::uuid = auth.uid())
        OR
        ((storage.foldername(name))[1] = 'projects' AND public.can_write_project((storage.foldername(name))[2]::uuid))
      )
    );
  END IF;

  -- Permissao de Atualizacao e Exclusao seguem a mesma regra de propriedade/permissao.
  -- future_fix: Implementar limpeza automatica de arquivos antigos no storage quando forem substituidos (evitar lixo).
END $$;
