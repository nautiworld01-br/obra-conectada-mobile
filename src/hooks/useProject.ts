import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useProfile } from "./useProfile";

// Estrutura de dados que representa um projeto no contexto do aplicativo mobile.
export type MobileProject = {
  id: string;
  name: string;
  address: string | null;
  photo_url: string | null;
  total_contract_value: number | null;
  rooms: string[] | null;
  external_spaces: string[] | null;
  observations: string | null;
  start_date: string | null;
  userRole: string;
};

/**
 * Hook de Projeto (Versao Operacao Interna): 
 * Todos os usuarios logados tem acesso a primeira casa encontrada no banco.
 */
export function useProject() {
  const { user } = useAuth();
  const { isOwner } = useProfile();

  const query = useQuery({
    queryKey: ["project-main"],
    enabled: Boolean(user?.id && supabase),
    queryFn: async (): Promise<MobileProject | null> => {
      if (!supabase || !user) return null;

      // Busca diretamente o primeiro projeto (Casa) cadastrado no sistema
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, name, address, photo_url, total_contract_value, rooms, external_spaces, observations, start_date")
        .limit(1)
        .maybeSingle();

      if (projectError) throw projectError;
      if (!project) return null;

      return {
        ...project,
        userRole: isOwner ? "proprietario" : "funcionario",
      };
    },
  });

  return {
    project: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

// Permite atualizar as informações cadastrais do projeto atual do usuário.
export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: Partial<Omit<MobileProject, "id" | "userRole">>) => {
      if (!supabase || !user) throw new Error("Supabase ou usuario nao configurado.");

      // Primeiro pegamos o ID do projeto vinculado ao usuario
      const { data: membership } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.project_id) throw new Error("Projeto nao encontrado para este usuario.");

      const { data, error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", membership.project_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", user?.id] });
    },
  });
}
