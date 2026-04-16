import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

// Definições de cargos e estados para os membros da equipe (funcionários).
// future_fix: Expandir a lista de cargos conforme a demanda de novos projetos.
export type TeamEmployeeRole = "empregada domestica" | "marinheiro";
export type TeamEmployeeStatus = "ativo" | "inativo";

export type TeamEmployeeRow = {
  id: string;
  project_id: string;
  full_name: string;
  role: TeamEmployeeRole;
  photo: string | null;
  status: TeamEmployeeStatus;
};

// Hook para gerenciar a listagem da equipe, incluindo sincronização em tempo real.
// future_fix: Avaliar impacto de performance do Realtime em equipes muito grandes.
export function useTeam() {
  const { project, isLoading: projectLoading } = useProject();
  const queryClient = useQueryClient();

  const employeesQuery = useQuery({
    queryKey: ["employees", project?.id, "all"],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<TeamEmployeeRow[]> => {
      if (!supabase || !project?.id) {
        return [];
      }

      const { data, error } = await supabase
        .from("employees")
        .select("id, project_id, full_name, role, photo, status")
        .eq("project_id", project.id)
        .order("status", { ascending: true })
        .order("full_name", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as TeamEmployeeRow[];
    },
  });

  // Configura a escuta de mudanças (INSERT, UPDATE, DELETE) na tabela de funcionários.
  useEffect(() => {
    if (!project?.id || !supabase) return;

    const subscription = supabase
      .channel(`employees:${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employees",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["employees", project.id] });
          queryClient.invalidateQueries({ queryKey: ["house-employees", project.id] });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [project?.id, queryClient]);

  return {
    project,
    employees: employeesQuery.data ?? [],
    isLoading: projectLoading || employeesQuery.isLoading,
  };
}

// Gerencia a adição ou edição de membros da equipe no banco de dados.
export function useUpsertEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      projectId: string;
      fullName: string;
      role: TeamEmployeeRole;
      photo: string | null;
      status: TeamEmployeeStatus;
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const employeePayload = {
        project_id: payload.projectId,
        full_name: payload.fullName,
        role: payload.role,
        photo: payload.photo,
        status: payload.status,
      };

      if (payload.id) {
        const { data, error } = await supabase
          .from("employees")
          .update(employeePayload)
          .eq("id", payload.id)
          .select("id, project_id, full_name, role, photo, status")
          .single();

        if (error) {
          throw error;
        }

        return data as TeamEmployeeRow;
      }

      const { data, error } = await supabase
        .from("employees")
        .insert(employeePayload)
        .select("id, project_id, full_name, role, photo, status")
        .single();

      if (error) {
        throw error;
      }

      return data as TeamEmployeeRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employees", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["house-employees", variables.projectId] });
    },
  });
}

// Remove um funcionário da base de dados e invalida os caches relacionados.
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { error } = await supabase.from("employees").delete().eq("id", payload.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employees", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["house-employees", variables.projectId] });
    },
  });
}
