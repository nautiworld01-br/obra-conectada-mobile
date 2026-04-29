import { ReactNode } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp, LinearTransition } from "react-native-reanimated";
import { colors, radii, spacing, typography } from "../config/theme";

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
};

/**
 * Componente de layout base para as telas do aplicativo.
 * Oferece suporte a scroll opcional e cabecalho padronizado.
 * future_fix: Adicionar suporte a RefreshControl para facilitar atualizacao de dados nas telas.
 */
export function AppScreen({ title, titleColor, subtitle, children, scrollable = true }: AppScreenProps) {
  const content = (
    <Animated.View style={styles.content} layout={LinearTransition.springify().damping(20).stiffness(180)}>
      <Animated.View entering={FadeInDown.duration(260).springify()} style={styles.header}>
        <View style={styles.headerBadge}>
          <Image source={require("../../assets/icon.png")} style={styles.headerLogo} />
          <Text style={styles.headerBadgeText}>Obra Conectada</Text>
        </View>
        <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </Animated.View>
      <Animated.View entering={FadeInUp.duration(300).delay(40)} style={styles.body}>
        {children}
      </Animated.View>
    </Animated.View>
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
  headerBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerLogo: {
    width: 22,
    height: 22,
    borderRadius: 8,
  },
  headerBadgeText: {
    ...typography.overline,
    color: colors.primary,
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
