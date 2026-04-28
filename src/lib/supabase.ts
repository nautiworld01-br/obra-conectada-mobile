import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { env } from "./env";

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function createWebStorage(): StorageAdapter {
  return {
    async getItem(key) {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }

      return window.localStorage.getItem(key);
    },
    async setItem(key, value) {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }

      window.localStorage.setItem(key, value);
    },
    async removeItem(key) {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }

      window.localStorage.removeItem(key);
    },
  };
}

const authStorage = Platform.OS === "web" ? createWebStorage() : AsyncStorage;

// Inicialização do cliente Supabase utilizando as configurações do ambiente.
// Na web/PWA usamos localStorage explícito para evitar ambiguidades do shim RN.
export const supabase = env.hasSupabaseConfig
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: authStorage,
        storageKey: "obra-conectada-auth",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
