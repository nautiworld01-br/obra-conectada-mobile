import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

// Tipos que representam a estrutura de dados dos registros diários e funcionários.
// future_fix: Avaliar a necessidade de tipos compartilhados em um arquivo centralizado.
export type DailyLogRow = {
  id: string;
  date: string;
  activities: string | null;
  weather: string | null;
  observations: string | null;
  created_by: string;
  project_id: string;
  photos_urls?: string[] | null;
  videos_urls?: string[] | null;
};

export type EmployeeRow = {
  id: string;
  full_name: string;
  role: string;
  status: "ativo" | "inativo";
};

// Hook principal para gerenciar os diários de obra, consolidando logs e funcionários.
export function useDailyLogs() {
  const { project, isLoading: isProjectLoading } = useProject();

  // Busca todos os logs diários vinculados ao projeto atual, incluindo IDs de presença.
  const logsQuery = useQuery({
    queryKey: ["daily_logs", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<(DailyLogRow & { presenceIds: string[] })[]> => {
      if (!supabase || !project) {
        return [];
      }

      // Consulta os logs e faz o join com os IDs dos funcionarios presentes
      const { data, error } = await supabase
        .from("daily_logs")
        .select(`
          id, date, activities, weather, observations, created_by, project_id, photos_urls, videos_urls,
          daily_log_employees ( employee_id )
        `)
        .eq("project_id", project.id)
        .order("date", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []).map(log => ({
        ...log,
        presenceIds: (log.daily_log_employees as any[] || []).map(item => item.employee_id)
      }));
    },
  });

  // Lista os funcionários ativos vinculados ao projeto para marcação de presença no log.
  const employeesQuery = useQuery({
    queryKey: ["employees", project?.id, "ativo"],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<EmployeeRow[]> => {
      if (!supabase || !project) {
        return [];
      }

      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, role, status")
        .eq("project_id", project.id)
        .eq("status", "ativo")
        .order("full_name", { ascending: true });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  return {
    project,
    logs: logsQuery.data ?? [],
    employees: employeesQuery.data ?? [],
    isLoading: isProjectLoading || logsQuery.isLoading || employeesQuery.isLoading,
  };
}

// Busca detalhada dos funcionários associados a um registro diário específico.
// future_fix: Considerar cache compartilhado para evitar múltiplas requisições.
export function useDailyLogDetail(logId: string | null) {
  return useQuery({
    queryKey: ["daily_log_employees", logId],
    enabled: Boolean(logId && supabase),
    queryFn: async (): Promise<string[]> => {
      if (!supabase || !logId) {
        return [];
      }

      const { data, error } = await supabase
        .from("daily_log_employees")
        .select("employee_id")
        .eq("log_id", logId);

      if (error) {
        throw error;
      }

      return (data ?? []).map((item) => item.employee_id);
    },
  });
}

// Gerencia a criação ou atualização (upsert) de um log diário e suas presenças relacionadas.
// future_fix: Transacionalidade do upsert e delete/insert de presenças deve ser garantida via RPC se possível.
export function useUpsertDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId: string;
      date: string;
      activities: string;
      weather: string;
      observations: string;
      createdBy: string;
      employeeIds: string[];
      photosUrls?: string[];
      videosUrls?: string[];
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { data: log, error: logError } = await supabase
        .from("daily_logs")
        .upsert(
          {
            project_id: payload.projectId,
            date: payload.date,
            activities: payload.activities,
            weather: payload.weather,
            observations: payload.observations,
            created_by: payload.createdBy,
            photos_urls: payload.photosUrls?.length ? payload.photosUrls : null,
            videos_urls: payload.videosUrls?.length ? payload.videosUrls : null,
          },
          { onConflict: "project_id,date" },
        )
        .select("id, date, activities, weather, observations, created_by, project_id, photos_urls, videos_urls")
        .single();

      if (logError) {
        throw logError;
      }

      const { error: deleteError } = await supabase.from("daily_log_employees").delete().eq("log_id", log.id);

      if (deleteError) {
        throw deleteError;
      }

      if (payload.employeeIds.length > 0) {
        const { error: insertEmployeesError } = await supabase
          .from("daily_log_employees")
          .insert(payload.employeeIds.map((employeeId) => ({ log_id: log.id, employee_id: employeeId })));

        if (insertEmployeesError) {
          throw insertEmployeesError;
        }
      }

      return log;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["daily_logs", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_employees"] });
    },
  });
}

// Remove um log diário específico e invalida as queries relacionadas para atualizar a UI.
export function useDeleteDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { projectId: string; logId: string }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { error } = await supabase.from("daily_logs").delete().eq("id", payload.logId);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["daily_logs", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_employees"] });
    },
  });
}
