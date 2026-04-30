import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProfile } from "./useProfile";

export function usePendingMenuBadgeCount(enabled: boolean) {
  const { profile } = useProfile();

  const query = useQuery({
    queryKey: ["pending-menu-badge-count", profile?.project_id],
    enabled: Boolean(enabled && supabase && profile?.project_id),
    queryFn: async () => {
      if (!supabase || !profile?.project_id) {
        return 0;
      }

      const [dailyLogsResult, stagesResult] = await Promise.all([
        supabase
          .from("daily_logs")
          .select("id, daily_log_service_items ( status )")
          .eq("project_id", profile.project_id),
        supabase
          .from("schedule_stages")
          .select("id, status")
          .eq("project_id", profile.project_id)
          .in("status", ["em_andamento", "atrasado", "bloqueado"]),
      ]);

      if (dailyLogsResult.error) {
        throw dailyLogsResult.error;
      }

      if (stagesResult.error) {
        throw stagesResult.error;
      }

      const frontsCount = (dailyLogsResult.data ?? []).reduce((sum, log) => {
        const openItems = ((log.daily_log_service_items as { status?: string | null }[] | null) ?? []).filter(
          (item) => item.status !== "concluido",
        ).length;
        return sum + openItems;
      }, 0);

      const stagesCount = (stagesResult.data ?? []).length;

      return frontsCount + stagesCount;
    },
    staleTime: 30_000,
  });

  return {
    total: query.data ?? 0,
  };
}
