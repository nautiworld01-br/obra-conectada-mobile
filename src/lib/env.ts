// Chaves hardcoded para garantir o funcionamento em builds de apresentação (APK e PWA).
const supabaseUrl = "https://hjxvjmcdrsiifukmtjig.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqeHZqbWNkcnNpaWZ1a210amlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODc4MzgsImV4cCI6MjA5MTY2MzgzOH0.VTA5eUJHX2BN59us1MMftZtPuoyU-yQE8YXt-kI8dDA";
const pushVapidPublicKey =
  process.env.EXPO_PUBLIC_PUSH_VAPID_PUBLIC_KEY ??
  "BE7HhsGY7DZl43P8HaYVSZr1gYGq_Wzw5IE_HOtdh-CxOKyfvEnTHUfUtw09fNdt1Oj6hCLeh9_qtx2jXZlmPgk";

// Valida se as configurações básicas de conexão com o Supabase foram fornecidas.
const hasConfig = Boolean(supabaseUrl && supabaseAnonKey);

// Exibe erros informativos no console se a configuração estiver faltando.
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

// Exporta as variáveis de configuração processadas para o restante da aplicação.
export const env = {
  supabaseUrl,
  supabaseAnonKey,
  pushVapidPublicKey,
  hasSupabaseConfig: hasConfig,
};
