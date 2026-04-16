import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

export type UpdateStatus = "adiantado" | "no_prazo" | "atrasado";

export type UpdateRow = {
  id: string;
  project_id: string;
  created_by: string;
  date: string;
  week_ref: string;
  summary: string;
  services_completed: string[] | null;
  services_not_completed: string[] | null;
  difficulties: string | null;
  materials_received: string[] | null;
  materials_missing: string[] | null;
  next_week_plan: string | null;
  observations: string | null;
  status: UpdateStatus;
  photos: string[] | null;
  videos: string[] | null;
  stage_id: string | null;
  approved: boolean | null;
  owner_comments: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Hook para buscar os relatórios semanais do projeto.
 */
export function useUpdates() {
  const { project } = useProject();

  const query = useQuery({
    queryKey: ["updates", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<UpdateRow[]> => {
      if (!supabase || !project) return [];

      const { data, error } = await supabase
        .from("weekly_updates")
        .select("*")
        .eq("project_id", project.id)
        .order("date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as UpdateRow[];
    },
  });

  return {
    project,
    updates: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mutation para criar ou atualizar um relatório semanal.
 */
export function useUpsertUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: any) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

      const updatePayload = {
        week_ref: payload.weekRef,
        summary: payload.summary,
        status: payload.status,
        services_completed: payload.servicesCompleted,
        services_not_completed: payload.servicesNotCompleted,
        difficulties: payload.difficulties || null,
        materials_received: payload.materialsReceived,
        materials_missing: payload.materialsMissing,
        next_week_plan: payload.nextWeekPlan || null,
        observations: payload.observations || null,
        photos: payload.photos,
        videos: payload.videos,
        owner_comments: payload.ownerComments || null,
      };

      const query = payload.id
        ? supabase.from("weekly_updates").update(updatePayload).eq("id", payload.id)
        : supabase.from("weekly_updates").insert({ ...updatePayload, project_id: payload.projectId, created_by: payload.userId });

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as UpdateRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.projectId] });
    },
  });
}

/**
 * Hook para o proprietário salvar comentários e aprovar/reprovar o relatório.
 */
export function useUpdateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string; approved: boolean; ownerComments: string | null }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

      const { data, error } = await supabase
        .from("weekly_updates")
        .update({ approved: payload.approved, owner_comments: payload.ownerComments })
        .eq("id", payload.id)
        .select()
        .single();

      if (error) throw error;
      return data as UpdateRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.projectId] });
    },
  });
}

export function useDeleteUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");
      const { error } = await supabase.from("weekly_updates").delete().eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.projectId] });
    },
  });
}

/**
 * Hook legado mantido por compatibilidade.
 * future_fix: Remover e usar useUpdateReview em todas as telas.
 */
export function useToggleApprovedUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string; approved: boolean }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");
      const { data, error } = await supabase.from("weekly_updates").update({ approved: payload.approved }).eq("id", payload.id).select().single();
      if (error) throw error;
      return data as UpdateRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.projectId] });
    },
  });
}
