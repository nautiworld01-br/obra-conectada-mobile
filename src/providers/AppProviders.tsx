import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../contexts/AuthContext";

/**
 * Agregador de Provedores: Centraliza todos os contextos e configuracoes globais do app.
 * Mantem a arvore de componentes limpa e garante a ordem correta das dependencias.
 * future_fix: Adicionar ErrorBoundary global para capturar crashes e exibir uma tela amigavel.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Inicializa o cliente do React Query para gerenciamento de cache e estado assincrono.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
