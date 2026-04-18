import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Toast from "react-native-toast-message";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { AppIcon } from "../components/AppIcon";
import { AppDatePicker } from "../components/AppDatePicker";
import { AnimatedModal } from "../components/AnimatedModal";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { primaryModules } from "../config/modules";
import { useDocuments } from "../hooks/useDocuments";
import { buildInitials, useProfile } from "../hooks/useProfile";
import { MobileProject, useProject, useUpdateProject } from "../hooks/useProject";
import { useStages } from "../hooks/useStages";
import { usePayments } from "../hooks/usePayments";
import { useUpdates } from "../hooks/useUpdates";
import { useTeam } from "../hooks/useTeam";

/**
 * Formata valores numericos para moeda Real (BRL).
 * Exibe 'Não informado' se o valor for nulo ou inválido.
 */
function formatMoney(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

/**
 * Modal de edição dos dados do projeto (nome, endereço, valor e início).
 */
function EditProjectModal({
  project,
  visible,
  loading,
  onClose,
  onSave,
}: {
  project: MobileProject | null;
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [address, setAddress] = useState(project?.address ?? "");
  const [value, setValue] = useState(project?.total_contract_value?.toString() ?? "");
  const [startDate, setStartDate] = useState(project?.start_date ?? "");

  // Sincroniza o estado local quando o modal abre ou o projeto muda.
  useEffect(() => {
    if (visible && project) {
      setName(project.name ?? "");
      setAddress(project.address ?? "");
      setValue(project.total_contract_value?.toString() ?? "");
      setStartDate(project.start_date ?? "");
    }
  }, [visible, project]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Erro", "O nome da obra é obrigatório.");
      return;
    }

    await onSave({
      name: name.trim(),
      address: address.trim() || null,
      total_contract_value: value ? parseFloat(value) : null,
      start_date: startDate.trim() || null,
    });
  };

  return (
    <AnimatedModal visible={visible} onRequestClose={onClose} position="center" contentStyle={styles.modalCard}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Configurar Obra</Text>
        <Pressable onPress={onClose}>
          <AppIcon name="X" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Nome da obra *</Text>
          <TextInput
            placeholder="Ex: Reforma Obra 01"
            placeholderTextColor={colors.textMuted}
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Endereço</Text>
          <TextInput
            placeholder="Rua, Número, Bairro ..."
            placeholderTextColor={colors.textMuted}
            style={styles.fieldInput}
            value={address}
            onChangeText={setAddress}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Valor do Contrato (R$)</Text>
          <TextInput
            placeholder="Apenas números"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={styles.fieldInput}
            value={value}
            onChangeText={setValue}
          />
        </View>

        <View style={styles.fieldBlock}>
          <AppDatePicker
            label="Data de Início"
            value={startDate}
            onChange={setStartDate}
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveButton, (loading || pressed) && styles.buttonPressed]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Salvar Alterações</Text>}
        </Pressable>
      </ScrollView>
    </AnimatedModal>
  );
}

/**
 * Tela de Configuracoes: Dashboard operacional e ambiente técnico.
 * Exibe resumo de todos os modulos e permite edicao do projeto ao proprietario.
 */
