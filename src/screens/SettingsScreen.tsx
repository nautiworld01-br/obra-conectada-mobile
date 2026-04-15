import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";

export function SettingsScreen() {
  const { signOut, isConfigured, user } = useAuth();

  return (
    <AppScreen title="Configuracoes" subtitle="Status da conexao, conta ativa e proximos passos da migracao.">
      <SectionCard
        title="Supabase"
        subtitle={isConfigured ? "Variaveis do novo projeto detectadas." : "Faltam as variaveis EXPO_PUBLIC_ no .env."}
      >
        <Text style={styles.rowLabel}>Conta atual: {user?.email ?? "nenhuma sessao ativa"}</Text>
      </SectionCard>

      <SectionCard title="Roadmap imediato" subtitle="Sequencia sugerida para evoluir sem mexer no projeto antigo.">
        <View style={{ gap: 10 }}>
          {[
            "Criar o projeto novo no Supabase e aplicar as migrations",
            "Portar auth e gate de projeto",
            "Migrar dashboard e atualizacoes",
            "Migrar pagamentos, documentos e equipe",
          ].map((item) => (
            <Text key={item} style={styles.rowLabel}>
              • {item}
            </Text>
          ))}
        </View>
      </SectionCard>

      <Pressable onPress={() => void signOut()} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Sair</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rowLabel: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    backgroundColor: colors.text,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: colors.surface,
    fontWeight: "700",
    fontSize: 15,
  },
});
