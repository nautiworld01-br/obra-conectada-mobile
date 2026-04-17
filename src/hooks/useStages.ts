import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

// Tipos que definem o cronograma e os estados de cada etapa da obra.
// future_fix: Adicionar lógica para cálculo automático de atraso baseado em datas.
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

// Hook para buscar todas as etapas do cronograma vinculadas ao projeto atual.
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

// Gerencia a criação ou atualização de etapas, definindo o progresso inicial por status.
// future_fix: Permitir edição manual do percent_complete independente do status.
export function useUpsertStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      projectId: string;
      name: string;
      category?: string | null;
      responsible?: string | null;
      plannedStart: string | null;
      plannedEnd: string | null;
      observations?: string | null;
      status: StageStatus;
      percentComplete?: number | null;
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      // Se for concluído, força 100%. Caso contrário, usa o valor enviado ou mantém o atual.
      const finalPercent = payload.status === "concluido" ? 100 : (payload.percentComplete ?? 0);

      const stagePayload = {
        project_id: payload.projectId,
        name: payload.name,
        category: payload.category || null,
        responsible: payload.responsible || null,
        planned_start: payload.plannedStart,
        planned_end: payload.plannedEnd,
        observations: payload.observations || null,
        status: payload.status,
        percent_complete: finalPercent,
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

// Remove uma etapa do cronograma e sincroniza a lista de etapas no frontend.
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
