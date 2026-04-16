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
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
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
      date,
      iso: isoDate(date),
      dayNumber: date.getDate(),
      currentMonth: date.getMonth() === currentMonthDate.getMonth(),
    };
  });
}

/**
 * Formulario para criacao e edicao de etapas da obra.
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
  onSave: (payload: any) => Promise<void>;
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

  useEffect(() => {
    if (visible) {
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
    }
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
            <Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable>
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
                  <Text style={plannedStart ? styles.dateFieldText : styles.dateFieldPlaceholder}>{plannedStart || "dd/mm/aaaa"}</Text>
                  <Text style={styles.dateFieldIcon}>◫</Text>
                </Pressable>
              </View>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Fim Previsto</Text>
                <Pressable style={styles.dateField} onPress={() => openDatePicker("plannedEnd")}>
                  <Text style={plannedEnd ? styles.dateFieldText : styles.dateFieldPlaceholder}>{plannedEnd || "dd/mm/aaaa"}</Text>
                  <Text style={styles.dateFieldIcon}>◫</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Status</Text>
              <Pressable style={styles.selectField} onPress={() => setStatusOpen(true)}>
                <Text style={styles.selectFieldText}>{statusLabel}</Text>
                <Text style={styles.selectFieldArrow}>˅</Text>
              </Pressable>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Observacoes</Text>
              <TextInput multiline style={[styles.fieldInput, styles.textArea]} value={observations} onChangeText={setObservations} />
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

      {/* Modal de Status */}
      <Modal transparent animationType="fade" visible={statusOpen} onRequestClose={() => setStatusOpen(false)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setStatusOpen(false)}>
          <View style={styles.dropdownModalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {statusOptions.map((option) => (
                <Pressable key={option.value} style={styles.dropdownItem} onPress={() => { setStatus(option.value); setStatusOpen(false); }}>
                  <Text style={[styles.dropdownItemText, option.value === status && styles.dropdownItemTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Modal de Calendario */}
      <Modal transparent animationType="fade" visible={Boolean(activeDateField)} onRequestClose={() => setActiveDateField(null)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setActiveDateField(null)}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => setDatePickerMonth(new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() - 1, 1))}><Text style={styles.calendarArrowText}>‹</Text></Pressable>
              <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
              <Pressable onPress={() => setDatePickerMonth(new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() + 1, 1))}><Text style={styles.calendarArrowText}>›</Text></Pressable>
            </View>
            <View style={styles.calendarWeekHeader}>{weekLabels.map(l => <Text key={l} style={styles.calendarWeekLabel}>{l}</Text>)}</View>
            <View style={styles.calendarGrid}>
              {monthGrid.map(cell => (
                <Pressable key={cell.key} style={[styles.calendarDay, cell.iso === (activeDateField === "plannedStart" ? toIsoDate(plannedStart) : toIsoDate(plannedEnd)) && styles.calendarDaySelected]} onPress={() => applyDate(cell.iso)}>
                  <Text style={[styles.calendarDayText, !cell.currentMonth && styles.calendarDayOutside]}>{cell.dayNumber}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

/**
 * Tela principal do Cronograma.
 */
export function ScheduleScreen() {
  const { project, stages, isLoading } = useStages();
  const upsertStage = useUpsertStage();
  const deleteStage = useDeleteStage();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageRow | null>(null);
  const [activeFilter, setActiveFilter] = useState<StageStatus | null>(null);

  const summary = useMemo(() => {
    const total = stages.length;
    const completed = stages.filter((s) => s.status === "concluido").length;
    const inProgress = stages.filter((s) => s.status === "em_andamento").length;
    const delayed = stages.filter((s) => s.status === "atrasado").length;
    const overallPercent = total > 0 ? Math.round(stages.reduce((sum, s) => sum + (s.percent_complete ?? 0), 0) / total) : 0;
    return { total, completed, inProgress, delayed, overallPercent };
  }, [stages]);

  if (activeFilter) {
    return (
      <ScheduleStatusScreen
        status={activeFilter}
        title={statusOptions.find((o) => o.value === activeFilter)?.label ?? "Etapas"}
        onBack={() => setActiveFilter(null)}
        onOpenStage={(s) => { setActiveFilter(null); setSelectedStage(s); setFormOpen(true); }}
      />
    );
  }

  const handleSave = async (payload: any) => {
    if (!project?.id) return;
    try {
      await upsertStage.mutateAsync({ id: selectedStage?.id, projectId: project.id, ...payload });
      setFormOpen(false);
      setSelectedStage(null);
    } catch (e) { Alert.alert("Erro", "Nao foi possivel salvar."); }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.title}>Cronograma</Text><Text style={styles.subtitle}>Acompanhamento das etapas</Text></View>
        <Pressable style={styles.newButton} onPress={() => { setSelectedStage(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Nova</Text></Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Carregando...</Text></View>
      ) : stages.length === 0 ? (
        <View style={styles.emptyState}><Text style={styles.emptyIcon}>⌂</Text><Text style={styles.emptyText}>Nenhuma etapa cadastrada ainda.</Text></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.summaryRow}>
            <Pressable style={styles.summaryCard} onPress={() => {}}><Text style={styles.summaryValue}>{summary.total}</Text><Text style={styles.summaryLabel}>Total</Text></Pressable>
            <Pressable style={styles.summaryCard} onPress={() => setActiveFilter("concluido")}><Text style={styles.summaryValue}>{summary.completed}</Text><Text style={styles.summaryLabel}>Concluidas</Text></Pressable>
            <Pressable style={styles.summaryCard} onPress={() => setActiveFilter("em_andamento")}><Text style={styles.summaryValue}>{summary.inProgress}</Text><Text style={styles.summaryLabel}>Andamento</Text></Pressable>
            <Pressable style={styles.summaryCard} onPress={() => setActiveFilter("atrasado")}><Text style={styles.summaryValue}>{summary.delayed}</Text><Text style={styles.summaryLabel}>Atrasadas</Text></Pressable>
          </View>
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}><Text style={styles.progressTitle}>Progresso Geral</Text><Text style={styles.progressPercent}>{summary.overallPercent}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${summary.overallPercent}%` }]} /></View>
          </View>
          <View style={styles.stageList}>
            {stages.map((s) => {
              const c = getStageStatusColors(s.status);
              return (
                <Pressable key={s.id} style={[styles.stageCard, { backgroundColor: c.cardBackground }]} onPress={() => { setSelectedStage(s); setFormOpen(true); }}>
                  <View style={styles.stageHeader}>
                    <View style={styles.stageCopy}><Text style={styles.stageName}>{s.name}</Text><Text style={styles.stageMeta}>{s.category || "Geral"}</Text></View>
                    <View style={[styles.stageStatusPill, { backgroundColor: c.pillBackground }]}><Text style={[styles.stageStatusText, { color: c.pillText }]}>{statusOptions.find(o => o.value === s.status)?.label}</Text></View>
                  </View>
                  <View style={styles.progressHeader}><Text style={styles.stageDates}>{s.planned_start || "—"} → {s.planned_end || "—"}</Text><Text style={styles.stagePercent}>{s.percent_complete ?? 0}%</Text></View>
                  <View style={styles.stageProgressTrack}><View style={[styles.stageProgressFill, { width: `${s.percent_complete ?? 0}%` }]} /></View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
      <StageForm stage={selectedStage} visible={formOpen} loading={upsertStage.isPending} deleting={deleteStage.isPending} onClose={() => { setFormOpen(false); setSelectedStage(null); }} onDelete={() => {}} onSave={handleSave} />
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
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  emptyIcon: { fontSize: 32, color: "#c7ccd5" },
  emptyText: { textAlign: "center", color: "#4f6185", fontSize: 16 },
  content: { paddingTop: 16, paddingBottom: 32, gap: 14 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: 14, alignItems: "center" },
  summaryValue: { fontSize: 24, fontWeight: "800", color: "#1d3159" },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  progressCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontSize: 14, fontWeight: "700" },
  progressPercent: { fontSize: 14, fontWeight: "800" },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: "#efe6dc", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#d8a16f" },
  stageList: { gap: 10 },
  stageCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  stageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  stageCopy: { flex: 1 },
  stageName: { fontSize: 18, fontWeight: "700" },
  stageMeta: { fontSize: 12, color: "#4f6185" },
  stageStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stageStatusText: { fontSize: 12, fontWeight: "700" },
  stageDates: { fontSize: 12, color: colors.textMuted },
  stagePercent: { fontSize: 12, fontWeight: "800" },
  stageProgressTrack: { height: 8, borderRadius: 999, backgroundColor: "#efe6dc", overflow: "hidden" },
  stageProgressFill: { height: "100%", backgroundColor: "#d8a16f" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(31, 28, 23, 0.42)", justifyContent: "flex-end" },
  modalCard: { width: "100%", height: "85%", backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  closeIcon: { fontSize: 24, color: colors.textMuted },
  modalContent: { gap: 16 },
  fieldBlock: { gap: 8 },
  row: { flexDirection: "row", gap: 10 },
  halfField: { flex: 1 },
  fieldLabel: { fontSize: 15, fontWeight: "600" },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, padding: 12, fontSize: 15 },
  primaryInput: { borderWidth: 2, borderColor: "#d97b00" },
  dateField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 12 },
  dateFieldText: { fontSize: 15 },
  dateFieldPlaceholder: { color: colors.textMuted },
  dateFieldIcon: { fontSize: 15 },
  selectField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 12 },
  selectFieldText: { fontSize: 15 },
  selectFieldArrow: { fontSize: 18, color: colors.textMuted },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  primaryButton: { borderRadius: 14, backgroundColor: "#d97b00", paddingVertical: 14, alignItems: "center", marginTop: 10 },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  deleteButton: { borderRadius: 14, backgroundColor: "#eee", paddingVertical: 14, alignItems: "center", marginTop: 8 },
  deleteButtonText: { fontWeight: "700" },
  localError: { color: colors.danger, fontSize: 13 },
  dropdownModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "center", padding: 20 },
  dropdownModalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 10 },
  dropdownItem: { padding: 15 },
  dropdownItemText: { fontSize: 16 },
  dropdownItemTextActive: { fontWeight: "800", color: colors.primary },
  calendarModalCard: { backgroundColor: "#fff", borderRadius: 20, padding: 20 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  calendarArrowText: { fontSize: 24 },
  calendarMonthLabel: { fontSize: 16, fontWeight: "800" },
  calendarWeekHeader: { flexDirection: "row", justifyContent: "space-between" },
  calendarWeekLabel: { width: "14.28%", textAlign: "center", fontSize: 12 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDay: { width: "14.28%", height: 40, alignItems: "center", justifyContent: "center" },
  calendarDaySelected: { backgroundColor: colors.primarySoft, borderRadius: 20 },
  calendarDayText: { fontSize: 14 },
  calendarDayOutside: { color: "#ccc" },
  buttonPressed: { opacity: 0.8 },
});
