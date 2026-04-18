import { ReactNode } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp, LinearTransition } from "react-native-reanimated";
import { colors } from "../config/theme";

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
        <View style={styles.titleRow}>
          <Image source={require("../../assets/icon.png")} style={styles.headerLogo} />
          <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
        </View>
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
    paddingBottom: 32,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 18,
  },
  body: {
    gap: 18,
  },
  header: {
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
