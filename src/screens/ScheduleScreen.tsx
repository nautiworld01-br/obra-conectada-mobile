import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "../config/theme";
import { StageRow, StageStatus, useDeleteStage, useStages, useUpsertStage } from "../hooks/useStages";
import { ScheduleStatusScreen } from "./ScheduleStatusScreen";

/**
 * Opcoes de status para as etapas do cronograma.
 */
const statusOptions: { value: StageStatus; label: string }[] = [
  { value: "nao_iniciado", label: "Nao Iniciado" },
  { value: "em_andamento", label: "Em Andamento" },
  { value: "concluido", label: "Concluido" },
  { value: "atrasado", label: "Atrasado" },
  { value: "bloqueado", label: "Bloqueado" },
];

/**
 * Retorna as cores tematicas baseadas no status da etapa.
 * future_fix: Centralizar estas configuracoes de cores no theme.ts se crescer muito.
 */
function getStageStatusColors(status: StageStatus) {
  switch (status) {
    case "concluido":
      return {
        cardBackground: "#edf8f0",
        pillBackground: "#d7efdf",
        pillText: colors.success,
      };
    case "em_andamento":
      return {
        cardBackground: "#eef2ff",
        pillBackground: "#dde6ff",
        pillText: "#4169e1",
      };
    case "atrasado":
      return {
        cardBackground: "#fff0eb",
        pillBackground: "#ffdcd1",
        pillText: colors.danger,
      };
    case "bloqueado":
      return {
        cardBackground: "#f1efe9",
        pillBackground: "#e1ddd4",
        pillText: colors.textMuted,
      };
    case "nao_iniciado":
    default:
      return {
        cardBackground: colors.surface,
        pillBackground: "#f3efe8",
        pillText: colors.textMuted,
      };
  }
}

const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const monthLabels = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho", 
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

/**
 * Converte data ISO (AAAA-MM-DD) para exibicao brasileira (DD/MM/AAAA).
 */
function toDisplayDate(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Converte data brasileira (DD/MM/AAAA) para formato ISO (AAAA-MM-DD).
 */
function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [day, month, year] = trimmed.split("/");
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Converte string ISO para objeto Date.
 */
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

/**
 * Constroi a grade de dias para o componente de calendario customizado.
 */
function buildMonthGrid(currentMonthDate: Date) {
  const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 35 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      iso: isoDate(date),
      dayNumber: date.getDate(),
      currentMonth: date.getMonth() === currentMonthDate.getMonth(),
    };
  });
}

/**
 * Formulario para criacao e edicao de etapas da obra.
 * future_fix: Adicionar campo de 'Percentual Manual' se o proprietario quiser sobrepor o calculo automatico.
 */
