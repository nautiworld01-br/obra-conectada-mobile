import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast, { BaseToast, ErrorToast, ToastConfig } from "react-native-toast-message";
import { AuthProvider } from "../contexts/AuthContext";
import { colors } from "../config/theme";
import { AppErrorBoundary } from "../components/AppErrorBoundary";

const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={styles.successToast}
      contentContainerStyle={styles.toastContent}
      text1Style={styles.toastTitle}
      text2Style={styles.toastSubtitle}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={styles.errorToast}
      contentContainerStyle={styles.toastContent}
      text1Style={styles.toastTitle}
      text2Style={styles.toastSubtitle}
    />
  ),
};

/**
 * Agregador de Provedores: Centraliza todos os contextos e configuracoes globais do app.
 * Mantem a arvore de componentes limpa e garante a ordem correta das dependencias.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Inicializa o cliente do React Query para gerenciamento de cache e estado assincrono.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
            <Toast config={toastConfig} topOffset={18} visibilityTime={2400} />
          </AuthProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  successToast: {
    borderLeftColor: colors.success,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#1f1c17",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    minHeight: 64,
  },
  errorToast: {
    borderLeftColor: colors.danger,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#1f1c17",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    minHeight: 64,
  },
  toastContent: {
    paddingHorizontal: 8,
  },
  toastTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  toastSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
