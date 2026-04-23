import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useProject } from "./useProject";

export type RoomRow = {
  id: string;
  project_id: string;
  name: string;
  display_order: number;
};

const EMPTY_ROOMS: RoomRow[] = [];

export function useRooms() {
  const { project } = useProject();

  const query = useQuery({
    queryKey: ["rooms", project?.id],
    enabled: Boolean(project?.id && supabase),
    queryFn: async (): Promise<RoomRow[]> => {
      if (!supabase || !project?.id) {
        return EMPTY_ROOMS;
      }

      const { data, error } = await supabase
        .from("rooms")
        .select("id, project_id, name, display_order")
        .eq("project_id", project.id)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? EMPTY_ROOMS) as RoomRow[];
    },
  });

  return {
    rooms: query.data ?? EMPTY_ROOMS,
    isLoading: query.isLoading,
    error: query.error,
  };
}