function StageForm({
  stage,
  visible,
  loading,
  deleting,
  onClose,
  onDelete,
  onSave,
}: {
  stage: StageRow | null;
  visible: boolean;
  loading: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSave: (payload: {
    name: string;
    category: string;
    responsible: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    observations: string;
    status: StageStatus;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [category, setCategory] = useState(stage?.category ?? "");
  const [responsible, setResponsible] = useState(stage?.responsible ?? "");
  const [plannedStart, setPlannedStart] = useState(toDisplayDate(stage?.planned_start ?? null));
  const [plannedEnd, setPlannedEnd] = useState(toDisplayDate(stage?.planned_end ?? null));
  const [status, setStatus] = useState<StageStatus>(stage?.status ?? "nao_iniciado");
  const [observations, setObservations] = useState(stage?.observations ?? "");
  const [statusOpen, setStatusOpen] = useState(false);
  const [activeDateField, setActiveDateField] = useState<"plannedStart" | "plannedEnd" | null>(null);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());
  const [localError, setLocalError] = useState<string | null>(null);

  // Reinicia os campos quando o modal abre para garantir dados atualizados.
  useEffect(() => {
    setName(stage?.name ?? "");
    setCategory(stage?.category ?? "");
    setResponsible(stage?.responsible ?? "");
    setPlannedStart(toDisplayDate(stage?.planned_start ?? null));
    setPlannedEnd(toDisplayDate(stage?.planned_end ?? null));
    setStatus(stage?.status ?? "nao_iniciado");
    setObservations(stage?.observations ?? "");
    setStatusOpen(false);
    setActiveDateField(null);
    setDatePickerMonth(toDate(stage?.planned_start ?? null));
    setLocalError(null);
  }, [stage, visible]);

  const statusLabel = statusOptions.find((option) => option.value === status)?.label ?? "Nao Iniciado";
  const monthGrid = useMemo(() => buildMonthGrid(datePickerMonth), [datePickerMonth]);
  const monthLabel = `${monthLabels[datePickerMonth.getMonth()]} ${datePickerMonth.getFullYear()}`;

  const openDatePicker = (field: "plannedStart" | "plannedEnd") => {
    const currentValue = field === "plannedStart" ? toIsoDate(plannedStart) : toIsoDate(plannedEnd);
    setDatePickerMonth(toDate(currentValue));
    setActiveDateField(field);
  };

  const applyDate = (iso: string) => {
    const display = toDisplayDate(iso);
    if (activeDateField === "plannedStart") setPlannedStart(display);
    if (activeDateField === "plannedEnd") setPlannedEnd(display);
    setActiveDateField(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setLocalError("Informe o nome da etapa.");
      return;
    }
    await onSave({
      name: name.trim(),
      category: category.trim(),
      responsible: responsible.trim(),
      plannedStart: toIsoDate(plannedStart),
      plannedEnd: toIsoDate(plannedEnd),
      observations: observations.trim(),
      status,
    });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{stage ? "Editar Etapa" : "Nova Etapa"}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Nome *</Text>
              <TextInput style={[styles.fieldInput, styles.primaryInput]} value={name} onChangeText={setName} />
            </View>

            <View style={styles.row}>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Categoria</Text>
                <TextInput style={styles.fieldInput} value={category} onChangeText={setCategory} />
              </View>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Responsavel</Text>
                <TextInput style={styles.fieldInput} value={responsible} onChangeText={setResponsible} />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Inicio Previsto</Text>
                <Pressable style={styles.dateField} onPress={() => openDatePicker("plannedStart")}>
                  <Text style={plannedStart ? styles.dateFieldText : styles.dateFieldPlaceholder}>
                    {plannedStart || "dd/mm/aaaa"}
                  </Text>
                  <Text style={styles.dateFieldIcon}>◫</Text>
                </Pressable>
              </View>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Fim Previsto</Text>
                <Pressable style={styles.dateField} onPress={() => openDatePicker("plannedEnd")}>
                  <Text style={plannedEnd ? styles.dateFieldText : styles.dateFieldPlaceholder}>
                    {plannedEnd || "dd/mm/aaaa"}
                  </Text>
                  <Text style={styles.dateFieldIcon}>◫</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.statusFieldWrap}>
                <Pressable style={styles.selectField} onPress={() => setStatusOpen((current) => !current)}>
                  <Text style={styles.selectFieldText}>{statusLabel}</Text>
                  <Text style={styles.selectFieldArrow}>{statusOpen ? "˄" : "˅"}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Observacoes</Text>
              <TextInput
                multiline
                style={[styles.fieldInput, styles.textArea]}
                value={observations}
                onChangeText={setObservations}
              />
            </View>

            {localError ? <Text style={styles.localError}>{localError}</Text> : null}

            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={() => void handleSave()}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>{stage ? "Salvar Alteracoes" : "Criar Etapa"}</Text>}
            </Pressable>

            {stage ? (
              <Pressable style={({ pressed }) => [styles.deleteButton, (deleting || pressed) && styles.buttonPressed]} onPress={onDelete}>
                {deleting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.deleteButtonText}>Excluir Etapa</Text>}
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>

      {/* Dropdown de Status como Modal */}
      <Modal transparent animationType="fade" visible={statusOpen} onRequestClose={() => setStatusOpen(false)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setStatusOpen(false)}>
          <Pressable style={styles.dropdownModalCard} onPress={() => undefined}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.dropdownModalContent}>
              {statusOptions.map((option) => {
                const active = option.value === status;
                return (
                  <Pressable key={option.value} style={({ pressed }) => [styles.dropdownItem, active && styles.dropdownItemActive, pressed && styles.buttonPressed]} onPress={() => { setStatus(option.value); setStatusOpen(false); }}>
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{active ? "✓  " : "   "}{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Calendario Customizado */}
      <Modal transparent animationType="fade" visible={Boolean(activeDateField)} onRequestClose={() => setActiveDateField(null)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setActiveDateField(null)}>
          <Pressable style={styles.calendarModalCard} onPress={() => undefined}>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarArrowButton} onPress={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><Text style={styles.calendarArrowText}>‹</Text></Pressable>
              <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
              <Pressable style={styles.calendarArrowButton} onPress={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><Text style={styles.calendarArrowText}>›</Text></Pressable>
            </View>
            <View style={styles.calendarWeekHeader}>{weekLabels.map((label) => (<Text key={label} style={styles.calendarWeekLabel}>{label}</Text>))}</View>
            <View style={styles.calendarGrid}>
              {monthGrid.map((cell) => {
                const activeIso = activeDateField === "plannedStart" ? toIsoDate(plannedStart) : toIsoDate(plannedEnd);
                const todayIso = isoDate(new Date());
                const selected = activeIso === cell.iso;
                const suggested = !activeIso && todayIso === cell.iso;
                return (
                  <Pressable key={cell.key} style={({ pressed }) => [styles.calendarDay, selected && styles.calendarDaySelected, suggested && styles.calendarDaySuggested, pressed && styles.buttonPressed]} onPress={() => applyDate(cell.iso)}>
                    <Text style={[styles.calendarDayText, !cell.currentMonth && styles.calendarDayOutside, selected && styles.calendarDayTextSelected, suggested && styles.calendarDayTextSuggested]}>{cell.dayNumber}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.calendarFooter}>
              <Pressable style={({ pressed }) => [styles.calendarClearButton, pressed && styles.buttonPressed]} onPress={() => { if (activeDateField === "plannedStart") setPlannedStart(""); if (activeDateField === "plannedEnd") setPlannedEnd(""); setActiveDateField(null); }}>
                <Text style={styles.calendarClearText}>Limpar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

/**
 * Tela principal do Cronograma: Listagem e resumo de etapas da obra.
 * future_fix: Adicionar filtros por categoria ou responsavel.
 */
export function ScheduleScreen() {
  const { project, stages, isLoading } = useStages();
  const upsertStage = useUpsertStage();
  const deleteStage = useDeleteStage();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageRow | null>(null);
  const [activeFilter, setActiveFilter] = useState<StageStatus | null>(null);

  // Calcula estatisticas gerais do cronograma para os cards de sumario.
  const summary = useMemo(() => {
    const total = stages.length;
    const completed = stages.filter((stage) => stage.status === "concluido").length;
    const inProgress = stages.filter((stage) => stage.status === "em_andamento").length;
    const delayed = stages.filter((stage) => stage.status === "atrasado").length;
    const overallPercent = total > 0 ? Math.round(stages.reduce((sum, stage) => sum + (stage.percent_complete ?? 0), 0) / total) : 0;
    return { total, completed, inProgress, delayed, overallPercent };
  }, [stages]);

  const handleOpenNew = () => { setSelectedStage(null); setFormOpen(true); };
  const handleOpenEdit = (stage: StageRow) => { setSelectedStage(stage); setFormOpen(true); };

  // Se houver um filtro de status ativo, redireciona para a tela de status filtrado.
  if (activeFilter) {
    return (
      <ScheduleStatusScreen
        status={activeFilter}
        title={statusOptions.find((option) => option.value === activeFilter)?.label ?? "Etapas"}
        onBack={() => setActiveFilter(null)}
        onOpenStage={(stage) => { setActiveFilter(null); setSelectedStage(stage); setFormOpen(true); }}
      />
    );
  }

  const handleSave = async (payload: any) => {
    if (!project?.id) {
      Alert.alert("Casa não configurada", "Configure a casa antes de criar etapas no cronograma.");
      return;
    }
    try {
      await upsertStage.mutateAsync({ id: selectedStage?.id, projectId: project.id, ...payload });
      setFormOpen(false);
      setSelectedStage(null);
    } catch (error) {
      Alert.alert("Erro ao salvar", error instanceof Error ? error.message : "Não foi possível salvar a etapa.");
    }
  };

  const handleDelete = () => {
    if (!project?.id || !selectedStage) return;
    Alert.alert("Excluir etapa?", "Essa etapa sera removida do cronograma.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => { void deleteStage.mutateAsync({ id: selectedStage.id, projectId: project.id }).then(() => { setFormOpen(false); setSelectedStage(null); }); } },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Cronograma</Text>
          <Text style={styles.subtitle}>Acompanhamento das etapas</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.newButton, pressed && styles.buttonPressed]} onPress={handleOpenNew}><Text style={styles.newButtonText}>+ Nova</Text></Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Carregando etapas...</Text></View>
      ) : stages.length === 0 ? (
        <View style={styles.emptyState}><Text style={styles.emptyIcon}>⌂</Text><Text style={emptyText}>Nenhuma etapa cadastrada ainda. Adicione as etapas da sua obra.</Text></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.summaryRow}>
            {[
              { label: "Total", value: summary.total, status: null },
              { label: "Concluidas", value: summary.completed, status: "concluido" as StageStatus },
              { label: "Andamento", value: summary.inProgress, status: "em_andamento" as StageStatus },
              { label: "Atrasadas", value: summary.delayed, status: "atrasado" as StageStatus },
            ].map((item) => (
              <Pressable key={item.label} style={({ pressed }) => [styles.summaryCard, pressed && item.status && styles.buttonPressed]} onPress={() => { if (item.status) setActiveFilter(item.status); }}>
                <Text style={styles.summaryValue}>{item.value}</Text>
                <Text style={styles.summaryLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}><Text style={styles.progressTitle}>Progresso Geral</Text><Text style={styles.progressPercent}>{summary.overallPercent}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${summary.overallPercent}%` }]} /></View>
          </View>
          <View style={styles.stageList}>
            {stages.map((stage) => {
              const statusColors = getStageStatusColors(stage.status);
              return (
                <Pressable key={stage.id} style={({ pressed }) => [styles.stageCard, { backgroundColor: statusColors.cardBackground }, pressed && styles.buttonPressed]} onPress={() => handleOpenEdit(stage)}>
                  <View style={styles.stageHeader}>
                    <View style={styles.stageCopy}><Text style={styles.stageName}>{stage.name}</Text><Text style={styles.stageMeta}>{stage.category || "Sem categoria"} • {stage.responsible || "Sem responsavel"}</Text></View>
                    <View style={[styles.stageStatusPill, { backgroundColor: statusColors.pillBackground }]}><Text style={[styles.stageStatusText, { color: statusColors.pillText }]}>{statusOptions.find(o => o.value === stage.status)?.label}</Text></View>
                  </View>
                  <View style={styles.progressHeader}><Text style={styles.stageDates}>Prev: {stage.planned_start || "—"} → {stage.planned_end || "—"}</Text><Text style={styles.stagePercent}>{stage.percent_complete ?? 0}%</Text></View>
                  <View style={styles.stageProgressTrack}><View style={[styles.stageProgressFill, { width: `${stage.percent_complete ?? 0}%` }]} /></View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
      <StageForm stage={selectedStage} visible={formOpen} loading={upsertStage.isPending} deleting={deleteStage.isPending} onClose={() => { setFormOpen(false); setSelectedStage(null); }} onDelete={handleDelete} onSave={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 2, fontSize: 13, color: colors.textMuted },
  newButton: { borderRadius: 12, backgroundColor: "#d97b00", paddingHorizontal: 16, paddingVertical: 12 },
  newButtonText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: colors.textMuted },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 32, color: "#c7ccd5" },
  emptyText: { textAlign: "center", color: "#4f6185", fontSize: 16, lineHeight: 23 },
  content: { paddingTop: 16, paddingBottom: 32, gap: 14 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: 14, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 24, fontWeight: "800", color: "#1d3159" },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  progressCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  progressPercent: { fontSize: 14, fontWeight: "800", color: colors.text },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: "#efe6dc", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#d8a16f" },
  stageList: { gap: 10 },
  stageCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  stageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  stageCopy: { flex: 1, gap: 2 },
  stageName: { fontSize: 18, fontWeight: "700", color: colors.text },
  stageMeta: { fontSize: 12, color: "#4f6185" },
  stageStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stageStatusText: { fontSize: 12, fontWeight: "700" },
  stageDates: { fontSize: 12, color: colors.textMuted },
  stagePercent: { fontSize: 12, fontWeight: "800", color: colors.text },
  stageProgressTrack: { height: 8, borderRadius: 999, backgroundColor: "#efe6dc", overflow: "hidden" },
  stageProgressFill: { height: "100%", borderRadius: 999, backgroundColor: "#d8a16f" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(31, 28, 23, 0.42)", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 8 },
  modalCard: { width: "100%", maxHeight: "84%", backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text },
  closeIcon: { fontSize: 24, color: colors.textMuted, marginLeft: 12 },
  modalContent: { gap: 14, paddingBottom: 8 },
  fieldBlock: { gap: 8 },
  row: { flexDirection: "row", gap: 10 },
  halfField: { flex: 1 },
  fieldLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12, color: colors.text, fontSize: 15 },
  dateField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12 },
  dateFieldText: { color: colors.text, fontSize: 15 },
  dateFieldPlaceholder: { color: colors.textMuted, fontSize: 15 },
  dateFieldIcon: { color: colors.textMuted, fontSize: 15 },
  primaryInput: { borderWidth: 2, borderColor: "#d97b00" },
  selectField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12 },
  selectFieldText: { color: colors.text, fontSize: 15 },
  selectFieldArrow: { color: colors.textMuted, fontSize: 18 },
  statusFieldWrap: { position: "relative", zIndex: 30 },
  dropdownModalBackdrop: { flex: 1, backgroundColor: "rgba(31, 28, 23, 0.12)", justifyContent: "center", paddingHorizontal: 20 },
  dropdownModalCard: { maxHeight: 260, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, overflow: "hidden", shadowColor: "#000000", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  dropdownModalContent: { paddingVertical: 6 },
  calendarModalCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, padding: 14, shadowColor: "#000000", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  calendarArrowButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.surfaceMuted },
  calendarArrowText: { color: colors.text, fontSize: 20 },
  calendarMonthLabel: { fontSize: 16, fontWeight: "800", color: colors.text, textTransform: "lowercase" },
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
  calendarClearButton: { paddingHorizontal: 10, paddingVertical: 8 },
  calendarClearText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 12 },
  dropdownItemActive: { backgroundColor: "#f1f2f7" },
  dropdownItemText: { color: colors.text, fontSize: 15 },
  dropdownItemTextActive: { fontWeight: "700" },
  textArea: { minHeight: 92, textAlignVertical: "top" },
  localError: { color: colors.danger, fontSize: 13 },
  primaryButton: { borderRadius: 14, backgroundColor: "#d97b00", paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  deleteButton: { borderRadius: 14, backgroundColor: colors.text, paddingVertical: 14, alignItems: "center" },
  deleteButtonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  buttonPressed: { opacity: 0.82 },
});
