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
  room_id: string | null;
  planned_start: string | null;
  planned_end: string | null;
  observations: string | null;
  percent_complete: number | null;
  status: StageStatus;
  created_at?: string;
};

export type UpsertStagePayload = {
  id?: string;
  projectId: string;
  name: string;
  category?: string | null;
  responsible?: string | null;
  roomId?: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  observations?: string | null;
  status: StageStatus;
  percentComplete?: number | null;
};

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length ? normalized : null;
}

function buildStagePayload(payload: UpsertStagePayload) {
  const name = payload.name.trim();
  if (!name) {
    throw new Error("Informe o nome da etapa.");
  }

  const normalizedPercent = payload.percentComplete ?? 0;
  if (!Number.isFinite(normalizedPercent)) {
    throw new Error("A evolução da etapa é inválida.");
  }

  if (normalizedPercent < 0 || normalizedPercent > 100) {
    throw new Error("A evolução da etapa deve ficar entre 0% e 100%.");
  }

  const plannedStart = normalizeOptionalText(payload.plannedStart);
  const plannedEnd = normalizeOptionalText(payload.plannedEnd);
  if (plannedStart && plannedEnd && plannedStart > plannedEnd) {
    throw new Error("A data de início planejado não pode ser maior que a data de fim planejado.");
  }

  if (payload.status !== "concluido" && normalizedPercent === 100) {
    throw new Error("Use o status Concluído para etapas com 100% de evolução.");
  }

  let finalPercent = normalizedPercent;
  if (payload.status === "concluido") {
    finalPercent = 100;
  }

  if (payload.status === "nao_iniciado") {
    finalPercent = 0;
  }

  return {
    project_id: payload.projectId,
    name,
    category: normalizeOptionalText(payload.category),
    responsible: normalizeOptionalText(payload.responsible),
    room_id: normalizeOptionalText(payload.roomId),
    planned_start: plannedStart,
    planned_end: plannedEnd,
    observations: normalizeOptionalText(payload.observations),
    status: payload.status,
    percent_complete: finalPercent,
  };
}

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
        .select("id, project_id, name, category, responsible, room_id, planned_start, planned_end, observations, percent_complete, status, created_at")
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
    mutationFn: async (payload: UpsertStagePayload) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }
      if (!payload.projectId) {
        throw new Error("Projeto não carregado.");
      }

      const stagePayload = buildStagePayload(payload);

      if (payload.id) {
        const { data, error } = await supabase
          .from("schedule_stages")
          .update(stagePayload)
          .eq("id", payload.id)
          .select("id, project_id, name, category, responsible, room_id, planned_start, planned_end, observations, percent_complete, status, created_at")
          .single();

        if (error) {
          throw error;
        }

        return data;
      }

      const { data, error } = await supabase
        .from("schedule_stages")
        .insert(stagePayload)
        .select("id, project_id, name, category, responsible, room_id, planned_start, planned_end, observations, percent_complete, status, created_at")
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
