import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Toast from "react-native-toast-message";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { AnimatedModal } from "../components/AnimatedModal";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { TeamEmployeeRow, TeamEmployeeStatus, useDeleteEmployee, useTeam, useUpsertEmployee } from "../hooks/useTeam";
import { WorkCrewRow, useDeleteWorkCrew, useUpsertWorkCrew, useWorkCrews } from "../hooks/useWorkCrews";
import { uploadAppMediaIfNeeded } from "../lib/appMedia";
import { EMPLOYEE_ROLE_OPTIONS } from "../lib/teamRoles";
import { AppDatePicker } from "../components/AppDatePicker";
import { AppIcon } from "../components/AppIcon";

function initialsFromName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "OC";
  return tokens.slice(0, 2).map((t) => t[0]?.toUpperCase() ?? "").join("");
}

function buildEmployeeDraft(employee?: TeamEmployeeRow | null) {
  return {
    id: employee?.id || "",
    fullName: employee?.full_name || "",
    role: employee?.role || "",
    photo: employee?.photo || "",
    status: employee?.status || "ativo" as TeamEmployeeStatus,
  };
}

function buildWorkCrewDraft(workCrew?: WorkCrewRow | null) {
  return {
    id: workCrew?.id,
    photo: workCrew?.photo ?? "",
    companyName: workCrew?.company_name ?? "",
    companyContact: workCrew?.company_contact ?? "",
    responsibleName: workCrew?.responsible_name ?? "",
    responsibleContact: workCrew?.responsible_contact ?? "",
    averageWorkers: workCrew?.average_workers != null ? String(workCrew.average_workers) : "",
    contractedAmount: workCrew?.contracted_amount != null ? String(workCrew.contracted_amount) : "",
    plannedStartDate: workCrew?.planned_start_date ?? "",
    plannedEndDate: workCrew?.planned_end_date ?? "",
    observations: workCrew?.observations ?? "",
  };
}

