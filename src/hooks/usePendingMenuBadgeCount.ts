import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProfile } from "./useProfile";

type PendingBadgeCountRow = {
  open_fronts: number | null;
  open_stages: number | null;
};

export function usePendingMenuBadgeCount(enabled: boolean) {
  const { profile } = useProfile();

  const query = useQuery({
    queryKey: ["pending-menu-badge-count", profile?.project_id],
    enabled: Boolean(enabled && supabase && profile?.project_id),
    queryFn: async () => {
      if (!supabase || !profile?.project_id) {
        return 0;
      }

      const { data, error } = await supabase
        .rpc("get_project_pending_badge_count", {
          p_project_id: profile.project_id,
        })
        .single();

      if (error) {
        throw error;
      }

      const counts = (data ?? { open_fronts: 0, open_stages: 0 }) as PendingBadgeCountRow;
      const frontsCount = counts.open_fronts ?? 0;
      const stagesCount = counts.open_stages ?? 0;

      return frontsCount + stagesCount;
    },
    staleTime: 30_000,
  });

  return {
    total: query.data ?? 0,
  };
}
