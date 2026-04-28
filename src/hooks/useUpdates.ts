import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { withSchemaDriftContext } from "../lib/schemaDrift";
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
  room_id: string | null;
  room_ids: string[];
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
        .select("*, weekly_update_rooms ( room_id )")
        .eq("project_id", project.id)
        .order("date", { ascending: false });

      if (error) throw withSchemaDriftContext(error, "consulta de relatorios com room_ids");
      return ((data ?? []) as (Omit<UpdateRow, "room_ids"> & {
        weekly_update_rooms?: { room_id: string | null }[] | null;
      })[]).map((update) => ({
        ...update,
        room_ids: Array.from(
          new Set(
            ((update.weekly_update_rooms ?? [])
              .map((item) => item.room_id)
              .filter((value): value is string => Boolean(value)))
              .concat(update.room_id ? [update.room_id] : []),
          ),
        ),
      }));
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
        room_ids: payload.roomIds || [],
        owner_comments: payload.ownerComments || null,
      };

      const { data, error } = await supabase
        .rpc("upsert_weekly_update_with_rooms", {
          p_id: payload.id ?? null,
          p_project_id: payload.projectId,
          p_user_id: payload.userId,
          p_week_ref: updatePayload.week_ref,
          p_summary: updatePayload.summary,
          p_status: updatePayload.status,
          p_services_completed: updatePayload.services_completed,
          p_services_not_completed: updatePayload.services_not_completed,
          p_difficulties: updatePayload.difficulties,
          p_materials_received: updatePayload.materials_received,
          p_materials_missing: updatePayload.materials_missing,
          p_next_week_plan: updatePayload.next_week_plan,
          p_observations: updatePayload.observations,
          p_photos: updatePayload.photos,
          p_videos: updatePayload.videos,
          p_room_ids: updatePayload.room_ids,
          p_owner_comments: updatePayload.owner_comments,
        })
        .single();

      if (error) throw withSchemaDriftContext(error, "RPC upsert_weekly_update_with_rooms");

      const saved = data as Omit<UpdateRow, "room_ids">;
      return {
        ...saved,
        room_ids: Array.isArray(payload.roomIds) ? payload.roomIds.filter(Boolean) : [],
      } as UpdateRow;
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

/**
 * Hook para sugerir resumo automático baseado em logs e cronograma.
 */
export function useSuggestSummary() {
  return useMutation({
    mutationFn: async (payload: { projectId: string; weekStart: string; weekEnd: string }) => {
      if (!supabase) throw new Error("Supabase nao configurado.");

      const { data, error } = await supabase.rpc("suggest_weekly_summary", {
        p_project_id: payload.projectId,
        p_week_start: payload.weekStart,
        p_week_end: payload.weekEnd,
      });

      if (error) throw error;
      return data as string;
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
