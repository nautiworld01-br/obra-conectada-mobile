import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { withSchemaDriftContext } from "../lib/schemaDrift";
import { useProject } from "./useProject";

// Tipos que representam a estrutura de dados dos registros diários e da projeção técnica usada na presença.
// future_fix: Avaliar a necessidade de tipos compartilhados em um arquivo centralizado.
export type DailyLogRow = {
  id: string;
  date: string;
  activities: string | null;
  weather: string | null;
  observations: string | null;
  no_work_reason: string | null;
  no_work_note: string | null;
  created_by: string;
  project_id: string;
  room_id: string | null;
  room_ids: string[];
  photos_urls?: string[] | null;
  videos_urls?: string[] | null;
};

export type PresenceEmployeeRow = {
  id: string;
  full_name: string;
  role: string;
  status: "ativo" | "inativo";
};

// Hook principal para gerenciar os diários de obra.
// A presença passa a usar profiles.id como identificador real, com compatibilidade legada no banco.
export function useDailyLogs() {
  const { project, isLoading: isProjectLoading } = useProject();

  // Busca todos os registros do projeto para manter calendario, detalhes e presença consistentes.
  const logsQuery = useQuery({
    queryKey: ["daily_logs", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<(DailyLogRow & { presenceIds: string[] })[]> => {
      if (!supabase || !project) return [];

      const { data, error } = await supabase
        .from("daily_logs")
        .select(`
          id, date, activities, weather, observations, no_work_reason, no_work_note, created_by, project_id, room_id, photos_urls, videos_urls,
          daily_log_employees ( user_id ),
          daily_log_rooms ( room_id )
        `)
        .eq("project_id", project.id)
        .order("date", { ascending: false });

      if (error) throw withSchemaDriftContext(error, "consulta de diarios com room_id e presencas");

      return (data ?? []).map(log => ({
        ...log,
        room_ids: Array.from(
          new Set(
            ((log.daily_log_rooms as { room_id: string | null }[] | null) ?? [])
              .map((item) => item.room_id)
              .filter((value): value is string => Boolean(value))
              .concat(log.room_id ? [log.room_id] : []),
          ),
        ),
        presenceIds: (log.daily_log_employees as any[] || []).map(item => item.user_id).filter(Boolean)
      }));
    },
  });

  // Lista os perfis ativos usados por diário e presença.
  const presenceEmployeesQuery = useQuery({
    queryKey: ["presence_employees", project?.id, "ativo"],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<PresenceEmployeeRow[]> => {
      if (!supabase || !project) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, occupation_role, status")
        .eq("project_id", project.id)
        .eq("is_employee", true)
        .eq("status", "ativo")
        .order("full_name", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((profile) => ({
        id: profile.id,
        full_name: profile.full_name ?? "Sem nome",
        role: profile.occupation_role ?? "",
        status: (profile.status ?? "ativo") as "ativo" | "inativo",
      }));
    },
  });

  useEffect(() => {
    const client = supabase;

    if (!client || !project?.id) {
      return;
    }

    const channel = client
      .channel(`daily-logs:${project.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_logs", filter: `project_id=eq.${project.id}` },
        () => {
          void logsQuery.refetch();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_log_employees" },
        () => {
          void logsQuery.refetch();
          void presenceEmployeesQuery.refetch();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [logsQuery, presenceEmployeesQuery, project?.id]);

  useEffect(() => {
    if (!project?.id) {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void logsQuery.refetch();
        void presenceEmployeesQuery.refetch();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [logsQuery, presenceEmployeesQuery, project?.id]);

  return {
    project,
    logs: logsQuery.data ?? [],
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => undefined,
    presenceEmployees: presenceEmployeesQuery.data ?? [],
    isLoading: isProjectLoading || logsQuery.isLoading || presenceEmployeesQuery.isLoading,
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
        .select("user_id")
        .eq("log_id", logId);

      if (error) {
        throw withSchemaDriftContext(error, "detalhe de presencas do diario");
      }

      return (data ?? []).map((item) => item.user_id).filter(Boolean);
    },
  });
}

// Gerencia a criação ou atualização (upsert) de um log diário e suas presenças relacionadas via RPC transacional.
export function useUpsertDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId: string;
      date: string;
      activities: string;
      weather: string;
      observations: string;
      noWorkReason?: string | null;
      noWorkNote?: string | null;
      createdBy: string;
      userIds: string[];
      roomIds?: string[];
      photosUrls?: string[];
      videosUrls?: string[];
    }) => {
      if (!supabase) {
        throw new Error("Supabase nao configurado.");
      }

      const { data: log, error } = await supabase
        .rpc("upsert_daily_log_with_profiles", {
          p_project_id: payload.projectId,
          p_date: payload.date,
          p_activities: payload.activities,
          p_weather: payload.weather,
          p_observations: payload.observations,
          p_no_work_reason: payload.noWorkReason?.trim() || null,
          p_no_work_note: payload.noWorkNote?.trim() || null,
          p_created_by: payload.createdBy,
          p_user_ids: payload.userIds,
          p_room_ids: payload.roomIds ?? [],
          p_photos_urls: payload.photosUrls?.length ? payload.photosUrls : null,
          p_videos_urls: payload.videosUrls?.length ? payload.videosUrls : null,
        })
        .single();

      if (error) {
        throw withSchemaDriftContext(error, "RPC upsert_daily_log_with_profiles");
      }

      const savedDailyLog = log as DailyLogRow;
      const { data: savedLog } = await supabase
        .from("daily_logs")
        .select("updated_at")
        .eq("id", savedDailyLog.id)
        .maybeSingle();

      if (savedLog?.updated_at) {
        void supabase.functions.invoke("daily-log-updated-push", {
          body: {
            logId: savedDailyLog.id,
            projectId: payload.projectId,
            observedUpdatedAt: savedLog.updated_at,
          },
        });
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
