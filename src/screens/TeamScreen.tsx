import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useProfile } from "../hooks/useProfile";
import { TeamEmployeeRole, TeamEmployeeRow, TeamEmployeeStatus, useDeleteEmployee, useTeam, useUpsertEmployee } from "../hooks/useTeam";
import { WorkCrewRow, useDeleteWorkCrew, useUpsertWorkCrew, useWorkCrews } from "../hooks/useWorkCrews";

const roleOptions: { value: TeamEmployeeRole; label: string }[] = [
  { value: "empregada domestica", label: "Empregada domestica" },
  { value: "marinheiro", label: "Marinheiro" },
];

const statusOptions: { value: TeamEmployeeStatus; label: string }[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const monthLabels = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function initialsFromName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "EQ";
  return tokens.slice(0, 2).map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
}

function toDisplayDate(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [day, month, year] = trimmed.split("/");
  if (!day || !month || !year) return null;
  
  const d = parseInt(day);
  const m = parseInt(month);
  const y = parseInt(year);
  
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2020 || y > 2099) return null;
  
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toDate(value: string | null) {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildMonthGrid(currentMonthDate: Date) {
  const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 35 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      iso: isoDate(date),
      dayNumber: date.getDate(),
      currentMonth: date.getMonth() === currentMonthDate.getMonth(),
    };
  });
}

function buildEmployeeDraft(employee?: TeamEmployeeRow | null) {
  return {
    id: employee?.id,
    fullName: employee?.full_name ?? "",
    role: employee?.role ?? "empregada domestica",
    status: employee?.status ?? "ativo",
    photo: employee?.photo ?? "",
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
    plannedStartDate: toDisplayDate(workCrew?.planned_start_date ?? null),
    plannedEndDate: toDisplayDate(workCrew?.planned_end_date ?? null),
    observations: workCrew?.observations ?? "",
  };
}

