import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { displayDate } from "../lib/dateUtils";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";
import { useRooms } from "./useRooms";
import { StageRow, StageStatus } from "./useStages";

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

function getStagePriority(status: StageStatus) {
  switch (status) {
    case "atrasado":
      return 3;
    case "bloqueado":
      return 2;
    case "em_andamento":
      return 1;
    default:
      return 0;
  }
}

function compareByRecentDateDesc(a: { date: string }, b: { date: string }) {
  return b.date.localeCompare(a.date);
}

type PendingFrontLogRow = {
  id: string;
  date: string;
};

type PendingFrontServiceItemRow = {
  id: string;
  log_id: string;
  room_id: string;
  status: "pendente" | "em_andamento" | "concluido";
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

export function usePendingItems() {
  const { project, isLoading: projectLoading } = useProject();
  const { rooms, isLoading: roomsLoading } = useRooms();

  const frontsQuery = useQuery({
    queryKey: ["pending-front-items", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<PendingFrontItem[]> => {
      if (!supabase || !project?.id) {
        return [];
      }

      const { data: logsData, error: logsError } = await supabase
        .from("daily_logs")
        .select("id, date")
        .eq("project_id", project.id)
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
    },
  });

  const stagesQuery = useQuery({
    queryKey: ["pending-stage-items", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<StageRow[]> => {
      if (!supabase || !project?.id) {
        return [];
      }

      const { data, error } = await supabase
        .from("schedule_stages")
        .select("id, project_id, name, category, responsible, room_id, planned_start, planned_end, observations, percent_complete, status, created_at")
        .eq("project_id", project.id)
        .in("status", ["em_andamento", "atrasado", "bloqueado"]);

      if (error) {
        throw error;
      }

      return (data ?? []) as StageRow[];
    },
  });

  const roomNameById = useMemo(
    () => Object.fromEntries(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );

  const frontItems = useMemo<PendingItem[]>(() => {
    return (frontsQuery.data ?? []).map((item) => ({
      ...item,
      title: roomNameById[item.title] ?? "Cômodo removido",
    }));
  }, [frontsQuery.data, roomNameById]);

  const stageItems = useMemo<PendingItem[]>(() => {
    return (stagesQuery.data ?? [])
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
          priority: getStagePriority(stage.status),
        };
      })
      .sort((a, b) => {
        const priorityComparison = b.priority - a.priority;
        if (priorityComparison !== 0) {
          return priorityComparison;
        }

        return compareByRecentDateDesc(a, b);
      })
      .map(({ priority: _priority, ...item }) => item);
  }, [roomNameById, stagesQuery.data]);

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
    isLoading: projectLoading || frontsQuery.isLoading || stagesQuery.isLoading || roomsLoading,
  };
}
