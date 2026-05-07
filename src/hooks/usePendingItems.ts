import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { displayDate } from "../lib/dateUtils";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";
import { useRooms } from "./useRooms";
import { StageRow } from "./useStages";

export type PendingItem = {
  id: string;
  kind: "front" | "stage";
  sourceLabel: "Dia a Dia" | "Etapas";
  title: string;
  subtitle: string;
  date: string;
  navigationTarget:
    | {
        kind: "front";
        logDate: string;
        logId: string;
        serviceItemId: string;
      }
    | {
        kind: "stage";
        stageId: string;
      };
};

export type PendingCollection = {
  key: "fronts" | "stages";
  title: string;
  total: number;
  items: PendingItem[];
};

type PendingStageCandidate = PendingItem & {
  priority: number;
};

function compareByRecentDateDesc(a: { date: string }, b: { date: string }) {
  return b.date.localeCompare(a.date);
}

type PendingRpcRow = {
  item_id: string;
  title: string;
  room_name: string;
  item_date: string | null;
  kind: "front" | "stage";
  source_label: "Dia a Dia" | "Etapas";
  log_id: string | null;
  service_item_id: string | null;
  stage_id: string | null;
  priority: number;
};

type PendingFrontRpcRow = PendingRpcRow & {
  kind: "front";
  source_label: "Dia a Dia";
  item_date: string;
  log_id: string;
  service_item_id: string;
};

type PendingStageRpcRow = PendingRpcRow & {
  kind: "stage";
  source_label: "Etapas";
  stage_id: string;
};

type PendingFrontServiceItemRow = {
  id: string;
  log_id: string;
  room_id: string;
  status: "pendente" | "em_andamento" | "concluido";
};

type PendingFrontLogRow = {
  id: string;
  date: string;
};

type PendingFrontItem = {
  id: string;
  kind: "front";
  sourceLabel: "Dia a Dia";
  title: string;
  subtitle: string;
  date: string;
  navigationTarget: {
    kind: "front";
    logDate: string;
    logId: string;
    serviceItemId: string;
  };
};

