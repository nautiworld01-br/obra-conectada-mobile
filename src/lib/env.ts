const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const hasConfig = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasConfig) {
  if (__DEV__) {
    console.error(
      "⚠️ Erro de Configuração Local:\n" +
      "- EXPO_PUBLIC_SUPABASE_URL: " + (supabaseUrl ? "✅" : "❌ Faltando") + "\n" + 
      "- EXPO_PUBLIC_SUPABASE_ANON_KEY: " + (supabaseAnonKey ? "✅" : "❌ Faltando") + "\n" +
      "Verifique se o arquivo se chama exatamente '.env' (sem ponto no final) e reinicie com: npx expo start -c"
    );
  } else {
    if (!hasConfig) {
      console.error("⚠️ Erro de Produção: Chaves do Supabase ausentes no bundle.");
    }
  }
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  hasSupabaseConfig: hasConfig,
};
