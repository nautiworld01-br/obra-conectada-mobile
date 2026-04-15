import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { primaryModules } from "../config/modules";
import { useDocuments } from "../hooks/useDocuments";
import { buildInitials, useProfile } from "../hooks/useProfile";
import { useProject } from "../hooks/useProject";
import { useStages } from "../hooks/useStages";
import { usePayments } from "../hooks/usePayments";
import { useUpdates } from "../hooks/useUpdates";
import { useTeam } from "../hooks/useTeam";

function formatMoney(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

export function SettingsScreen() {
  const { signOut, isConfigured, user } = useAuth();
  const { fullName, occupationLabel, avatarUrl, isOwner } = useProfile();
  const { project } = useProject();
  const { employees } = useTeam();
  const { stages } = useStages();
  const { payments } = usePayments();
  const { updates } = useUpdates();
  const { documents } = useDocuments();

  const activeEmployees = employees.filter((employee) => employee.status === "ativo").length;
  const pendingPayments = payments.filter((payment) => payment.status === "pendente" || payment.status === "em_analise").length;
  const openStages = stages.filter((stage) => stage.status !== "concluido").length;
  const approvedUpdates = updates.filter((update) => update.approved).length;
  const configuredModules = [
    { label: "Equipe", value: `${activeEmployees} ativos` },
    { label: "Crono", value: `${openStages} etapas abertas` },
    { label: "Pagamentos", value: `${pendingPayments} pendencias` },
    { label: "Atualizacoes", value: `${approvedUpdates}/${updates.length} aprovadas` },
    { label: "Documentos", value: `${documents.length} arquivos` },
    { label: "Presenca", value: "Controle diario liberado" },
  ];

  const handleSignOut = () => {
    Alert.alert("Sair da conta?", "Voce sera desconectado deste aparelho.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <AppScreen title="Configuracoes" subtitle="Visao geral do ambiente, da conta ativa e do estado operacional do app.">
      <SectionCard title="Conta ativa" subtitle="Informacoes da sessao autenticada neste aparelho.">
        <View style={styles.accountRow}>
          <View style={styles.avatar}>
            {avatarUrl ? <Text style={styles.avatarText}>{buildInitials(fullName)}</Text> : <Text style={styles.avatarText}>{buildInitials(fullName)}</Text>}
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{fullName}</Text>
            <Text style={styles.accountMeta}>{user?.email ?? "nenhuma sessao ativa"}</Text>
            <Text style={styles.accountMeta}>Perfil: {occupationLabel}</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Ambiente"
        subtitle={isConfigured ? "O app encontrou as variaveis publicas do Supabase." : "Faltam variaveis EXPO_PUBLIC_ no .env."}
      >
        <View style={styles.infoList}>
          <Text style={styles.rowLabel}>Supabase: {isConfigured ? "Configurado" : "Pendente"}</Text>
          <Text style={styles.rowLabel}>Casa vinculada: {project?.name?.trim() || "Ainda nao configurada"}</Text>
          <Text style={styles.rowLabel}>Endereco: {project?.address?.trim() || "Nao informado"}</Text>
          <Text style={styles.rowLabel}>Contrato: {formatMoney(project?.total_contract_value ?? null)}</Text>
        </View>
      </SectionCard>

      <SectionCard title="Modulos ativos" subtitle="Resumo rapido do que ja esta operacional neste projeto.">
        <View style={styles.moduleGrid}>
          {configuredModules.map((module) => (
            <View key={module.label} style={styles.moduleCard}>
              <Text style={styles.moduleTitle}>{module.label}</Text>
              <Text style={styles.moduleValue}>{module.value}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Navegacao principal" subtitle="Atalhos que hoje fazem parte da operacao base do app.">
        <View style={styles.moduleList}>
          {primaryModules.map((module) => (
            <View key={module.key} style={styles.moduleListRow}>
              <Text style={styles.moduleListEmoji}>{module.emoji}</Text>
              <Text style={styles.moduleListLabel}>{module.label}</Text>
            </View>
          ))}
          {isOwner ? (
            <Text style={styles.helperText}>Como proprietario, voce tambem acessa Documentos, Presenca e Configuracoes pelo menu lateral.</Text>
          ) : (
            <Text style={styles.helperText}>Como funcionario, o menu lateral mostra apenas as areas liberadas para a sua operacao.</Text>
          )}
        </View>
      </SectionCard>

      <Pressable onPress={handleSignOut} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Sair</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 18,
  },
  accountCopy: {
    flex: 1,
    gap: 3,
  },
  accountName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  accountMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  infoList: {
    gap: 8,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  moduleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  moduleCard: {
    width: "48%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
    gap: 6,
  },
  moduleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  moduleValue: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  moduleList: {
    gap: 10,
  },
  moduleListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  moduleListEmoji: {
    fontSize: 18,
  },
  moduleListLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  helperText: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
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
