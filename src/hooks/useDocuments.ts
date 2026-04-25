import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

// Tipos que definem a estrutura e categorização de documentos de um projeto.
export type DocumentCategory = "contrato" | "alvara" | "laudo" | "nota_fiscal" | "outro";

export type ProjectDocumentRow = {
  id: string;
  project_id: string;
  created_by: string;
  title: string;
  category: DocumentCategory;
  expires_at: string | null;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_DOCUMENTS: ProjectDocumentRow[] = [];
const SIGNED_URL_TTL_SECONDS = 60;
const SIGNED_URL_CACHE_BUFFER_MS = 10_000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const DOCUMENTS_BUCKET = "project-documents";

async function removeDocumentFile(filePath: string) {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
  if (error) {
    throw error;
  }
}

// Hook para buscar e listar todos os documentos vinculados ao projeto atual.
export function useDocuments() {
  const { project } = useProject();

  const query = useQuery({
    queryKey: ["project-documents", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<ProjectDocumentRow[]> => {
      if (!supabase || !project?.id) {
        return EMPTY_DOCUMENTS;
      }

      const { data, error } = await supabase
        .from("project_documents")
        .select("id, project_id, created_by, title, category, expires_at, file_name, file_path, mime_type, size_bytes, created_at, updated_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? EMPTY_DOCUMENTS) as ProjectDocumentRow[];
    },
  });

  return {
    project,
    documents: query.data ?? EMPTY_DOCUMENTS,
    isLoading: query.isLoading,
    error: query.error,
  };
}

// Registra um novo documento no banco de dados após o upload físico do arquivo.
// Se o insert falhar, tenta remover o arquivo recém-enviado para evitar órfãos.
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId: string;
      userId: string;
      title: string;
      category: DocumentCategory;
      expiresAt: string | null;
      fileName: string;
      filePath: string;
      mimeType: string | null;
      sizeBytes: number | null;
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      try {
        const { data, error } = await supabase
          .from("project_documents")
          .insert({
            project_id: payload.projectId,
            created_by: payload.userId,
            title: payload.title,
            category: payload.category,
            expires_at: payload.expiresAt,
            file_name: payload.fileName,
            file_path: payload.filePath,
            mime_type: payload.mimeType,
            size_bytes: payload.sizeBytes,
          })
          .select("id, project_id, created_by, title, category, expires_at, file_name, file_path, mime_type, size_bytes, created_at, updated_at")
          .single();

        if (error) {
          throw error;
        }

        return data as ProjectDocumentRow;
      } catch (error) {
        try {
          await removeDocumentFile(payload.filePath);
        } catch {
          throw new Error("Falha ao salvar o documento no banco e ao limpar o arquivo enviado no Storage.");
        }

        throw error;
      }
    },
    onSuccess: (_, variables) => {
      signedUrlCache.delete(variables.filePath);
      queryClient.invalidateQueries({ queryKey: ["project-documents", variables.projectId] });
    },
  });
}

// Remove o documento de forma consistente: apaga o registro, remove o arquivo e
// restaura o registro caso a exclusão física falhe.
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { document: ProjectDocumentRow }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { data: deletedDocument, error: deleteError } = await supabase
        .from("project_documents")
        .delete()
        .eq("id", payload.document.id)
        .select("id, project_id, created_by, title, category, expires_at, file_name, file_path, mime_type, size_bytes, created_at, updated_at")
        .single();

      if (deleteError) {
        throw deleteError;
      }

      try {
        await removeDocumentFile(payload.document.file_path);
      } catch (storageError) {
        const { error: rollbackError } = await supabase.from("project_documents").insert(deletedDocument);

        if (rollbackError) {
          throw new Error("Falha ao excluir o arquivo do Storage e ao restaurar o registro do documento.");
        }

        throw storageError;
      }

      return deletedDocument as ProjectDocumentRow;
    },
    onSuccess: (_, variables) => {
      signedUrlCache.delete(variables.document.file_path);
      queryClient.invalidateQueries({ queryKey: ["project-documents", variables.document.project_id] });
    },
  });
}

// Gera uma URL temporária assinada para visualização segura de documentos privados.
export function useSignedDocumentUrl() {
  return useMutation({
    mutationFn: async (payload: { filePath: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const cached = signedUrlCache.get(payload.filePath);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
      }

      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(payload.filePath, SIGNED_URL_TTL_SECONDS);

      if (error) {
        throw error;
      }

      const signedUrl = data.signedUrl;
      signedUrlCache.set(payload.filePath, {
        url: signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_CACHE_BUFFER_MS,
      });

      return signedUrl;
    },
  });
}
