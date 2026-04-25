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
  const { profile, isOwner, isEmployee, isLoading: profileLoading } = useProfile();

  const query = useQuery({
    queryKey: ["project-main", user?.id, profile?.project_id, isOwner, isEmployee],
    enabled: Boolean(user?.id && supabase && profile?.project_id),
    queryFn: async (): Promise<MobileProject | null> => {
      if (!supabase || !user || !profile?.project_id) return null;

      // Busca o projeto vinculado ao usuario logado.
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, name, address, photo_url, total_contract_value, external_spaces, observations, start_date")
        .eq("id", profile.project_id)
        .maybeSingle();

      if (projectError) throw projectError;
      if (!project) return null;

      return {
        ...project,
        userRole: isOwner ? "proprietario" : isEmployee ? "funcionario" : "sem_permissao",
      };
    },
  });

  return {
    project: query.data ?? null,
    isLoading: profileLoading || query.isLoading,
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("project_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.project_id) throw new Error("Projeto nao encontrado para este usuario.");

      const { data, error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", profile.project_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-main", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}
