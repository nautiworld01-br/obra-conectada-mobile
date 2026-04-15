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
  created_at: string;
  updated_at: string;
};

export function useUpdates() {
  const { project } = useProject();

  const query = useQuery({
    queryKey: ["updates", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<UpdateRow[]> => {
      if (!supabase || !project) {
        return [];
      }

      const { data, error } = await supabase
        .from("weekly_updates")
        .select(
          "id, project_id, created_by, date, week_ref, summary, services_completed, services_not_completed, difficulties, materials_received, materials_missing, next_week_plan, observations, status, photos, videos, stage_id, approved, created_at, updated_at",
        )
        .eq("project_id", project.id)
        .order("date", { ascending: false });

      if (error) {
        throw error;
      }

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

export function useUpsertUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      projectId: string;
      userId: string;
      weekRef: string;
      summary: string;
      status: UpdateStatus;
      servicesCompleted: string[];
      servicesNotCompleted: string[];
      difficulties: string;
      materialsReceived: string[];
      materialsMissing: string[];
      nextWeekPlan: string;
      observations: string;
      photos: string[];
      videos: string[];
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

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
      };

      if (payload.id) {
        const { data, error } = await supabase
          .from("weekly_updates")
          .update(updatePayload)
          .eq("id", payload.id)
          .select(
            "id, project_id, created_by, date, week_ref, summary, services_completed, services_not_completed, difficulties, materials_received, materials_missing, next_week_plan, observations, status, photos, videos, stage_id, approved, created_at, updated_at",
          )
          .single();

        if (error) {
          throw error;
        }

        return data as UpdateRow;
      }

      const { data, error } = await supabase
        .from("weekly_updates")
        .insert({
          ...updatePayload,
          project_id: payload.projectId,
          created_by: payload.userId,
        })
        .select(
          "id, project_id, created_by, date, week_ref, summary, services_completed, services_not_completed, difficulties, materials_received, materials_missing, next_week_plan, observations, status, photos, videos, stage_id, approved, created_at, updated_at",
        )
        .single();

      if (error) {
        throw error;
      }

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
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { error } = await supabase.from("weekly_updates").delete().eq("id", payload.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.projectId] });
    },
  });
}

export function useToggleApprovedUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string; approved: boolean }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { data, error } = await supabase
        .from("weekly_updates")
        .update({ approved: payload.approved })
        .eq("id", payload.id)
        .select(
          "id, project_id, created_by, date, week_ref, summary, services_completed, services_not_completed, difficulties, materials_received, materials_missing, next_week_plan, observations, status, photos, videos, stage_id, approved, created_at, updated_at",
        )
        .single();

      if (error) {
        throw error;
      }

      return data as UpdateRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["updates", variables.projectId] });
    },
  });
}
