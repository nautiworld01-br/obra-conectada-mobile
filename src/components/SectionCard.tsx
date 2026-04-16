import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../config/theme";

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
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 18,
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
});
