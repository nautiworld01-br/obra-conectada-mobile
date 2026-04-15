import { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../config/theme";

type AppScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  scrollable?: boolean;
};

export function AppScreen({ title, subtitle, children, scrollable = true }: AppScreenProps) {
  const content = (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
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
    paddingBottom: 32,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 18,
  },
  header: {
    gap: 6,
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
