import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

export type AttendanceStatus = "presente" | "falta" | "meio_periodo";

export type AttendanceRow = {
  id: string;
  project_id: string;
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  created_at: string;
};

export function usePresence(date: string) {
  const { project } = useProject();

  const query = useQuery({
    queryKey: ["attendance", project?.id, date],
    enabled: Boolean(project?.id && supabase && date),
    queryFn: async (): Promise<AttendanceRow[]> => {
      if (!supabase || !project) return [];

      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("project_id", project.id)
        .eq("date", date);

      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  return {
    attendance: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useUpsertPresence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId: string;
      date: string;
      records: { employee_id: string; status: AttendanceStatus }[];
    }) => {
      if (!supabase) throw new Error("Supabase não configurado.");

      const { error: deleteError } = await supabase
        .from("attendance")
        .delete()
        .eq("project_id", payload.projectId)
        .eq("date", payload.date);

      if (deleteError) throw deleteError;

      if (!payload.records.length) {
        return;
      }

      const insertData = payload.records.map((rec) => ({
        project_id: payload.projectId,
        date: payload.date,
        employee_id: rec.employee_id,
        status: rec.status,
      }));

      const { error: insertError } = await supabase.from("attendance").insert(insertData);

      if (insertError) throw insertError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", variables.projectId, variables.date] });
    },
  });
}

export function useDeletePresenceRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; projectId: string; date: string }) => {
      if (!supabase) throw new Error("Supabase não configurado.");
      const { error } = await supabase.from("attendance").delete().eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", variables.projectId, variables.date] });
    },
  });
}
