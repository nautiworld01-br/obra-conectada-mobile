import { useMemo } from "react";
import { displayDate } from "../lib/dateUtils";
import { useDailyLogs } from "./useDailyLogs";
import { useRooms } from "./useRooms";
import { StageStatus, useStages } from "./useStages";

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

export function usePendingItems() {
  const { logs, isLoading: logsLoading } = useDailyLogs();
  const { stages, isLoading: stagesLoading } = useStages();
  const { rooms, isLoading: roomsLoading } = useRooms();

  const roomNameById = useMemo(
    () => Object.fromEntries(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );

  const frontItems = useMemo<PendingItem[]>(() => {
    return logs
      .flatMap((log) =>
        log.service_items
          .filter((item) => item.status !== "concluido")
          .map((item) => ({
            id: `front:${item.id}`,
            kind: "front" as const,
            sourceLabel: "Dia a Dia" as const,
            title: roomNameById[item.room_id] ?? "Cômodo removido",
            subtitle: displayDate(log.date),
            date: log.date,
            navigationTarget: {
              kind: "front" as const,
              logDate: log.date,
              logId: log.id,
              serviceItemId: item.id,
            },
          })),
      )
      .sort(compareByRecentDateDesc);
  }, [logs, roomNameById]);

  const stageItems = useMemo<PendingItem[]>(() => {
    return stages
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
  }, [roomNameById, stages]);

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
    isLoading: logsLoading || stagesLoading || roomsLoading,
  };
}
