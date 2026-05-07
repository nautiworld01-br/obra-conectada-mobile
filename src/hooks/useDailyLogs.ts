import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
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
  service_items: DailyLogServiceItemRow[];
  photos_urls?: string[] | null;
  videos_urls?: string[] | null;
};

export type DailyLogSummaryRow = Omit<DailyLogRow, "photos_urls" | "videos_urls"> & {
  presenceIds: string[];
};

export type DailyLogDetailRow = DailyLogRow & {
  presenceIds: string[];
};

export type DailyLogServiceItemRow = {
  id: string;
  log_id: string;
  room_id: string;
  description: string;
  status: "pendente" | "em_andamento" | "concluido";
  order_index: number;
  photos_urls?: string[] | null;
  videos_urls?: string[] | null;
};

export type PresenceEmployeeRow = {
  id: string;
  full_name: string;
  role: string;
  status: "ativo" | "inativo";
};

type UseDailyLogsOptions = {
  includePresenceIds?: boolean;
  includePresenceEmployees?: boolean;
  includeServiceItems?: boolean;
  includeRoomIds?: boolean;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
};

type DailyLogListBaseRow = {
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
};

type DailyLogEmployeeLinkRow = {
  log_id: string;
  user_id: string | null;
};

type DailyLogRoomLinkRow = {
  log_id: string;
  room_id: string | null;
};

type DailyLogsPage = {
  logs: DailyLogSummaryRow[];
  nextCursor: string | null;
};

async function requireAuthenticatedUser() {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Sua sessão expirou ou está inválida. Entre novamente.");
  }

  return data.user;
}

function groupByLogId<Row extends { log_id: string }>(rows: Row[] | null) {
  return (rows ?? []).reduce<Record<string, Row[]>>((acc, row) => {
    if (!acc[row.log_id]) {
      acc[row.log_id] = [];
    }

    acc[row.log_id].push(row);
    return acc;
  }, {});
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
}

