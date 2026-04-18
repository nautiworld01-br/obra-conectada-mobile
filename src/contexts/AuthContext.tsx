import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
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
 * future_fix: Adicionar log de auditoria de sessoes para detectar logins suspeitos em multiplos aparelhos.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  // Inicializa a sessao e monitora mudancas de estado (Auth e Ciclo de Vida do App).
  useEffect(() => {
    const client = supabase;

    if (!client) {
      setLoading(false);
      return;
    }

    let mounted = true;

    // Recupera a sessao inicial do storage local.
    const initializeSession = async () => {
      try {
        const { data: { session: initialSession }, error } = await client.auth.getSession();
        if (error) throw error;
        
        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void initializeSession();

    // Listener para mudancas no Supabase Auth (Login, Logout, Refresh).
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
      }
    });

    // REFORCO: Ao voltar do segundo plano, verifica se a sessao ainda e valida.
    // Essencial para o Expo Go nao perder o login apos horas de inatividade.
    const appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        void client.auth.refreshSession();
      }
      appState.current = nextAppState;
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  /**
   * Consolida as funcoes de acao de auth (sign in, sign up, sign out).
   */
  const value = useMemo<AuthContextValue>(() => {
    /**
     * Verifica se ja existe um proprietario no banco de dados para bloquear novos cadastros de 'owner'.
     * Utiliza uma RPC segura acessivel por usuarios anonimos.
     */
    const checkOwnerExists = async (): Promise<boolean> => {
      if (!supabase) return false;
      try {
        const { data, error } = await supabase.rpc("has_owner_registered");
        if (error) throw error;
        return !!data;
      } catch (err) {
        console.error("Erro ao verificar dono:", err);
        return false;
      }
    };

    return {
      user,
      session,
      loading,
      isConfigured: env.hasSupabaseConfig,
      async signIn(email, password) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
      },
      async signUp({ fullName, email, password, occupation }) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        if (occupation === "owner" && await checkOwnerExists()) {
          return { error: "Já existe um proprietário registrado." };
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
