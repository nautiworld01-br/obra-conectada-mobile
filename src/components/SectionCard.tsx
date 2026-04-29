import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, LinearTransition } from "react-native-reanimated";
import { colors, radii, shadows, spacing, typography } from "../config/theme";

/**
 * Propriedades do componente SectionCard.
 * Utilizado para agrupar informações relacionadas em cards visuais.
 */
type SectionCardProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

/**
 * Componente de card para seções de conteúdo.
 * Fornece um container visual padronizado com suporte a título e subtítulo.
 * future_fix: Adicionar suporte a estados de loading e erro dentro do card.
 */
export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(280)}
      layout={LinearTransition.springify().damping(22).stiffness(200)}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    ...shadows.card,
  },
  header: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.text,
  },
  subtitle: {
    ...typography.sectionSubtitle,
    color: colors.textMuted,
  },
});
