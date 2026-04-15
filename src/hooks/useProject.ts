import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

export type MobileProject = {
  id: string;
  name: string;
  address: string | null;
  photo_url: string | null;
  total_contract_value: number | null;
  rooms: string[] | null;
  external_spaces: string[] | null;
  observations: string | null;
  start_date: string | null;
  userRole: string;
};

export function useProject() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["project", user?.id],
    enabled: Boolean(user?.id && supabase),
    queryFn: async (): Promise<MobileProject | null> => {
      if (!supabase || !user) {
        return null;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("project_members")
        .select("project_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        throw membershipError;
      }

      if (!membership) {
        return null;
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, name, address, photo_url, total_contract_value, rooms, external_spaces, observations, start_date")
        .eq("id", membership.project_id)
        .single();

      if (projectError) {
        throw projectError;
      }

      return {
        ...project,
        userRole: membership.role,
      };
    },
  });

  return {
    project: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
