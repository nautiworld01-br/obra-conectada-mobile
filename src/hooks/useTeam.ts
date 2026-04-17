import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

// Definições de cargos e estados para os membros da equipe (funcionários).
export type TeamEmployeeRole = "empregada domestica" | "marinheiro" | string;
export type TeamEmployeeStatus = "ativo" | "inativo";

export type TeamEmployeeRow = {
  id: string;
  full_name: string;
  role: TeamEmployeeRole;
  photo: string | null;
  status: TeamEmployeeStatus;
  is_owner: boolean;
};

/**
 * Hook para gerenciar a listagem da equipe de contas reais (profiles).
 */
export function useTeam() {
  const { project, isLoading: projectLoading } = useProject();
  const queryClient = useQueryClient();

  const employeesQuery = useQuery({
    queryKey: ["employees", "all"],
    enabled: Boolean(supabase),
    queryFn: async (): Promise<TeamEmployeeRow[]> => {
      if (!supabase) return [];

      console.log("Buscando funcionarios (is_owner = false)...");
      // Busca todos os perfis que nao sao proprietarios no sistema
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, is_owner, is_employee, status, occupation_role")
        .eq("is_owner", false)
        .order("full_name", { ascending: true });

      if (error) {
        console.error("Erro Supabase Equipe:", error);
        throw error;
      }
      
      console.log("Funcionarios encontrados:", data?.length);
      return (data ?? []).map(p => ({
        id: p.id,
        full_name: p.full_name,
        photo: p.avatar_url,
        role: p.occupation_role || "Funcionário",
        status: (p.status as TeamEmployeeStatus) || "ativo",
        is_owner: p.is_owner
      })) as TeamEmployeeRow[];
    },
  });

  return {
    project,
    employees: employeesQuery.data ?? [],
    isLoading: projectLoading || employeesQuery.isLoading,
  };
}

/**
 * Mutation para atualizar metadados de gestao do perfil (Status e Cargo).
 */
export function useUpsertEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      fullName: string;
      role: string;
      photo: string | null;
      status: TeamEmployeeStatus;
    }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

      console.log("Tentando atualizar perfil:", payload.id);
      const { data, error } = await supabase
        .from("profiles")
        .update({
          full_name: payload.fullName,
          occupation_role: payload.role,
          avatar_url: payload.photo,
          status: payload.status,
        })
        .eq("id", payload.id)
        .select()
        .single();

      if (error) {
        console.error("Erro Supabase Update Profile:", error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

/**
 * Remove a conta do usuario (Perfil) do sistema.
 */
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

      // Chama a RPC para deletar o registro do banco
      const { error } = await supabase.rpc("delete_user_account", {
        p_user_id: payload.id
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
