import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

// Tipos que definem a ocupação e a estrutura do perfil do usuário.
// future_fix: Expandir ocupações para incluir 'gestor' ou 'cliente'.
export type Occupation = "owner" | "employee";

type ProfileRecord = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_owner: boolean;
  is_employee: boolean;
  occupation_role?: string | null;
  status?: "ativo" | "inativo" | null;
  project_id?: string | null;
};

// Helpers para tradução e conversão de permissões e flags de ocupação.
export function occupationLabelFromFlags(isOwner: boolean, isEmployee: boolean) {
  if (isOwner) {
    return "Proprietario";
  }

  if (isEmployee) {
    return "Funcionario";
  }

  return "Perfil sem ocupacao definida";
}

export function flagsFromOccupation(occupation: Occupation) {
  return {
    is_owner: occupation === "owner",
    is_employee: occupation === "employee",
  };
}

export function deriveOccupation(isOwner: boolean, isEmployee: boolean): Occupation | null {
  if (isOwner) {
    return "owner";
  }

  if (isEmployee) {
    return "employee";
  }

  return null;
}

// Gera as iniciais do nome do usuário para exibição em avatares fallback.
export function buildInitials(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    return "OC";
  }

  return tokens
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");
}

// Hook principal para gerenciar o perfil do usuário logado, integrando Auth e Database.
// future_fix: Implementar sincronização automática entre metadata do Auth e tabela profiles.
export function useProfile() {
  const { user } = useAuth();
  const metadata = (user?.user_metadata as {
    full_name?: string;
    avatar_url?: string;
    is_owner?: boolean;
    is_employee?: boolean;
  } | undefined) ?? { };

  const query = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user?.id && supabase),
    queryFn: async (): Promise<ProfileRecord | null> => {
      const { data, error } = await supabase!
        .from("profiles")
        .select("id, full_name, avatar_url, is_owner, is_employee, occupation_role, status, project_id")
        .eq("id", user!.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
  });

  const fullName = query.data?.full_name?.trim() || metadata.full_name?.trim() || "Usuario";
  const avatarUrl = query.data?.avatar_url?.trim() || metadata.avatar_url?.trim() || "";
  const isOwner = Boolean(query.data?.is_owner ?? metadata.is_owner);
  const isEmployee = Boolean(query.data?.is_employee ?? metadata.is_employee);
  const occupation = deriveOccupation(isOwner, isEmployee);

  return {
    profile: query.data ?? null,
    fullName,
    avatarUrl,
    isOwner,
    isEmployee,
    occupation,
    occupationLabel: occupationLabelFromFlags(isOwner, isEmployee),
    initials: buildInitials(fullName),
    isLoading: query.isLoading,
    error: query.error,
  };
}