export function SettingsScreen() {
  const { signOut, isConfigured, user } = useAuth();
  const { fullName, occupationLabel, avatarUrl, isOwner } = useProfile();
  const { project } = useProject();
  const updateProject = useUpdateProject();
  const { employees } = useTeam();
  const { stages } = useStages();
  const { payments } = usePayments();
  const { updates } = useUpdates();
  const { documents } = useDocuments();

  const [editModalOpen, setEditModalOpen] = useState(false);

  // Consolida contadores de todos os modulos para o resumo.
  const activeEmployees = employees.filter((employee) => employee.status === "ativo").length;
  const pendingPayments = payments.filter((payment) => payment.status === "pendente" || payment.status === "em_analise").length;
  const openStages = stages.filter((stage) => stage.status !== "concluido").length;
  const approvedUpdates = updates.filter((update) => update.approved).length;
  const configuredModules = [
    { label: "Equipe", value: `${activeEmployees} ativos` },
    { label: "Crono", value: `${openStages} etapas abertas` },
    { label: "Pagamentos", value: `${pendingPayments} pendências` },
    { label: "Atualizações", value: `${approvedUpdates}/${updates.length} aprovadas` },
    { label: "Documentos", value: `${documents.length} arquivos` },
    { label: "Presença", value: "Controle diário liberado" },
  ];

  const handleSignOut = () => {
    Alert.alert("Sair da conta?", "Você será desconectado deste aparelho.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  /**
   * Dispara a mutation de atualizacao do projeto no Supabase.
   */
  const handleUpdateProject = async (payload: any) => {
    try {
      await updateProject.mutateAsync(payload);
      setEditModalOpen(false);
      Toast.show({
        type: "success",
        text1: "Projeto atualizado",
        text2: "As alterações foram salvas com sucesso.",
      });
    } catch (error) {
      Alert.alert("Erro ao atualizar", error instanceof Error ? error.message : "Erro desconhecido");
    }
  };

  return (
    <AppScreen title="Configurações" subtitle="Visão geral do ambiente, da conta ativa e do estado operacional do app.">
      <SectionCard title="Conta ativa" subtitle="Informações da sessão autenticada neste aparelho.">
        <View style={styles.accountRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{buildInitials(fullName)}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{fullName}</Text>
            <Text style={styles.accountMeta}>{user?.email ?? "nenhuma sessão ativa"}</Text>
            <Text style={styles.accountMeta}>Perfil: {occupationLabel}</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Ambiente"
        subtitle={isConfigured ? "O app encontrou as variáveis públicas do Supabase." : "Faltam variáveis EXPO_PUBLIC_ no .env."}
      >
        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <Text style={styles.rowLabel}>Supabase: {isConfigured ? "Configurado" : "Pendente"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.rowLabel}>Obra vinculada: {project?.name?.trim() || "Ainda não configurada"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.rowLabel}>Endereço: {project?.address?.trim() || "Não informado"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.rowLabel}>Contrato: {formatMoney(project?.total_contract_value ?? null)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.rowLabel}>Início da obra: {project?.start_date || "Não informado"}</Text>
          </View>

          {isOwner ? (
            <Pressable
              style={({ pressed }) => [styles.editInlineButton, pressed && styles.buttonPressed]}
              onPress={() => setEditModalOpen(true)}
            >
              <Text style={styles.editInlineButtonText}>Configurar dados da obra</Text>
            </Pressable>
          ) : null}
        </View>
      </SectionCard>

      <SectionCard title="Módulos ativos" subtitle="Resumo rápido do que já está operacional neste projeto.">
        <View style={styles.moduleGrid}>
          {configuredModules.map((module) => (
            <View key={module.label} style={styles.moduleCard}>
              <Text style={styles.moduleTitle}>{module.label}</Text>
              <Text style={styles.moduleValue}>{module.value}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Navegação principal" subtitle="Atalhos que hoje fazem parte da operação base do app.">
        <View style={styles.moduleList}>
          {primaryModules.map((module) => (
            <View key={module.key} style={styles.moduleListRow}>
              <AppIcon name={module.icon} size={18} color={colors.primary} />
              <Text style={styles.moduleListLabel}>{module.label}</Text>
            </View>
          ))}
          {isOwner ? (
            <Text style={styles.helperText}>Como proprietário, você também acessa Documentos, Presença e Configurações pelo menu lateral.</Text>
          ) : (
            <Text style={styles.helperText}>Como funcionario, o menu lateral mostra apenas as areas liberadas para a sua operacao.</Text>
          )}
        </View>
      </SectionCard>

      <Pressable onPress={handleSignOut} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Sair</Text>
      </Pressable>

      <EditProjectModal
        project={project}
        visible={editModalOpen}
        loading={updateProject.isPending}
        onClose={() => setEditModalOpen(false)}
        onSave={handleUpdateProject}
      />
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
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  editInlineButton: {
    marginTop: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  editInlineButtonText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 14,
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
  helperTextSmall: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  button: {
    backgroundColor: colors.text,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: colors.surface,
    fontWeight: "700",
    fontSize: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 28, 23, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  closeIcon: {
    fontSize: 28,
    color: colors.textMuted,
  },
  modalContent: {
    gap: 16,
  },
  fieldBlock: {
    marginBottom: 16,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  fieldInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  saveButtonText: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 16,
  },
});
