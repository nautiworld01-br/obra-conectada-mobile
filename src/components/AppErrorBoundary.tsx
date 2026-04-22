import React, { ErrorInfo, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../config/theme";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  resetCounter: number;
};

/**
 * Captura erros de renderizacao na arvore React e mostra uma tela de fallback
 * para evitar que o app morra em branco sem dar contexto ao usuario.
 */
export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    resetCounter: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary capturou um erro:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState((current) => ({
      error: null,
      resetCounter: current.resetCounter + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Erro inesperado</Text>
            <Text style={styles.title}>Nao foi possivel carregar esta tela.</Text>
            <Text style={styles.description}>
              O app encontrou uma falha de interface. Tente renderizar novamente.
            </Text>
            <Pressable style={styles.button} onPress={this.handleRetry}>
              <Text style={styles.buttonText}>Tentar novamente</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return <React.Fragment key={this.state.resetCounter}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 24,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    color: colors.danger,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  button: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.text,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.surface,
  },
});
