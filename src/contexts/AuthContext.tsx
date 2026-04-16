import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Occupation } from "../hooks/useProfile";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";

/**
 * Define a estrutura de dados e funcoes disponiveis globalmente via contexto de autenticacao.
 */
type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (payload: {
    fullName: string;
    email: string;
    password: string;
    occupation: Occupation;
  }) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  checkOwnerExists: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provider global de autenticacao: Gerencia a sessao do Supabase e o estado do usuario logado.
 * future_fix: Adicionar persistencia de sessao extra ou refresh token manual se o Expo Go perder o estado.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Monitora mudancas no estado de autenticacao (login, logout, refresh).
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Consolida as funcoes de acao de auth (sign in, sign up, sign out).
   */
  const value = useMemo<AuthContextValue>(() => {
    /**
     * Verifica se ja existe um proprietario no banco de dados para bloquear novos cadastros de 'owner'.
     */
    const checkOwnerExists = async (): Promise<boolean> => {
      if (!supabase) return false;
      try {
        const { data, error } = await supabase.from("profiles").select("id").eq("is_owner", true).limit(1);
        if (error) return false;
        return data && data.length > 0;
      } catch { return false; }
    };

    return {
      user,
      session,
      loading,
      isConfigured: env.hasSupabaseConfig,
      async signIn(email, password) {
        if (!supabase) return { error: "Configure as variaveis de ambiente." };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
      },
      async signUp({ fullName, email, password, occupation }) {
        if (!supabase) return { error: "Configure as variaveis de ambiente." };
        if (occupation === "owner" && await checkOwnerExists()) {
          return { error: "Ja existe um proprietario registrado." };
        }
        // Cria usuario e anexa metadados para sincronizacao automatica com a tabela profiles via Trigger.
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName.trim(), is_owner: occupation === "owner", is_employee: occupation === "employee", occupation } },
        });
        return error ? { error: error.message } : {};
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut();
      },
      checkOwnerExists,
    };
  }, [loading, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook para acessar o estado de autenticacao de qualquer lugar do app.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
