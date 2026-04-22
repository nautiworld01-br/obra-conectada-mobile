import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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

// Hook principal para gerenciar os diários de obra, consolidando logs e funcionários com Paginação.
export function useDailyLogs() {
  const { project, isLoading: isProjectLoading } = useProject();

  // Busca logs diários com suporte a rolagem infinita (10 por página).
  const logsQuery = useInfiniteQuery({
    queryKey: ["daily_logs", project?.id],
    enabled: Boolean(project?.id && supabase),
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }): Promise<(DailyLogRow & { presenceIds: string[] })[]> => {
      if (!supabase || !project) return [];

      const pageSize = 10;
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("daily_logs")
        .select(`
          id, date, activities, weather, observations, created_by, project_id, photos_urls, videos_urls,
          daily_log_employees ( employee_id )
        `)
        .eq("project_id", project.id)
        .order("date", { ascending: false })
        .range(from, to);

      if (error) throw error;

      return (data ?? []).map(log => ({
        ...log,
        presenceIds: (log.daily_log_employees as any[] || []).map(item => item.employee_id)
      }));
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 10 ? allPages.length : undefined;
    }
  });

  // Lista os funcionários ativos vinculados ao projeto.
  const employeesQuery = useQuery({
    queryKey: ["employees", project?.id, "ativo"],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<EmployeeRow[]> => {
      if (!supabase || !project) return [];

      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, role, status")
        .eq("project_id", project.id)
        .eq("status", "ativo")
        .order("full_name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const flatLogs = useMemo(() => logsQuery.data?.pages.flat() ?? [], [logsQuery.data]);

  return {
    project,
    logs: flatLogs,
    hasNextPage: logsQuery.hasNextPage,
    isFetchingNextPage: logsQuery.isFetchingNextPage,
    fetchNextPage: logsQuery.fetchNextPage,
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

      const { data: log, error } = await supabase
        .rpc("upsert_daily_log_with_employees", {
          p_project_id: payload.projectId,
          p_date: payload.date,
          p_activities: payload.activities,
          p_weather: payload.weather,
          p_observations: payload.observations,
          p_created_by: payload.createdBy,
          p_employee_ids: payload.employeeIds,
          p_photos_urls: payload.photosUrls?.length ? payload.photosUrls : null,
          p_videos_urls: payload.videosUrls?.length ? payload.videosUrls : null,
        })
        .single();

      if (error) {
        throw error;
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
