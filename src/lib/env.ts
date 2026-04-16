// Carregamento das variáveis de ambiente para conexão com o Supabase.
// future_fix: Adicionar validação de tipo para as chaves do ambiente.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Valida se as configurações básicas de conexão com o Supabase foram fornecidas.
const hasConfig = Boolean(supabaseUrl && supabaseAnonKey);

// Exibe erros informativos no console se a configuração estiver faltando.
// future_fix: Implementar um mecanismo de alerta visual para o usuário em caso de falha crítica.
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
  hasSupabaseConfig: hasConfig,
};
