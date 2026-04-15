import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

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

export function useWorkCrews() {
  const { project, isLoading: projectLoading } = useProject();
  const queryClient = useQueryClient();

  const crewsQuery = useQuery({
    queryKey: ["work-crews", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<WorkCrewRow[]> => {
      if (!supabase || !project?.id) {
        return [];
      }

      const { data, error } = await supabase
        .from("work_crews")
        .select(
          "id, project_id, photo, company_name, company_contact, responsible_name, responsible_contact, average_workers, contracted_amount, planned_start_date, planned_end_date, observations",
        )
        .eq("project_id", project.id)
        .order("planned_start_date", { ascending: true, nullsFirst: false })
        .order("company_name", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as WorkCrewRow[];
    },
  });

  useEffect(() => {
    if (!project?.id || !supabase) return;

    const subscription = supabase
      .channel(`work_crews:${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_crews",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["work-crews", project.id] });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [project?.id, queryClient]);

  return {
    project,
    workCrews: crewsQuery.data ?? [],
    isLoading: projectLoading || crewsQuery.isLoading,
  };
}

export function useUpsertWorkCrew() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      projectId: string;
      photo: string | null;
      companyName: string;
      companyContact: string | null;
      responsibleName: string | null;
      responsibleContact: string | null;
      averageWorkers: number | null;
      contractedAmount: number | null;
      plannedStartDate: string | null;
      plannedEndDate: string | null;
      observations: string | null;
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const workCrewPayload = {
        project_id: payload.projectId,
        photo: payload.photo,
        company_name: payload.companyName,
        company_contact: payload.companyContact,
        responsible_name: payload.responsibleName,
        responsible_contact: payload.responsibleContact,
        average_workers: payload.averageWorkers,
        contracted_amount: payload.contractedAmount,
        planned_start_date: payload.plannedStartDate,
        planned_end_date: payload.plannedEndDate,
        observations: payload.observations,
      };

      if (payload.id) {
        const { data, error } = await supabase
          .from("work_crews")
          .update(workCrewPayload)
          .eq("id", payload.id)
          .select(
            "id, project_id, photo, company_name, company_contact, responsible_name, responsible_contact, average_workers, contracted_amount, planned_start_date, planned_end_date, observations",
          )
          .single();

        if (error) {
          throw error;
        }

        return data as WorkCrewRow;
      }

      const { data, error } = await supabase
        .from("work_crews")
        .insert(workCrewPayload)
        .select(
          "id, project_id, photo, company_name, company_contact, responsible_name, responsible_contact, average_workers, contracted_amount, planned_start_date, planned_end_date, observations",
        )
        .single();

      if (error) {
        throw error;
      }

      return data as WorkCrewRow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work-crews", variables.projectId] });
    },
  });
}

export function useDeleteWorkCrew() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { error } = await supabase.from("work_crews").delete().eq("id", payload.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work-crews", variables.projectId] });
    },
  });
}
