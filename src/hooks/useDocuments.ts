import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

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
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-documents", variables.projectId] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string; filePath: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { error: storageError } = await supabase.storage.from("project-documents").remove([payload.filePath]);

      if (storageError) {
        throw storageError;
      }

      const { error } = await supabase.from("project_documents").delete().eq("id", payload.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-documents", variables.projectId] });
    },
  });
}

export function useSignedDocumentUrl() {
  return useMutation({
    mutationFn: async (payload: { filePath: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { data, error } = await supabase.storage.from("project-documents").createSignedUrl(payload.filePath, 60);

      if (error) {
        throw error;
      }

      return data.signedUrl;
    },
  });
}