function normalizeDailyLogServiceItems(
  items: Array<
    Partial<DailyLogServiceItemRow> & {
      room_id?: string | null;
      description?: string | null;
      photos_urls?: unknown;
      videos_urls?: unknown;
    }
  > | null,
) {
  return (items ?? [])
    .filter((item) => Boolean(item.room_id) && Boolean(item.description))
    .map((item, index) => ({
      id: item.id ?? `service-item-${index}`,
      log_id: item.log_id ?? "",
      room_id: item.room_id as string,
      description: item.description as string,
      status: item.status ?? "em_andamento",
      order_index: item.order_index ?? 0,
      photos_urls: normalizeStringArray(item.photos_urls),
      videos_urls: normalizeStringArray(item.videos_urls),
    }))
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

async function hydrateDailyLogsPage(params: {
  projectId: string;
  includePresenceIds: boolean;
  includeServiceItems: boolean;
  includeRoomIds: boolean;
  pageSize?: number;
  cursorDate?: string | null;
  dateFrom?: string;
  dateTo?: string;
}) {
  if (!supabase) {
    return { logs: [], nextCursor: null } satisfies DailyLogsPage;
  }

  let baseQuery = supabase
    .from("daily_logs")
    .select("id, date, activities, weather, observations, no_work_reason, no_work_note, created_by, project_id, room_id")
    .eq("project_id", params.projectId)
    .order("date", { ascending: false });

  if (params.dateFrom) {
    baseQuery = baseQuery.gte("date", params.dateFrom);
  }

  if (params.dateTo) {
    baseQuery = baseQuery.lte("date", params.dateTo);
  }

  if (params.cursorDate) {
    baseQuery = baseQuery.lt("date", params.cursorDate);
  }

  if (params.pageSize) {
    baseQuery = baseQuery.limit(params.pageSize);
  }

  const { data: logsData, error: logsError } = await baseQuery;

  if (logsError) {
    throw withSchemaDriftContext(logsError, "consulta base de diarios");
  }

  const logs = (logsData ?? []) as DailyLogListBaseRow[];
  if (!logs.length) {
    return { logs: [], nextCursor: null } satisfies DailyLogsPage;
  }

  const logIds = logs.map((log) => log.id);

  const roomLinksPromise = params.includeRoomIds
    ? supabase
        .from("daily_log_rooms")
        .select("log_id, room_id")
        .in("log_id", logIds)
    : Promise.resolve({ data: [] as DailyLogRoomLinkRow[], error: null });
  const serviceItemsPromise = params.includeServiceItems
    ? supabase
        .from("daily_log_service_items")
        .select("id, log_id, room_id, description, status, order_index")
        .in("log_id", logIds)
        .order("order_index", { ascending: true })
    : Promise.resolve({ data: [] as DailyLogServiceItemRow[], error: null });
  const employeeLinksPromise = params.includePresenceIds
    ? supabase
        .from("daily_log_employees")
        .select("log_id, user_id")
        .in("log_id", logIds)
    : Promise.resolve({ data: [] as DailyLogEmployeeLinkRow[], error: null });

  const [
    { data: roomLinks, error: roomLinksError },
    { data: serviceItems, error: serviceItemsError },
    { data: employeeLinks, error: employeeLinksError },
  ] = await Promise.all([
    roomLinksPromise,
    serviceItemsPromise,
    employeeLinksPromise,
  ]);

  if (roomLinksError) {
    throw withSchemaDriftContext(roomLinksError, "consulta de comodos dos diarios");
  }

  if (serviceItemsError) {
    throw withSchemaDriftContext(serviceItemsError, "consulta de frentes dos diarios");
  }

  if (employeeLinksError) {
    throw withSchemaDriftContext(employeeLinksError, "consulta de presencas dos diarios");
  }

  const employeeLinksByLogId = groupByLogId((employeeLinks ?? []) as DailyLogEmployeeLinkRow[]);
  const roomLinksByLogId = groupByLogId((roomLinks ?? []) as DailyLogRoomLinkRow[]);
  const serviceItemsByLogId = groupByLogId((serviceItems ?? []) as DailyLogServiceItemRow[]);

  return {
    logs: logs.map((log) => ({
      ...log,
      room_ids: Array.from(
        new Set(
          params.includeRoomIds
            ? ((roomLinksByLogId[log.id] ?? []) as DailyLogRoomLinkRow[])
                .map((item) => item.room_id)
                .filter((value): value is string => Boolean(value))
                .concat(log.room_id ? [log.room_id] : [])
            : [],
        ),
      ),
      service_items: normalizeDailyLogServiceItems(
        params.includeServiceItems ? serviceItemsByLogId[log.id] ?? null : null,
      ),
      presenceIds: params.includePresenceIds
        ? ((employeeLinksByLogId[log.id] ?? []) as DailyLogEmployeeLinkRow[])
            .map((item) => item.user_id)
            .filter((value): value is string => Boolean(value))
        : [],
    })),
    nextCursor: params.pageSize && logs.length === params.pageSize ? logs[logs.length - 1]?.date ?? null : null,
  } satisfies DailyLogsPage;
}

// Hook principal para gerenciar os diários de obra.
// A presença passa a usar profiles.id como identificador real, com compatibilidade legada no banco.
export function useDailyLogs(options?: UseDailyLogsOptions) {
  const { project, isLoading: isProjectLoading } = useProject();
  const includePresenceIds = options?.includePresenceIds ?? true;
  const includePresenceEmployees = options?.includePresenceEmployees ?? true;
  const includeServiceItems = options?.includeServiceItems ?? true;
  const includeRoomIds = options?.includeRoomIds ?? true;
  const pageSize = options?.pageSize;
  const dateFrom = options?.dateFrom;
  const dateTo = options?.dateTo;
  const usePagination = Boolean(pageSize && pageSize > 0);

  // Busca a lista de diarios em consultas simples e paralelas para evitar joins JSON pesados do PostgREST.
  const logsQuery = useQuery({
    queryKey: [
      "daily_logs",
      project?.id,
      includePresenceIds ? "with-presence" : "without-presence",
      includeServiceItems ? "with-service-items" : "without-service-items",
      includeRoomIds ? "with-room-ids" : "without-room-ids",
      dateFrom ?? "from-start",
      dateTo ?? "to-end",
    ],
    queryFn: async (): Promise<DailyLogSummaryRow[]> => {
      if (!project) return [];

      const page = await hydrateDailyLogsPage({
        projectId: project.id,
        includePresenceIds,
        includeServiceItems,
        includeRoomIds,
        dateFrom,
        dateTo,
      });

      return page.logs;
    },
    enabled: Boolean(!usePagination && project?.id && supabase),
  });

  const paginatedLogsQuery = useInfiniteQuery({
    queryKey: [
      "daily_logs",
      project?.id,
      includePresenceIds ? "with-presence" : "without-presence",
      includeServiceItems ? "with-service-items" : "without-service-items",
      includeRoomIds ? "with-room-ids" : "without-room-ids",
      dateFrom ?? "from-start",
      dateTo ?? "to-end",
      "page-size",
      pageSize ?? "all",
    ],
    enabled: Boolean(usePagination && project?.id && supabase),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<DailyLogsPage> => {
      if (!project) {
        return { logs: [], nextCursor: null };
      }

      return hydrateDailyLogsPage({
        projectId: project.id,
        includePresenceIds,
        includeServiceItems,
        includeRoomIds,
        pageSize,
        cursorDate: pageParam,
        dateFrom,
        dateTo,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Lista os perfis ativos usados por diário e presença.
  const presenceEmployeesQuery = useQuery({
    queryKey: ["presence_employees", project?.id, "ativo"],
    enabled: Boolean(includePresenceEmployees && project?.id && supabase),
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
          if (usePagination) {
            void paginatedLogsQuery.refetch();
          } else {
            void logsQuery.refetch();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_log_employees" },
        () => {
          if (includePresenceIds) {
            if (usePagination) {
              void paginatedLogsQuery.refetch();
            } else {
              void logsQuery.refetch();
            }
          }
          if (includePresenceEmployees) {
            void presenceEmployeesQuery.refetch();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_log_service_items" },
        () => {
          if (includeServiceItems) {
            if (usePagination) {
              void paginatedLogsQuery.refetch();
            } else {
              void logsQuery.refetch();
            }
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [includePresenceEmployees, includePresenceIds, includeServiceItems, logsQuery, paginatedLogsQuery, presenceEmployeesQuery, project?.id, usePagination]);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    if (!project?.id) {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (usePagination) {
          void paginatedLogsQuery.refetch();
        } else {
          void logsQuery.refetch();
        }
        if (includePresenceEmployees) {
          void presenceEmployeesQuery.refetch();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [includePresenceEmployees, logsQuery, paginatedLogsQuery, presenceEmployeesQuery, project?.id, usePagination]);

  const logs = usePagination
    ? (paginatedLogsQuery.data?.pages.flatMap((page) => page.logs) ?? [])
    : (logsQuery.data ?? []);
  const oldestLoadedDate = logs[logs.length - 1]?.date ?? null;

  return {
    project,
    logs,
    hasNextPage: usePagination ? Boolean(paginatedLogsQuery.hasNextPage) : false,
    isFetchingNextPage: usePagination ? paginatedLogsQuery.isFetchingNextPage : false,
    fetchNextPage: usePagination ? paginatedLogsQuery.fetchNextPage : async () => undefined,
    oldestLoadedDate,
    presenceEmployees: includePresenceEmployees ? (presenceEmployeesQuery.data ?? []) : [],
    isLoading:
      isProjectLoading ||
      (usePagination ? paginatedLogsQuery.isLoading : logsQuery.isLoading) ||
      (includePresenceEmployees && presenceEmployeesQuery.isLoading),
  };
}

// Busca detalhada dos funcionários associados a um registro diário específico.
export function useDailyLogDetail(logId: string | null) {
  return useQuery({
    queryKey: ["daily_log_detail", logId],
    enabled: Boolean(logId && supabase),
    queryFn: async (): Promise<DailyLogDetailRow | null> => {
      if (!supabase || !logId) {
        return null;
      }

      const { data, error } = await supabase
        .from("daily_logs")
        .select(`
          id, date, activities, weather, observations, no_work_reason, no_work_note, created_by, project_id, room_id, photos_urls, videos_urls,
          daily_log_employees ( user_id ),
          daily_log_rooms ( room_id ),
          daily_log_service_items ( id, log_id, room_id, description, status, order_index, photos_urls, videos_urls )
        `)
        .eq("id", logId)
        .maybeSingle();

      if (error) {
        throw withSchemaDriftContext(error, "detalhe completo do diario");
      }

      if (!data) {
        return null;
      }

      return {
        ...data,
        room_ids: Array.from(
          new Set(
            ((data.daily_log_rooms as { room_id: string | null }[] | null) ?? [])
              .map((item) => item.room_id)
              .filter((value): value is string => Boolean(value))
              .concat(data.room_id ? [data.room_id] : []),
          ),
        ),
        service_items: normalizeDailyLogServiceItems(
          (data.daily_log_service_items as Array<Partial<DailyLogServiceItemRow>> | null) ?? null,
        ),
        presenceIds: ((data.daily_log_employees as { user_id: string | null }[] | null) ?? [])
          .map((item) => item.user_id)
          .filter((value): value is string => Boolean(value)),
      };
    },
  });
}

export function useDailyLogMonthMedia(projectId: string | null | undefined, monthStart: string, monthEnd: string) {
  return useQuery({
    queryKey: ["daily_log_month_media", projectId, monthStart, monthEnd],
    enabled: Boolean(projectId && supabase),
    queryFn: async (): Promise<Record<string, boolean>> => {
      if (!supabase || !projectId) {
        return {};
      }

      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, photos_urls, videos_urls, daily_log_service_items ( photos_urls, videos_urls )")
        .eq("project_id", projectId)
        .gte("date", monthStart)
        .lte("date", monthEnd);

      if (error) {
        throw withSchemaDriftContext(error, "flags de midia do mes");
      }

      return (data ?? []).reduce<Record<string, boolean>>((acc, log) => {
        const hasGeneralMedia = Boolean((log.photos_urls?.length ?? 0) || (log.videos_urls?.length ?? 0));
        const hasServiceItemMedia = ((log.daily_log_service_items as { photos_urls?: string[] | null; videos_urls?: string[] | null }[] | null) ?? [])
          .some((item) => Boolean((item.photos_urls?.length ?? 0) || (item.videos_urls?.length ?? 0)));

        acc[log.id] = hasGeneralMedia || hasServiceItemMedia;
        return acc;
      }, {});
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
      serviceItems?: {
        roomId: string;
        description: string;
        status: "pendente" | "em_andamento" | "concluido";
        photosUrls?: string[];
        videosUrls?: string[];
      }[];
      photosUrls?: string[];
      videosUrls?: string[];
    }) => {
      const currentUser = await requireAuthenticatedUser();
      const client = supabase;
      if (!client) {
        throw new Error("Supabase nao configurado.");
      }

      const { data: log, error } = await client
        .rpc("upsert_daily_log_with_profiles", {
          p_project_id: payload.projectId,
          p_date: payload.date,
          p_activities: payload.activities,
          p_weather: payload.weather,
          p_observations: payload.observations,
          p_no_work_reason: payload.noWorkReason?.trim() || null,
          p_no_work_note: payload.noWorkNote?.trim() || null,
          p_created_by: currentUser.id,
          p_user_ids: payload.userIds,
          p_room_ids: payload.roomIds ?? [],
          p_service_items: payload.serviceItems?.length
            ? payload.serviceItems.map((item) => ({
                room_id: item.roomId,
                description: item.description,
                status: item.status,
                photos_urls: item.photosUrls?.length ? item.photosUrls : null,
                videos_urls: item.videosUrls?.length ? item.videosUrls : null,
              }))
            : [],
          p_photos_urls: payload.photosUrls?.length ? payload.photosUrls : null,
          p_videos_urls: payload.videosUrls?.length ? payload.videosUrls : null,
        })
        .single();

      if (error) {
        throw withSchemaDriftContext(error, "RPC upsert_daily_log_with_profiles");
      }

      const savedDailyLog = log as DailyLogRow;
      const { data: savedLog } = await client
        .from("daily_logs")
        .select("updated_at")
        .eq("id", savedDailyLog.id)
        .maybeSingle();

      if (savedLog?.updated_at) {
        void client.functions.invoke("daily-log-updated-push", {
          body: {
            logId: savedDailyLog.id,
            projectId: payload.projectId,
            observedUpdatedAt: savedLog.updated_at,
          },
        });
      }

      return log;
    },
    onSuccess: (savedLog, variables) => {
      queryClient.invalidateQueries({ queryKey: ["daily_logs", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_employees"] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_detail", (savedLog as DailyLogRow).id] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_month_media", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["pending-items", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["pending-menu-badge-count"] });
    },
  });
}

// Remove um log diário específico e invalida as queries relacionadas para atualizar a UI.
export function useDeleteDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { projectId: string; logId: string }) => {
      await requireAuthenticatedUser();
      const client = supabase;
      if (!client) {
        throw new Error("Supabase nao configurado.");
      }

      const { error } = await client.from("daily_logs").delete().eq("id", payload.logId);

      if (error) {
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["daily_logs", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_employees"] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_detail", variables.logId] });
      queryClient.invalidateQueries({ queryKey: ["daily_log_month_media", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["pending-items", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["pending-menu-badge-count"] });
    },
  });
}
