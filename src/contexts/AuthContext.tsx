import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import type { Occupation } from "../hooks/useProfile";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";

function isInvalidRefreshTokenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.toLowerCase().includes("invalid refresh token");
}

function getPasswordResetRedirectUrl() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}?reset-password=1`;
}

function getAuthRedirectUrl() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Define a estrutura de dados e funcoes disponiveis globalmente via contexto de autenticacao.
 */
type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  passwordRecoveryActive: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  reauthenticate: (password: string) => Promise<{ error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  resendSignUpConfirmation: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  finishPasswordRecovery: (options?: { signOut?: boolean }) => Promise<void>;
  signUp: (payload: {
    fullName: string;
    email: string;
    password: string;
    occupation: Occupation;
  }) => Promise<{ error?: string; requiresEmailConfirmation?: boolean }>;
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
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const appState = useRef(AppState.currentState);

  // Inicializa a sessao e monitora mudancas de estado (Auth e Ciclo de Vida do App).
  useEffect(() => {
    const client = supabase;

    if (!client) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const clearInvalidLocalSession = async () => {
      try {
        await client.auth.signOut({ scope: "local" });
      } catch (_signOutError) {
        // Local storage may already be inconsistent; state cleanup below is enough for UI recovery.
      }

      if (mounted) {
        setSession(null);
        setUser(null);
      }
    };

    const handleIncomingRecovery = async (url: string | null) => {
      if (!url || Platform.OS !== "web") return;

      try {
        const parsedUrl = new URL(url);
        const queryParams = new URLSearchParams(parsedUrl.search);
        const hashParams = new URLSearchParams(parsedUrl.hash.startsWith("#") ? parsedUrl.hash.slice(1) : parsedUrl.hash);
        const accessToken = hashParams.get("access_token") ?? queryParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token") ?? queryParams.get("refresh_token");
        const type = hashParams.get("type") ?? queryParams.get("type");
        const isRecoveryLink = type === "recovery" || queryParams.get("reset-password") === "1";

        if (accessToken && refreshToken) {
          const { error } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;
        }

        if (mounted && isRecoveryLink) {
          setPasswordRecoveryActive(true);
        }
      } catch (err) {
        console.error("Auth recovery link error:", err);
      }
    };

    // Recupera a sessao inicial do storage local.
    const initializeSession = async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          await handleIncomingRecovery(window.location.href);
        }

        const { data: { session: initialSession }, error } = await client.auth.getSession();
        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            await clearInvalidLocalSession();
            return;
          }

          throw error;
        }
        
        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
        }
      } catch (err) {
        if (isInvalidRefreshTokenError(err)) {
          await clearInvalidLocalSession();
        } else {
          console.error("Auth init error:", err);
        }
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
        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecoveryActive(true);
        }
        if (event === "SIGNED_OUT") {
          setPasswordRecoveryActive(false);
        }
        setLoading(false);
      }
    });

    // REFORCO: Ao voltar do segundo plano, verifica se a sessao ainda e valida.
    // Mantem a sessao viva quando a aba volta ao foco apos inatividade.
    const appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        void client.auth.refreshSession().then(({ error }) => {
          if (error && isInvalidRefreshTokenError(error)) {
            void clearInvalidLocalSession();
          }
        });
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
      passwordRecoveryActive,
      async signIn(email, password) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
      },
      async reauthenticate(password) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        if (!user?.email) return { error: "Não foi possível validar a sessão atual." };
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
        return error ? { error: error.message } : {};
      },
      async requestPasswordReset(email) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        const redirectTo = getPasswordResetRedirectUrl();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        return error ? { error: error.message } : {};
      },
      async resendSignUpConfirmation(email) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        const emailRedirectTo = getAuthRedirectUrl();
        const { error } = await supabase.auth.resend({
          type: "signup",
          email,
          options: {
            emailRedirectTo,
          },
        });
        return error ? { error: error.message } : {};
      },
      async updatePassword(password) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        const { error } = await supabase.auth.updateUser({ password });
        return error ? { error: error.message } : {};
      },
      async finishPasswordRecovery(options) {
        setPasswordRecoveryActive(false);

        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.history.replaceState({}, "", window.location.pathname);
        }

        if (options?.signOut && supabase) {
          await supabase.auth.signOut();
        }
      },
      async signUp({ fullName, email, password, occupation }) {
        if (!supabase) return { error: "Configure as variáveis de ambiente." };
        if (occupation === "owner" && await checkOwnerExists()) {
          return { error: "Já existe um proprietário registrado." };
        }
        // Cria usuario e anexa metadados para sincronizacao automatica com a tabela profiles via Trigger.
        const emailRedirectTo = getAuthRedirectUrl();
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo,
            data: { full_name: fullName.trim(), is_owner: occupation === "owner", is_employee: occupation === "employee", occupation },
          },
        });
        if (error) {
          return { error: error.message };
        }

        const requiresEmailConfirmation = !!data.user && !data.session;
        return { requiresEmailConfirmation };
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut();
      },
      checkOwnerExists,
    };
  }, [loading, passwordRecoveryActive, session, user]);

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