export function TeamScreen() {
  const { isOwner } = useProfile();
  const { project, employees, isLoading: employeesLoading } = useTeam();
  const { workCrews, isLoading: workCrewsLoading } = useWorkCrews();
  const upsertEmployee = useUpsertEmployee();
  const deleteEmployee = useDeleteEmployee();
  const upsertWorkCrew = useUpsertWorkCrew();
  const deleteWorkCrew = useDeleteWorkCrew();
  const [filter, setFilter] = useState<"todos" | TeamEmployeeStatus>("todos");
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [employeeDraft, setEmployeeDraft] = useState(buildEmployeeDraft());
  const [workCrewFormOpen, setWorkCrewFormOpen] = useState(false);
  const [workCrewDraft, setWorkCrewDraft] = useState(buildWorkCrewDraft());
  const [activeDateField, setActiveDateField] = useState<"plannedStartDate" | "plannedEndDate" | null>(null);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());

  useEffect(() => {
    if (!employeeFormOpen) {
      setRoleMenuOpen(false);
      setStatusMenuOpen(false);
    }
  }, [employeeFormOpen]);

  useEffect(() => {
    if (!workCrewFormOpen) {
      setActiveDateField(null);
    }
  }, [workCrewFormOpen]);

  const summary = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((employee) => employee.status === "ativo").length;
    const inactive = employees.filter((employee) => employee.status === "inativo").length;
    const domestics = employees.filter((employee) => employee.role === "empregada domestica").length;
    const sailors = employees.filter((employee) => employee.role === "marinheiro").length;
    return { total, active, inactive, domestics, sailors };
  }, [employees]);

  const filteredEmployees = useMemo(() => (filter === "todos" ? employees : employees.filter((employee) => employee.status === filter)), [employees, filter]);
  const workCrewSummary = useMemo(() => {
    const total = workCrews.length;
    const totalWorkers = workCrews.reduce((sum, crew) => sum + (crew.average_workers ?? 0), 0);
    const workersAverage = total > 0 ? Math.round(totalWorkers / total) : 0;
    const contractedTotal = workCrews.reduce((sum, crew) => sum + Number(crew.contracted_amount ?? 0), 0);
    return { total, workersAverage, contractedTotal };
  }, [workCrews]);
  const monthGrid = useMemo(() => buildMonthGrid(datePickerMonth), [datePickerMonth]);
  const monthLabel = `${monthLabels[datePickerMonth.getMonth()]} ${datePickerMonth.getFullYear()}`;
  const isLoading = employeesLoading || workCrewsLoading;

  const pickImageFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Galeria", "Permita o acesso a galeria para escolher uma foto.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (result.canceled || !result.assets.length) return null;
    return result.assets[0].uri;
  };

  const handlePickEmployeePhoto = async () => {
    const selectedUri = await pickImageFromGallery();
    if (selectedUri) setEmployeeDraft((current) => ({ ...current, photo: selectedUri }));
  };

  const handlePickWorkCrewPhoto = async () => {
    const selectedUri = await pickImageFromGallery();
    if (selectedUri) setWorkCrewDraft((current) => ({ ...current, photo: selectedUri }));
  };

  const openDatePicker = (field: "plannedStartDate" | "plannedEndDate") => {
    const currentValue = field === "plannedStartDate" ? toIsoDate(workCrewDraft.plannedStartDate) : toIsoDate(workCrewDraft.plannedEndDate);
    setDatePickerMonth(toDate(currentValue));
    setActiveDateField(field);
  };

  const applyDate = (iso: string) => {
    const display = toDisplayDate(iso);
    setWorkCrewDraft((current) => ({
      ...current,
      plannedStartDate: activeDateField === "plannedStartDate" ? display : current.plannedStartDate,
      plannedEndDate: activeDateField === "plannedEndDate" ? display : current.plannedEndDate,
    }));
    setActiveDateField(null);
  };

  const handleSaveEmployee = async () => {
    if (!project?.id) return Alert.alert("Casa", "Configure a casa antes de gerenciar a equipe.");
    if (!isOwner) return Alert.alert("Permissao", "Somente o proprietario pode editar a equipe.");
    if (!employeeDraft.fullName.trim()) return Alert.alert("Equipe", "Informe o nome do funcionario.");
    try {
      await upsertEmployee.mutateAsync({
        id: employeeDraft.id,
        projectId: project.id,
        fullName: employeeDraft.fullName.trim(),
        role: employeeDraft.role,
        status: employeeDraft.status,
        photo: employeeDraft.photo.trim() || null,
      });
      setEmployeeFormOpen(false);
      setEmployeeDraft(buildEmployeeDraft());
    } catch (error) {
      Alert.alert("Erro ao salvar", error instanceof Error ? error.message : "Nao foi possivel salvar o funcionario.");
    }
  };

  const parseAmount = (value: string): number | null => {
    if (!value.trim()) return null;
    let cleaned = value.trim();
    if (cleaned.includes(",") && cleaned.includes(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (cleaned.includes(",")) {
      cleaned = cleaned.replace(",", ".");
    }
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  };

  const handleSaveWorkCrew = async () => {
    if (!project?.id) return Alert.alert("Casa", "Configure a casa antes de cadastrar a equipe da obra.");
    if (!isOwner) return Alert.alert("Permissao", "Somente o proprietario pode editar a equipe da obra.");
    if (!workCrewDraft.companyName.trim()) return Alert.alert("Equipe da obra", "Informe a empresa.");
    const averageWorkersValue = workCrewDraft.averageWorkers.trim() ? Number(workCrewDraft.averageWorkers.replace(",", ".")) : null;
    const contractedAmountValue = parseAmount(workCrewDraft.contractedAmount);
    if (averageWorkersValue != null && (!Number.isFinite(averageWorkersValue) || averageWorkersValue < 0)) return Alert.alert("Equipe da obra", "Informe uma media de funcionarios valida.");
    if (contractedAmountValue != null && (!Number.isFinite(contractedAmountValue) || contractedAmountValue < 0)) return Alert.alert("Equipe da obra", "Informe um valor contratado valido.");
    try {
      await upsertWorkCrew.mutateAsync({
        id: workCrewDraft.id,
        projectId: project.id,
        photo: workCrewDraft.photo.trim() || null,
        companyName: workCrewDraft.companyName.trim(),
        companyContact: workCrewDraft.companyContact.trim() || null,
        responsibleName: workCrewDraft.responsibleName.trim() || null,
        responsibleContact: workCrewDraft.responsibleContact.trim() || null,
        averageWorkers: averageWorkersValue != null ? Math.round(averageWorkersValue) : null,
        contractedAmount: contractedAmountValue,
        plannedStartDate: toIsoDate(workCrewDraft.plannedStartDate),
        plannedEndDate: toIsoDate(workCrewDraft.plannedEndDate),
        observations: workCrewDraft.observations.trim() || null,
      });
      setWorkCrewFormOpen(false);
      setWorkCrewDraft(buildWorkCrewDraft());
    } catch (error) {
      Alert.alert("Erro ao salvar", error instanceof Error ? error.message : "Nao foi possivel salvar a equipe da obra.");
    }
  };

  return (
    <>
      <AppScreen title="Equipe" subtitle="Cadastre, edite e acompanhe os funcionarios da casa e a equipe operacional da obra.">
        <View style={styles.headerBlock}>
          <Text style={styles.headerTitle}>Gestao da equipe</Text>
          <Text style={styles.headerSubtitle}>Funcionarios fixos e equipes da obra ficam separados para manter a operacao organizada.</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}><Text style={styles.summaryValue}>{summary.total}</Text><Text style={styles.summaryLabel}>Total</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryValue}>{summary.active}</Text><Text style={styles.summaryLabel}>Ativos</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryValue}>{summary.inactive}</Text><Text style={styles.summaryLabel}>Inativos</Text></View>
        </View>

        <SectionCard title="Filtros" subtitle="Alterne a visualizacao da equipe de funcionarios por status.">
          <View style={styles.filterRow}>
            {[
              { key: "todos", label: "Todos" },
              { key: "ativo", label: "Ativos" },
              { key: "inativo", label: "Inativos" },
            ].map((item) => {
              const active = filter === item.key;
              return (
                <Pressable key={item.key} style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.buttonPressed]} onPress={() => setFilter(item.key as "todos" | TeamEmployeeStatus)}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard title="Equipe de funcionarios" subtitle={`Empregadas: ${summary.domestics} • Marinheiros: ${summary.sailors}`}>
          <View style={styles.actionRow}>
            <Pressable style={({ pressed }) => [styles.primaryAction, pressed && styles.buttonPressed]} onPress={() => { setEmployeeDraft(buildEmployeeDraft()); setEmployeeFormOpen(true); }}>
              <Text style={styles.primaryActionText}>+ Novo</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Carregando equipe...</Text></View>
          ) : filteredEmployees.length ? (
            <View style={styles.list}>
              {filteredEmployees.map((employee) => {
                const isActive = employee.status === "ativo";
                return (
                  <View key={employee.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.identityRow}>
                        <View style={styles.avatar}>{employee.photo?.trim() ? <Image source={{ uri: employee.photo.trim() }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initialsFromName(employee.full_name)}</Text>}</View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{employee.full_name}</Text>
                          <Text style={styles.cardSubtitle}>{employee.role}</Text>
                        </View>
                      </View>
                      <View style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}>
                        <Text style={[styles.pillText, isActive ? styles.pillTextActive : styles.pillTextInactive]}>{isActive ? "Ativo" : "Inativo"}</Text>
                      </View>
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable style={styles.secondaryAction} onPress={() => { setEmployeeDraft(buildEmployeeDraft(employee)); setEmployeeFormOpen(true); }}><Text style={styles.secondaryActionText}>Editar</Text></Pressable>
                      <Pressable style={styles.secondaryAction} onPress={() => void upsertEmployee.mutateAsync({ id: employee.id, projectId: employee.project_id, fullName: employee.full_name, role: employee.role, photo: employee.photo, status: employee.status === "ativo" ? "inativo" : "ativo" })}><Text style={styles.secondaryActionText}>{isActive ? "Inativar" : "Reativar"}</Text></Pressable>
                      <Pressable style={styles.secondaryAction} onPress={() => {
                        if (!project?.id) return;
                        Alert.alert("Remover funcionario?", "Esse cadastro sera removido da equipe.", [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Remover", style: "destructive", onPress: () => { void deleteEmployee.mutateAsync({ id: employee.id, projectId: project.id }); } },
                        ]);
                      }}><Text style={[styles.secondaryActionText, styles.dangerText]}>Remover</Text></Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : <Text style={styles.emptyText}>Nenhum funcionario encontrado neste filtro.</Text>}
        </SectionCard>

        <SectionCard title="Equipe da obra" subtitle={`Times cadastrados: ${workCrewSummary.total} • Media de pessoas: ${workCrewSummary.workersAverage}`}>
          <View style={styles.actionRow}>
            <Pressable style={({ pressed }) => [styles.primaryAction, pressed && styles.buttonPressed]} onPress={() => { setWorkCrewDraft(buildWorkCrewDraft()); setDatePickerMonth(new Date()); setWorkCrewFormOpen(true); }}>
              <Text style={styles.primaryActionText}>Adicionar</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Carregando equipes da obra...</Text></View>
          ) : workCrews.length ? (
            <View style={styles.list}>
              <View style={styles.summaryWideCard}><Text style={styles.summaryWideLabel}>Valor contratado consolidado</Text><Text style={styles.summaryWideValue}>{formatCurrency(workCrewSummary.contractedTotal)}</Text></View>
              {workCrews.map((workCrew) => (
                <View key={workCrew.id} style={styles.card}>
                  <View style={styles.identityRow}>
                    <View style={styles.avatar}>{workCrew.photo?.trim() ? <Image source={{ uri: workCrew.photo.trim() }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initialsFromName(workCrew.company_name)}</Text>}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{workCrew.company_name}</Text>
                      <Text style={styles.cardSubtitle}>{workCrew.responsible_name?.trim() ? `Responsavel: ${workCrew.responsible_name}` : "Responsavel nao informado"}</Text>
                    </View>
                  </View>
                  <View style={styles.metaGrid}>
                    <View style={styles.metaItem}><Text style={styles.metaLabel}>Contato da empresa</Text><Text style={styles.metaValue}>{workCrew.company_contact || "—"}</Text></View>
                    <View style={styles.metaItem}><Text style={styles.metaLabel}>Contato do responsavel</Text><Text style={styles.metaValue}>{workCrew.responsible_contact || "—"}</Text></View>
                    <View style={styles.metaItem}><Text style={styles.metaLabel}>Media de funcionarios</Text><Text style={styles.metaValue}>{workCrew.average_workers != null ? `${workCrew.average_workers} pessoas` : "—"}</Text></View>
                    <View style={styles.metaItem}><Text style={styles.metaLabel}>Valor contratado</Text><Text style={styles.metaValue}>{formatCurrency(workCrew.contracted_amount)}</Text></View>
                    <View style={styles.metaItem}><Text style={styles.metaLabel}>Inicio previsto</Text><Text style={styles.metaValue}>{toDisplayDate(workCrew.planned_start_date) || "—"}</Text></View>
                    <View style={styles.metaItem}><Text style={styles.metaLabel}>Termino previsto</Text><Text style={styles.metaValue}>{toDisplayDate(workCrew.planned_end_date) || "—"}</Text></View>
                  </View>
                  {workCrew.observations?.trim() ? <Text style={styles.notes}>{workCrew.observations}</Text> : null}
                  <View style={styles.rowActions}>
                    <Pressable style={styles.secondaryAction} onPress={() => { setWorkCrewDraft(buildWorkCrewDraft(workCrew)); setDatePickerMonth(toDate(workCrew.planned_start_date ?? null)); setWorkCrewFormOpen(true); }}><Text style={styles.secondaryActionText}>Editar</Text></Pressable>
                    <Pressable style={styles.secondaryAction} onPress={() => {
                      if (!project?.id) return;
                      Alert.alert("Excluir equipe da obra?", "Esse cadastro sera removido da equipe operacional da obra.", [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Excluir", style: "destructive", onPress: () => { void deleteWorkCrew.mutateAsync({ id: workCrew.id, projectId: project.id }); } },
                      ]);
                    }}><Text style={[styles.secondaryActionText, styles.dangerText]}>Excluir</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : <Text style={styles.emptyText}>Nenhuma equipe da obra cadastrada ainda.</Text>}
        </SectionCard>
      </AppScreen>

      <Modal transparent animationType="fade" visible={employeeFormOpen} onRequestClose={() => setEmployeeFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmployeeFormOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{employeeDraft.id ? "Editar funcionario" : "Novo funcionario"}</Text>
              <Pressable onPress={() => setEmployeeFormOpen(false)}><Text style={styles.closeIcon}>×</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Foto</Text>
                <Pressable style={styles.fieldInput} onPress={() => void handlePickEmployeePhoto()}><Text style={styles.fieldText}>{employeeDraft.photo.trim() ? "Trocar foto" : "Abrir galeria"}</Text></Pressable>
                {employeeDraft.photo.trim() ? <Image source={{ uri: employeeDraft.photo.trim() }} style={styles.previewImage} /> : null}
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Nome *</Text>
                <TextInput style={styles.fieldInput} value={employeeDraft.fullName} onChangeText={(value) => setEmployeeDraft((current) => ({ ...current, fullName: value }))} placeholder="Nome completo" placeholderTextColor={colors.textMuted} />
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Ocupacao</Text>
                <Pressable style={styles.fieldInput} onPress={() => setRoleMenuOpen(true)}><Text style={styles.fieldText}>{roleOptions.find((option) => option.value === employeeDraft.role)?.label ?? "Empregada domestica"}</Text></Pressable>
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Status</Text>
                <Pressable style={styles.fieldInput} onPress={() => setStatusMenuOpen(true)}><Text style={styles.fieldText}>{statusOptions.find((option) => option.value === employeeDraft.status)?.label ?? "Ativo"}</Text></Pressable>
              </View>
              <Pressable style={styles.primarySave} onPress={() => void handleSaveEmployee()}>{upsertEmployee.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primarySaveText}>Salvar funcionario</Text>}</Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={workCrewFormOpen} onRequestClose={() => setWorkCrewFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setWorkCrewFormOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{workCrewDraft.id ? "Editar equipe da obra" : "Nova equipe da obra"}</Text>
              <Pressable onPress={() => setWorkCrewFormOpen(false)}><Text style={styles.closeIcon}>×</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Foto</Text>
                <Pressable style={styles.fieldInput} onPress={() => void handlePickWorkCrewPhoto()}><Text style={styles.fieldText}>{workCrewDraft.photo.trim() ? "Trocar foto" : "Abrir galeria"}</Text></Pressable>
                {workCrewDraft.photo.trim() ? <Image source={{ uri: workCrewDraft.photo.trim() }} style={styles.previewImage} /> : null}
              </View>
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Empresa *</Text><TextInput style={styles.fieldInput} value={workCrewDraft.companyName} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, companyName: value }))} placeholder="Nome da empresa" placeholderTextColor={colors.textMuted} /></View>
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Contato da empresa</Text><TextInput style={styles.fieldInput} value={workCrewDraft.companyContact} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, companyContact: value }))} placeholder="Telefone, email ou outro contato" placeholderTextColor={colors.textMuted} /></View>
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Responsavel</Text><TextInput style={styles.fieldInput} value={workCrewDraft.responsibleName} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, responsibleName: value }))} placeholder="Nome do responsavel" placeholderTextColor={colors.textMuted} /></View>
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Contato do responsavel</Text><TextInput style={styles.fieldInput} value={workCrewDraft.responsibleContact} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, responsibleContact: value }))} placeholder="Telefone ou email" placeholderTextColor={colors.textMuted} /></View>
              <View style={styles.doubleRow}>
                <View style={styles.half}><Text style={styles.fieldLabel}>Media de funcionarios</Text><TextInput style={styles.fieldInput} value={workCrewDraft.averageWorkers} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, averageWorkers: value }))} placeholder="Ex.: 6" placeholderTextColor={colors.textMuted} keyboardType="numeric" /></View>
                <View style={styles.half}><Text style={styles.fieldLabel}>Valor contratado</Text><TextInput style={styles.fieldInput} value={workCrewDraft.contractedAmount} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, contractedAmount: value }))} placeholder="Ex.: 12000" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" /></View>
              </View>
              <View style={styles.doubleRow}>
                <View style={styles.half}><Text style={styles.fieldLabel}>Data de inicio prevista</Text><Pressable style={styles.fieldInput} onPress={() => openDatePicker("plannedStartDate")}><Text style={styles.fieldText}>{workCrewDraft.plannedStartDate || "dd/mm/aaaa"}</Text></Pressable></View>
                <View style={styles.half}><Text style={styles.fieldLabel}>Data de termino prevista</Text><Pressable style={styles.fieldInput} onPress={() => openDatePicker("plannedEndDate")}><Text style={styles.fieldText}>{workCrewDraft.plannedEndDate || "dd/mm/aaaa"}</Text></Pressable></View>
              </View>
              <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Observacoes</Text><TextInput multiline style={[styles.fieldInput, styles.textArea]} value={workCrewDraft.observations} onChangeText={(value) => setWorkCrewDraft((current) => ({ ...current, observations: value }))} placeholder="Anote escopo, condicoes e observacoes importantes..." placeholderTextColor={colors.textMuted} /></View>
              <Pressable style={styles.primarySave} onPress={() => void handleSaveWorkCrew()}>{upsertWorkCrew.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primarySaveText}>Salvar equipe da obra</Text>}</Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={roleMenuOpen} onRequestClose={() => setRoleMenuOpen(false)}>
        <View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setRoleMenuOpen(false)} /><View style={styles.dropdownCard}><ScrollView showsVerticalScrollIndicator={false}>{roleOptions.map((option) => { const active = employeeDraft.role === option.value; return <Pressable key={option.value} style={[styles.dropdownItem, active && styles.dropdownItemActive]} onPress={() => { setEmployeeDraft((current) => ({ ...current, role: option.value })); setRoleMenuOpen(false); }}><Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{option.label}</Text></Pressable>; })}</ScrollView></View></View>
      </Modal>

      <Modal transparent animationType="fade" visible={statusMenuOpen} onRequestClose={() => setStatusMenuOpen(false)}>
        <View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setStatusMenuOpen(false)} /><View style={styles.dropdownCard}><ScrollView showsVerticalScrollIndicator={false}>{statusOptions.map((option) => { const active = employeeDraft.status === option.value; return <Pressable key={option.value} style={[styles.dropdownItem, active && styles.dropdownItemActive]} onPress={() => { setEmployeeDraft((current) => ({ ...current, status: option.value })); setStatusMenuOpen(false); }}><Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{option.label}</Text></Pressable>; })}</ScrollView></View></View>
      </Modal>

      <Modal transparent animationType="fade" visible={Boolean(activeDateField)} onRequestClose={() => setActiveDateField(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveDateField(null)} />
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarArrow} onPress={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><Text style={styles.calendarArrowText}>‹</Text></Pressable>
              <Text style={styles.calendarMonth}>{monthLabel}</Text>
              <Pressable style={styles.calendarArrow} onPress={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><Text style={styles.calendarArrowText}>›</Text></Pressable>
            </View>
            <View style={styles.calendarWeekHeader}>{weekLabels.map((label) => <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>)}</View>
            <View style={styles.calendarGrid}>{monthGrid.map((cell) => { const activeIso = activeDateField === "plannedStartDate" ? toIsoDate(workCrewDraft.plannedStartDate) : toIsoDate(workCrewDraft.plannedEndDate); const todayIso = isoDate(new Date()); const selected = activeIso === cell.iso; const suggested = !activeIso && todayIso === cell.iso; return <Pressable key={cell.key} style={[styles.calendarDay, selected && styles.calendarDaySelected, suggested && styles.calendarDaySuggested]} onPress={() => applyDate(cell.iso)}><Text style={[styles.calendarDayText, !cell.currentMonth && styles.calendarDayOutside, selected && styles.calendarDayTextSelected, suggested && styles.calendarDayTextSuggested]}>{cell.dayNumber}</Text></Pressable>; })}</View>
            <View style={styles.calendarFooter}><Pressable onPress={() => { setWorkCrewDraft((current) => ({ ...current, plannedStartDate: activeDateField === "plannedStartDate" ? "" : current.plannedStartDate, plannedEndDate: activeDateField === "plannedEndDate" ? "" : current.plannedEndDate })); setActiveDateField(null); }}><Text style={styles.clearText}>Limpar</Text></Pressable></View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerBlock: { gap: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  headerSubtitle: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 24, fontWeight: "800", color: colors.text },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterChipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  filterChipTextActive: { color: colors.primary },
  actionRow: { flexDirection: "row", justifyContent: "flex-end" },
  primaryAction: { borderRadius: 14, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 12 },
  primaryActionText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  loadingState: { gap: 10, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  list: { gap: 12 },
  card: { gap: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  identityRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: colors.primarySoft },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontSize: 14, fontWeight: "800", color: colors.primary },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillActive: { backgroundColor: "#e7f4ec" },
  pillInactive: { backgroundColor: "#efe9df" },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: colors.success },
  pillTextInactive: { color: colors.textMuted },
  rowActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryAction: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  secondaryActionText: { fontSize: 13, fontWeight: "700", color: colors.text },
  dangerText: { color: colors.danger },
  emptyText: { fontSize: 14, color: colors.textMuted, lineHeight: 22 },
  summaryWideCard: { gap: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, padding: 14 },
  summaryWideLabel: { fontSize: 13, color: colors.textMuted },
  summaryWideValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { width: "48%", gap: 4 },
  metaLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  metaValue: { fontSize: 14, lineHeight: 20, color: colors.text },
  notes: { fontSize: 14, lineHeight: 21, color: colors.text },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31, 28, 23, 0.24)", paddingHorizontal: 20 },
  modalCard: { width: "100%", maxWidth: 380, maxHeight: "84%", borderRadius: 22, backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text },
  closeIcon: { fontSize: 24, color: colors.textMuted, marginLeft: 12 },
  modalContent: { gap: 14, paddingBottom: 8 },
  fieldBlock: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.text, justifyContent: "center" },
  fieldText: { fontSize: 15, color: colors.text },
  previewImage: { width: 84, height: 84, borderRadius: 18, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  primarySave: { marginTop: 4, borderRadius: 18, paddingVertical: 16, alignItems: "center", backgroundColor: colors.primary },
  primarySaveText: { fontSize: 15, fontWeight: "800", color: colors.surface },
  dropdownCard: { width: "84%", maxWidth: 320, maxHeight: 260, borderRadius: 20, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingVertical: 8 },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, marginHorizontal: 8 },
  dropdownItemActive: { backgroundColor: colors.primarySoft },
  dropdownItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  dropdownItemTextActive: { color: colors.primary, fontWeight: "800" },
  doubleRow: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  textArea: { minHeight: 92, textAlignVertical: "top" },
  calendarCard: { width: "100%", maxWidth: 360, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, padding: 14 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  calendarArrow: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.surfaceMuted },
  calendarArrowText: { color: colors.text, fontSize: 20 },
  calendarMonth: { fontSize: 16, fontWeight: "800", color: colors.text, textTransform: "lowercase" },
  calendarWeekHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  calendarWeekLabel: { width: "14.28%", textAlign: "center", fontSize: 12, color: colors.textMuted },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  calendarDay: { width: "14.28%", minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  calendarDaySelected: { backgroundColor: colors.primarySoft },
  calendarDaySuggested: { borderWidth: 1.5, borderColor: colors.primary },
  calendarDayText: { color: colors.text, fontSize: 14 },
  calendarDayOutside: { color: colors.textMuted },
  calendarDayTextSelected: { color: colors.primary, fontWeight: "800" },
  calendarDayTextSuggested: { color: colors.primary, fontWeight: "700" },
  calendarFooter: { paddingTop: 12, alignItems: "flex-end" },
  clearText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  buttonPressed: { opacity: 0.82 },
});