export function TeamScreen() {
  const { user } = useAuth();
  const { isOwner } = useProfile();
  const { project, employees, isLoading } = useTeam();
  const { workCrews, isLoading: crewsLoading } = useWorkCrews();
  
  const upsertEmployee = useUpsertEmployee();
  const deleteEmployee = useDeleteEmployee();
  const upsertWorkCrew = useUpsertWorkCrew();
  const deleteWorkCrew = useDeleteWorkCrew();

  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [employeeDraft, setEmployeeDraft] = useState(buildEmployeeDraft());

  const [workCrewFormOpen, setWorkCrewFormOpen] = useState(false);
  const [workCrewDraft, setWorkCrewDraft] = useState(buildWorkCrewDraft());

  const summary = useMemo(() => {
    const active = employees.filter((e) => e.status === "ativo").length;
    const inactive = employees.filter((e) => e.status === "inativo").length;
    return { active, inactive };
  }, [employees]);

  const workCrewSummary = useMemo(() => {
    const total = workCrews.length;
    const workersAverage = total ? Math.round(workCrews.reduce((sum, c) => sum + (c.average_workers ?? 0), 0) / total) : 0;
    return { total, workersAverage };
  }, [workCrews]);

  const handleSaveWorkCrew = async () => {
    if (!project?.id) return;
    try {
      const averageWorkersValue = workCrewDraft.averageWorkers ? parseFloat(workCrewDraft.averageWorkers) : null;
      const contractedAmountValue = workCrewDraft.contractedAmount ? parseFloat(workCrewDraft.contractedAmount) : null;
      
      await upsertWorkCrew.mutateAsync({
        id: workCrewDraft.id,
        projectId: project.id,
        photo: workCrewDraft.photo,
        companyName: workCrewDraft.companyName.trim(),
        companyContact: workCrewDraft.companyContact.trim() || null,
        responsibleName: workCrewDraft.responsibleName.trim() || null,
        responsibleContact: workCrewDraft.responsibleContact.trim() || null,
        averageWorkers: averageWorkersValue != null ? Math.round(averageWorkersValue) : null,
        contractedAmount: contractedAmountValue,
        plannedStartDate: workCrewDraft.plannedStartDate || null,
        plannedEndDate: workCrewDraft.plannedEndDate || null,
        observations: workCrewDraft.observations.trim() || null,
      });
      setWorkCrewFormOpen(false);
      Toast.show({ type: "success", text1: "Equipe salva" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar equipe da obra.";
      Alert.alert("Erro", message);
    }
  };

  const handleDeleteEmployeeById = async (employee: TeamEmployeeRow) => {
    try {
      await deleteEmployee.mutateAsync({ id: employee.id });
      Toast.show({ type: "success", text1: "Conta excluída" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao excluir conta.";
      Alert.alert("Erro ao excluir conta", message);
    }
  };

  /**
   * Modal de Formulario: Edicao de metadados do funcionario real.
   */
  function EmployeeFormModal() {
    const [fullName, setFullName] = useState("");
    const [role, setRole] = useState("");
    const [status, setStatus] = useState<TeamEmployeeStatus>("ativo");
    const [roleOpen, setRoleOpen] = useState(false);

    // Sincroniza o estado local quando o modal abre ou o rascunho muda
    useEffect(() => {
      if (employeeFormOpen) {
        setFullName(employeeDraft.fullName || "");
        setRole(employeeDraft.role || "");
        setStatus(employeeDraft.status || "ativo");
        setRoleOpen(false);
      }
    }, [employeeFormOpen, employeeDraft]);

    const handleInternalSave = async () => {
      if (!employeeDraft.id) return;
      try {
        await upsertEmployee.mutateAsync({
          id: employeeDraft.id,
          fullName: fullName.trim(),
          role: role.trim() || "Funcionário",
          status,
          photo: employeeDraft.photo
        });
        setEmployeeFormOpen(false);
        Toast.show({ type: "success", text1: "Perfil atualizado" });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Erro desconhecido";
        Alert.alert("Erro ao salvar", `O banco de dados recusou a alteração: ${msg}`);
      }
    };

    return (
      <AnimatedModal visible={employeeFormOpen} onRequestClose={() => setEmployeeFormOpen(false)} position="center" contentStyle={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Editar Perfil</Text>
          <Pressable onPress={() => setEmployeeFormOpen(false)}><AppIcon name="X" size={24} color={colors.textMuted} /></Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Nome Completo</Text>
                <TextInput style={styles.fieldInput} value={fullName} onChangeText={setFullName} />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Classe</Text>
                <View style={[styles.fieldInput, styles.readonlyField]}>
                  <Text style={styles.readonlyFieldText}>Funcionário</Text>
                </View>
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Função</Text>
                <Pressable style={styles.selectField} onPress={() => setRoleOpen(true)}>
                  <Text style={styles.selectFieldText}>
                    {EMPLOYEE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? "Selecione a função"}
                  </Text>
                  <AppIcon name="ChevronDown" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { textAlign: "center" }]}>Status da Conta</Text>
                <View style={styles.row}>
                  <Pressable 
                    style={[
                      styles.pill, 
                      status === "ativo" ? styles.pillActiveGreen : styles.pillInactive, 
                      { flex: 1, paddingVertical: 14 }
                    ]} 
                    onPress={() => setStatus("ativo")}
                  >
                    <Text style={[
                      styles.pillText, 
                      status === "ativo" ? styles.pillTextActiveGreen : styles.pillTextInactive
                    ]}>Ativo</Text>
                  </Pressable>
                  <Pressable 
                    style={[
                      styles.pill, 
                      status === "inativo" ? styles.pillActiveRed : styles.pillInactive, 
                      { flex: 1, paddingVertical: 14 }
                    ]} 
                    onPress={() => setStatus("inativo")}
                  >
                    <Text style={[
                      styles.pillText, 
                      status === "inativo" ? styles.pillTextActiveRed : styles.pillTextInactive
                    ]}>Inativo</Text>
                  </Pressable>
                </View>
              </View>
              <Pressable 
                style={({ pressed }) => [styles.primarySave, pressed && styles.buttonPressed]} 
                onPress={() => void handleInternalSave()}
                disabled={upsertEmployee.isPending}
              >
                {upsertEmployee.isPending ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.primarySaveText}>Salvar Alterações</Text>
                )}
              </Pressable>
        </ScrollView>
        <Modal transparent visible={roleOpen} animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setRoleOpen(false)}>
            <View style={styles.dropdownCard}>
              {EMPLOYEE_ROLE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setRole(option.value);
                    setRoleOpen(false);
                  }}
                >
                  <Text style={styles.dropdownText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </AnimatedModal>
    );
  }

  return (
    <AppScreen title="Equipe" subtitle="Gestão de contas da obra e empreiteiras parceiras.">
      <SectionCard title="Contas de funcionários" subtitle={`Ativos: ${summary.active} • Inativos: ${summary.inactive}`}>
        {isLoading ? (
          <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Carregando equipe...</Text></View>
        ) : employees.length ? (
          <View style={styles.list}>
            {employees.map((employee) => {
              const isActive = employee.status === "ativo";
              return (
                <View key={employee.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.identityRow}>
                    <View style={styles.avatar}>{employee.photo?.trim() ? <Image source={{ uri: employee.photo.trim() }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initialsFromName(employee.full_name)}</Text>}</View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{employee.full_name}</Text>
                        <Text style={styles.cardMeta}>Classe: Funcionário</Text>
                        <Text style={styles.cardSubtitle}>Função: {employee.role}</Text>
                      </View>
                    </View>
                    <View style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}>
                      <Text style={[styles.pillText, isActive ? styles.pillTextActive : styles.pillTextInactive]}>{isActive ? "Ativo" : "Inativo"}</Text>
                    </View>
                  </View>
                  {isOwner && (
                    <View style={styles.rowActions}>
                      <Pressable style={styles.secondaryAction} onPress={() => { setEmployeeDraft(buildEmployeeDraft(employee)); setEmployeeFormOpen(true); }}><Text style={styles.secondaryActionText}>Editar</Text></Pressable>
                      <Pressable style={styles.secondaryAction} onPress={() => {
                        const confirmationMessage =
                          `Excluir a conta de ${employee.full_name}?\n\n` +
                          "Esta ação remove a conta, revoga o acesso ao app e desfaz o vínculo com a obra.";

                        if (Platform.OS === "web") {
                          if (window.confirm(confirmationMessage)) {
                            void handleDeleteEmployeeById(employee);
                          }
                          return;
                        }

                        Alert.alert(
                          "Excluir conta?",
                          "Esta ação remove a conta, revoga o acesso ao app e desfaz o vínculo com a obra.",
                          [
                            { text: "Cancelar", style: "cancel" },
                            {
                              text: "Excluir conta",
                              style: "destructive",
                              onPress: () => void handleDeleteEmployeeById(employee),
                            },
                          ],
                        );
                      }}><Text style={[styles.secondaryActionText, styles.dangerText]}>Excluir conta</Text></Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : <Text style={styles.emptyText}>Nenhuma conta de funcionário encontrada.</Text>}
      </SectionCard>

      <SectionCard title="Equipe da obra" subtitle={`Times: ${workCrewSummary.total} • Média de pessoas: ${workCrewSummary.workersAverage}`}>
        <View style={styles.actionRow}>
          <Pressable style={({ pressed }) => [styles.primaryAction, pressed && styles.buttonPressed]} onPress={() => { setWorkCrewDraft(buildWorkCrewDraft()); setWorkCrewFormOpen(true); }}>
            <Text style={styles.primaryActionText}>+ Nova equipe</Text>
          </Pressable>
        </View>
        {crewsLoading ? <ActivityIndicator color={colors.primary} /> : (
          <View style={styles.list}>
            {workCrews.map((workCrew) => (
              <View key={workCrew.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.identityRow}>
                    <View style={styles.avatar}>{workCrew.photo?.trim() ? <Image source={{ uri: workCrew.photo.trim() }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>EQ</Text>}</View>
                    <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{workCrew.company_name}</Text><Text style={styles.cardSubtitle}>Resp: {workCrew.responsible_name}</Text></View>
                  </View>
                </View>
                {isOwner && (
                  <View style={styles.rowActions}>
                    <Pressable style={styles.secondaryAction} onPress={() => { setWorkCrewDraft(buildWorkCrewDraft(workCrew)); setWorkCrewFormOpen(true); }}><Text style={styles.secondaryActionText}>Editar</Text></Pressable>
                    <Pressable style={styles.secondaryAction} onPress={() => {
                      const performDelete = async () => {
                        if (!project?.id) return;
                        try {
                          await deleteWorkCrew.mutateAsync({ id: workCrew.id, projectId: project.id });
                          Toast.show({ type: "success", text1: "Equipe removida" });
                        } catch (e) { Alert.alert("Erro", "Falha ao remover."); }
                      };
                      if (Platform.OS === "web") { if (window.confirm("Remover equipe?")) void performDelete(); }
                      else { Alert.alert("Excluir?", "Remover equipe?", [{ text: "Não" }, { text: "Sim", style: "destructive", onPress: () => void performDelete() }]); }
                    }}><Text style={[styles.secondaryActionText, styles.dangerText]}>Excluir</Text></Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <EmployeeFormModal />

      <AnimatedModal visible={workCrewFormOpen} onRequestClose={() => setWorkCrewFormOpen(false)} position="center" contentStyle={styles.modalCard}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>Equipe da Obra</Text><Pressable onPress={() => setWorkCrewFormOpen(false)}><AppIcon name="X" size={24} color={colors.textMuted} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Empresa / Equipe *</Text><TextInput style={styles.fieldInput} value={workCrewDraft.companyName} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, companyName: value }))} placeholder="Ex: Empreiteira Silva" placeholderTextColor={colors.textMuted} /></View>
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Responsável</Text><TextInput style={styles.fieldInput} value={workCrewDraft.responsibleName} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, responsibleName: value }))} placeholder="Nome do responsável" placeholderTextColor={colors.textMuted} /></View>
              <View style={styles.fieldBlock}>
                <AppDatePicker label="Início Previsto" value={workCrewDraft.plannedStartDate} onChange={(v) => setWorkCrewDraft(c => ({ ...c, plannedStartDate: v }))} />
              </View>
              <View style={styles.fieldBlock}>
                <AppDatePicker label="Término Previsto" value={workCrewDraft.plannedEndDate} onChange={(v) => setWorkCrewDraft(c => ({ ...c, plannedEndDate: v }))} />
              </View>
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Observações</Text><TextInput multiline style={[styles.fieldInput, styles.textArea]} value={workCrewDraft.observations} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, observations: value }))} placeholder="Anotações..." placeholderTextColor={colors.textMuted} /></View>
              <Pressable style={styles.primarySave} onPress={handleSaveWorkCrew}>{upsertWorkCrew.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primarySaveText}>Salvar Equipe</Text>}</Pressable>
        </ScrollView>
      </AnimatedModal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 10 },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  list: { gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.cardBorder, gap: 14 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  identityRow: { flexDirection: "row", gap: 12, flex: 1 },
  avatar: { width: 44, height: 42, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontSize: 16, fontWeight: "800", color: colors.primary },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  cardSubtitle: { fontSize: 13, color: colors.textMuted },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillActive: { backgroundColor: colors.successLight },
  pillActiveGreen: { backgroundColor: colors.successLight, borderColor: colors.success },
  pillActiveRed: { backgroundColor: colors.dangerLight, borderColor: colors.danger },
  pillInactive: { backgroundColor: colors.surfaceMuted },
  pillText: { fontSize: 11, fontWeight: "800" },
  pillTextActive: { color: colors.success },
  pillTextActiveGreen: { color: colors.success },
  pillTextActiveRed: { color: colors.danger },
  pillTextInactive: { color: colors.textMuted },
  rowActions: { flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 },
  secondaryAction: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  secondaryActionText: { fontSize: 13, fontWeight: "700", color: colors.text },
  dangerText: { color: colors.danger },
  emptyText: { textAlign: "center", color: colors.textMuted, paddingVertical: 30 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 10 },
  primaryAction: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary },
  primaryActionText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxHeight: "90%", backgroundColor: colors.surface, borderRadius: 28, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalContent: { gap: 16 },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted, color: colors.text },
  readonlyField: { justifyContent: "center" },
  readonlyFieldText: { fontSize: 15, color: colors.text },
  selectField: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  selectFieldText: { fontSize: 15, color: colors.text, fontWeight: "600" },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  primarySave: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 10 },
  primarySaveText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  dropdownCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 10, width: "80%", alignSelf: "center" },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dropdownText: { fontSize: 16, fontWeight: "600", color: colors.text },
  buttonPressed: { opacity: 0.8 },
});
