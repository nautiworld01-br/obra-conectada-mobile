import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Inicialização do cliente Supabase utilizando as configurações do ambiente.
// O AsyncStorage é usado para persistência de sessão no ambiente do React Native.
// future_fix: Validar se a persistência de sessão está funcionando corretamente entre reinícios do app.
export const supabase = env.hasSupabaseConfig
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
