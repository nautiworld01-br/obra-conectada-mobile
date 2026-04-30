import { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../config/theme";

/**
 * Propriedades do componente AppScreen.
 * Define a estrutura base para telas padronizadas do app.
 */
type AppScreenProps = {
  title: string;
  titleColor?: string; // Nova propriedade para debug e personalização
  subtitle?: string;
  children: ReactNode;
  scrollable?: boolean;
  disableLayoutAnimation?: boolean;
};

/**
 * Componente de layout base para as telas do aplicativo.
 * Oferece suporte a scroll opcional e cabecalho padronizado.
 * future_fix: Adicionar suporte a RefreshControl para facilitar atualizacao de dados nas telas.
 */
export function AppScreen({ title, titleColor, subtitle, children, scrollable = true, disableLayoutAnimation = false }: AppScreenProps) {
  void disableLayoutAnimation;

  const content = (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.body}>
        {children}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {scrollable ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.screenBottomPadding,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: spacing.lg,
    gap: spacing.sectionGap,
  },
  body: {
    gap: spacing.sectionGap,
  },
  header: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  title: {
    ...typography.screenTitle,
    color: colors.text,
  },
  subtitle: {
    ...typography.screenSubtitle,
    color: colors.textMuted,
    maxWidth: 560,
  },
});
