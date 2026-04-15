import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Occupation } from "../hooks/useProfile";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const checkOwnerExists = async (): Promise<boolean> => {
      if (!supabase) {
        return false;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("is_owner", true)
          .limit(1);
        
        if (error) {
          console.warn("Failed to check if owner exists:", error);
          return false;
        }

        return data && data.length > 0;
      } catch (err) {
        console.warn("Error checking owner existence:", err);
        return false;
      }
    };

    return {
      user,
      session,
      loading,
      isConfigured: env.hasSupabaseConfig,
      async signIn(email, password) {
        if (!supabase) {
          return { error: "Configure o .env com o novo projeto Supabase para entrar." };
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { error: error.message };
        }

        return {};
      },
      async signUp({ fullName, email, password, occupation }) {
        if (!supabase) {
          return { error: "Configure o .env com o novo projeto Supabase para criar a conta." };
        }

        if (occupation === "owner") {
          const ownerExists = await checkOwnerExists();

          if (ownerExists) {
            return { error: "Ja existe um proprietario registrado no sistema." };
          }
        }

        const isOwner = occupation === "owner";
        const isEmployee = occupation === "employee";

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              is_owner: isOwner,
              is_employee: isEmployee,
              occupation,
            },
          },
        });

        return error ? { error: error.message } : {};
      },
      async signOut() {
        if (!supabase) {
          return;
        }

        await supabase.auth.signOut();
      },
      checkOwnerExists,
    };
  }, [loading, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
