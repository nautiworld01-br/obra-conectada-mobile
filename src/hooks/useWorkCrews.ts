import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

/**
 * Define a estrutura de um registro de equipe de obra (Empreiteiras/Empresas).
 */
export type WorkCrewRow = {
  id: string;
  project_id: string;
  photo: string | null;
  company_name: string;
  company_contact: string | null;
  responsible_name: string | null;
  responsible_contact: string | null;
  average_workers: number | null;
  contracted_amount: number | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  observations: string | null;
};

export type UpsertWorkCrewPayload = {
  id?: string;
  projectId: string;
  photo: string | null;
  companyName: string;
  companyContact?: string | null;
  responsibleName?: string | null;
  responsibleContact?: string | null;
  averageWorkers?: number | null;
  contractedAmount?: number | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  observations?: string | null;
};

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length ? normalized : null;
}

function normalizeOptionalNumber(value: number | null | undefined, fieldLabel: string) {
  if (value == null) {
    return null;
  }

  if (!Number.isFinite(value)) {
    throw new Error(`${fieldLabel} inválido.`);
  }

  if (value < 0) {
    throw new Error(`${fieldLabel} não pode ser negativo.`);
  }

  return value;
}

function buildWorkCrewPayload(payload: UpsertWorkCrewPayload) {
  const companyName = payload.companyName.trim();
  if (!companyName) {
    throw new Error("Informe o nome da empresa ou equipe.");
  }

  const averageWorkers = normalizeOptionalNumber(payload.averageWorkers, "Média de trabalhadores");
  const contractedAmount = normalizeOptionalNumber(payload.contractedAmount, "Valor contratado");
  const plannedStartDate = normalizeOptionalText(payload.plannedStartDate);
  const plannedEndDate = normalizeOptionalText(payload.plannedEndDate);

  if (plannedStartDate && plannedEndDate && plannedStartDate > plannedEndDate) {
    throw new Error("A data de início previsto não pode ser maior que a data de término previsto.");
  }

  return {
    project_id: payload.projectId,
    photo: normalizeOptionalText(payload.photo),
    company_name: companyName,
    company_contact: normalizeOptionalText(payload.companyContact),
    responsible_name: normalizeOptionalText(payload.responsibleName),
    responsible_contact: normalizeOptionalText(payload.responsibleContact),
    average_workers: averageWorkers != null ? Math.round(averageWorkers) : null,
    contracted_amount: contractedAmount,
    planned_start_date: plannedStartDate,
    planned_end_date: plannedEndDate,
    observations: normalizeOptionalText(payload.observations),
  };
}

/**
 * Hook para listar e monitorar em tempo real as equipes de obra do projeto.
 * future_fix: Adicionar suporte a paginacao se o numero de empreiteiras for muito grande.
 */
export function useWorkCrews() {
  const { project, isLoading: projectLoading } = useProject();
  const queryClient = useQueryClient();

  const crewsQuery = useQuery({
    queryKey: ["work-crews", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<WorkCrewRow[]> => {
      if (!supabase || !project?.id) return [];

      const { data, error } = await supabase
        .from("work_crews")
        .select("id, project_id, photo, company_name, company_contact, responsible_name, responsible_contact, average_workers, contracted_amount, planned_start_date, planned_end_date, observations")
        .eq("project_id", project.id)
        .order("planned_start_date", { ascending: true, nullsFirst: false })
        .order("company_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as WorkCrewRow[];
    },
  });

  // Habilita Realtime para atualizar a lista automaticamente quando houver mudanças no banco.
  useEffect(() => {
    if (!project?.id || !supabase) return;

    const subscription = supabase
      .channel(`work_crews:${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_crews", filter: `project_id=eq.${project.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["work-crews", project.id] });
      })
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [project?.id, queryClient]);

  return {
    project,
    workCrews: crewsQuery.data ?? [],
    isLoading: projectLoading || crewsQuery.isLoading,
  };
}

/**
 * Mutation para criar ou atualizar (upsert) uma equipe de obra.
 * future_fix: Implementar validacao de schema Zod para garantir integridade dos dados numericos.
 */
export function useUpsertWorkCrew() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpsertWorkCrewPayload) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

      const workCrewPayload = buildWorkCrewPayload(payload);

      const query = payload.id 
        ? supabase.from("work_crews").update(workCrewPayload).eq("id", payload.id)
        : supabase.from("work_crews").insert(workCrewPayload);

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as WorkCrewRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work-crews", variables.projectId] });
    },
  });
}

/**
 * Mutation para remover uma equipe de obra do sistema.
 * future_fix: Adicionar soft-delete ou log de exclusao para auditoria.
 */
export function useDeleteWorkCrew() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");
      const { error } = await supabase.from("work_crews").delete().eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work-crews", variables.projectId] });
    },
  });
}
