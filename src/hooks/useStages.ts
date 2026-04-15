import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

export type StageStatus = "nao_iniciado" | "em_andamento" | "concluido" | "atrasado" | "bloqueado";

export type StageRow = {
  id: string;
  project_id: string;
  name: string;
  category: string | null;
  responsible: string | null;
  planned_start: string | null;
  planned_end: string | null;
  observations: string | null;
  percent_complete: number | null;
  status: StageStatus;
};

export function useStages() {
  const { project, isLoading: isProjectLoading } = useProject();

  const stagesQuery = useQuery({
    queryKey: ["stages", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<StageRow[]> => {
      if (!supabase || !project) {
        return [];
      }

      const { data, error } = await supabase
        .from("schedule_stages")
        .select("id, project_id, name, category, responsible, planned_start, planned_end, observations, percent_complete, status")
        .eq("project_id", project.id)
        .order("planned_start", { ascending: true, nullsFirst: false });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  return {
    project,
    stages: stagesQuery.data ?? [],
    isLoading: isProjectLoading || stagesQuery.isLoading,
  };
}

export function useUpsertStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      projectId: string;
      name: string;
      category: string;
      responsible: string;
      plannedStart: string | null;
      plannedEnd: string | null;
      observations: string;
      status: StageStatus;
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const percentByStatus: Record<StageStatus, number> = {
        nao_iniciado: 0,
        em_andamento: 50,
        concluido: 100,
        atrasado: 0,
        bloqueado: 0,
      };

      const stagePayload = {
        project_id: payload.projectId,
        name: payload.name,
        category: payload.category || null,
        responsible: payload.responsible || null,
        planned_start: payload.plannedStart,
        planned_end: payload.plannedEnd,
        observations: payload.observations || null,
        status: payload.status,
        percent_complete: percentByStatus[payload.status],
      };

      if (payload.id) {
        const { data, error } = await supabase
          .from("schedule_stages")
          .update(stagePayload)
          .eq("id", payload.id)
          .select("id, project_id, name, category, responsible, planned_start, planned_end, observations, percent_complete, status")
          .single();

        if (error) {
          throw error;
        }

        return data;
      }

      const { data, error } = await supabase
        .from("schedule_stages")
        .insert(stagePayload)
        .select("id, project_id, name, category, responsible, planned_start, planned_end, observations, percent_complete, status")
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stages", variables.projectId] });
    },
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { error } = await supabase.from("schedule_stages").delete().eq("id", payload.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stages", variables.projectId] });
    },
  });
}
