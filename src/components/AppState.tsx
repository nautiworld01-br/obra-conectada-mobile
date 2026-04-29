import { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../config/theme";

type AppStateProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

type AppLoadingStateProps = {
  label?: string;
};

export function AppLoadingState({ label = "Carregando..." }: AppLoadingStateProps) {
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.stateTitle}>{label}</Text>
    </View>
  );
}

export function AppEmptyState({ title, description, children }: AppStateProps) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      {description ? <Text style={styles.stateDescription}>{description}</Text> : null}
      {children}
    </View>
  );
}

export function AppErrorState({ title, description, children }: AppStateProps) {
  return (
    <View style={[styles.stateCard, styles.errorCard]}>
      <Text style={styles.stateTitle}>{title}</Text>
      {description ? <Text style={styles.stateDescription}>{description}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stateCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  errorCard: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  stateTitle: {
    ...typography.sectionTitle,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    textAlign: "center",
  },
  stateDescription: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