async function loadPendingItemsFromRpc(projectId: string) {
  if (!supabase) {
    return [] as PendingRpcRow[];
  }

  const { data, error } = await supabase.rpc("get_project_pending_items", {
    p_project_id: projectId,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as PendingRpcRow[];
}

async function loadPendingFrontItemsLegacy(projectId: string): Promise<PendingFrontItem[]> {
  if (!supabase) {
    return [];
  }

  const { data: logsData, error: logsError } = await supabase
    .from("daily_logs")
    .select("id, date")
    .eq("project_id", projectId)
    .order("date", { ascending: false });

  if (logsError) {
    throw logsError;
  }

  const logs = (logsData ?? []) as PendingFrontLogRow[];
  if (!logs.length) {
    return [];
  }

  const logIds = logs.map((log) => log.id);
  const logDateById = Object.fromEntries(logs.map((log) => [log.id, log.date])) as Record<string, string>;

  const { data: serviceItemsData, error: serviceItemsError } = await supabase
    .from("daily_log_service_items")
    .select("id, log_id, room_id, status")
    .in("log_id", logIds)
    .neq("status", "concluido");

  if (serviceItemsError) {
    throw serviceItemsError;
  }

  return ((serviceItemsData ?? []) as PendingFrontServiceItemRow[])
    .map((item) => {
      const logDate = logDateById[item.log_id];
      if (!logDate) {
        return null;
      }

      return {
        id: `front:${item.id}`,
        kind: "front" as const,
        sourceLabel: "Dia a Dia" as const,
        title: item.room_id,
        subtitle: displayDate(logDate),
        date: logDate,
        navigationTarget: {
          kind: "front" as const,
          logDate,
          logId: item.log_id,
          serviceItemId: item.id,
        },
      } satisfies PendingFrontItem;
    })
    .filter((item): item is PendingFrontItem => Boolean(item))
    .sort(compareByRecentDateDesc);
}

async function loadPendingStagesLegacy(projectId: string): Promise<StageRow[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("schedule_stages")
    .select("id, project_id, name, category, responsible, room_id, planned_start, planned_end, observations, percent_complete, status, created_at")
    .eq("project_id", projectId)
    .in("status", ["em_andamento", "atrasado", "bloqueado"]);

  if (error) {
    throw error;
  }

  return (data ?? []) as StageRow[];
}

export function usePendingItems() {
  const { project, isLoading: projectLoading } = useProject();
  const { rooms, isLoading: roomsLoading } = useRooms();

  const pendingItemsQuery = useQuery({
    queryKey: ["pending-items", project?.id],
    enabled: Boolean(project?.id && supabase && !roomsLoading),
    queryFn: async (): Promise<{
      frontItems: PendingFrontItem[];
      stageItems: PendingStageCandidate[];
      source: "rpc" | "legacy";
    }> => {
      if (!supabase || !project?.id) {
        return { frontItems: [], stageItems: [], source: "legacy" };
      }

      try {
        const rpcItems = await loadPendingItemsFromRpc(project.id);

        const frontItems = rpcItems
          .filter(
            (item): item is PendingFrontRpcRow =>
              item.kind === "front" && Boolean(item.log_id) && Boolean(item.service_item_id) && Boolean(item.item_date),
          )
          .map((item) => ({
            id: `front:${item.item_id}`,
            kind: "front" as const,
            sourceLabel: item.source_label,
            title: item.title,
            subtitle: displayDate(item.item_date),
            date: item.item_date,
            navigationTarget: {
              kind: "front" as const,
              logDate: item.item_date,
              logId: item.log_id,
              serviceItemId: item.service_item_id,
            },
          }))
          .sort(compareByRecentDateDesc);

        const stageItems = rpcItems
          .filter((item): item is PendingStageRpcRow => item.kind === "stage" && Boolean(item.stage_id))
          .map<PendingStageCandidate>((item) => {
            const stageDate = item.item_date ?? "";
            const roomLabel = item.room_name;
            const subtitle = stageDate ? `${roomLabel} • ${displayDate(stageDate)}` : roomLabel;

            return {
              id: `stage:${item.item_id}`,
              kind: "stage" as const,
              sourceLabel: item.source_label,
              title: item.title,
              subtitle,
              date: stageDate,
              navigationTarget: {
                kind: "stage" as const,
                stageId: item.stage_id,
              },
              priority: item.priority,
            };
          })
          .sort((a, b) => {
            const priorityComparison = b.priority - a.priority;
            if (priorityComparison !== 0) {
              return priorityComparison;
            }

            return compareByRecentDateDesc(a, b);
          });

        return { frontItems, stageItems, source: "rpc" };
      } catch {
        const [frontItems, stages] = await Promise.all([
          loadPendingFrontItemsLegacy(project.id),
          loadPendingStagesLegacy(project.id),
        ]);

        const roomNameById = Object.fromEntries(rooms.map((room) => [room.id, room.name]));
        const normalizedFrontItems = frontItems.map((item) => ({
          ...item,
          title: roomNameById[item.title] ?? "Cômodo removido",
        }));

        const stageItems = stages
          .filter((stage) => stage.status === "em_andamento" || stage.status === "atrasado" || stage.status === "bloqueado")
          .map<PendingStageCandidate>((stage) => {
            const stageDate = stage.created_at?.slice(0, 10) ?? stage.planned_start ?? stage.planned_end ?? "";
            const roomLabel = stage.room_id ? roomNameById[stage.room_id] ?? "Cômodo removido" : "Sem cômodo";
            const subtitle = stageDate ? `${roomLabel} • ${displayDate(stageDate)}` : roomLabel;

            return {
              id: `stage:${stage.id}`,
              kind: "stage" as const,
              sourceLabel: "Etapas" as const,
              title: stage.name,
              subtitle,
              date: stageDate,
              navigationTarget: {
                kind: "stage" as const,
                stageId: stage.id,
              },
              priority: stage.status === "atrasado" ? 3 : stage.status === "bloqueado" ? 2 : 1,
            };
          })
          .sort((a, b) => {
            const priorityComparison = b.priority - a.priority;
            if (priorityComparison !== 0) {
              return priorityComparison;
            }

            return compareByRecentDateDesc(a, b);
          });

        return { frontItems: normalizedFrontItems, stageItems, source: "legacy" };
      }
    },
  });

  const frontItems = useMemo<PendingItem[]>(() => {
    return pendingItemsQuery.data?.frontItems ?? [];
  }, [pendingItemsQuery.data]);

  const stageItems = useMemo<PendingItem[]>(() => {
    return (pendingItemsQuery.data?.stageItems ?? []).map(({ priority: _priority, ...item }) => item);
  }, [pendingItemsQuery.data]);

  const collections = useMemo<PendingCollection[]>(
    () => [
      {
        key: "fronts",
        title: "Frentes",
        total: frontItems.length,
        items: frontItems,
      },
      {
        key: "stages",
        title: "Etapas",
        total: stageItems.length,
        items: stageItems,
      },
    ],
    [frontItems, stageItems],
  );

  return {
    collections,
    total: frontItems.length + stageItems.length,
    isLoading: projectLoading || roomsLoading || pendingItemsQuery.isLoading,
  };
}
