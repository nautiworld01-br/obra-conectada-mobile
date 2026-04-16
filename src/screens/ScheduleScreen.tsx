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
import { Validator } from "../lib/validation";
import { StageRow, StageStatus, useDeleteStage, useStages, useUpsertStage } from "../hooks/useStages";
import { ScheduleStatusScreen } from "./ScheduleStatusScreen";

/**
 * Opções de status permitidas para as etapas da obra.
 */
const statusOptions: { value: StageStatus; label: string }[] = [
  { value: "nao_iniciado", label: "Não Iniciado" },
  { value: "em_andamento", label: "Em Andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "atrasado", label: "Atrasado" },
  { value: "bloqueado", label: "Bloqueado" },
];

/**
 * Define as cores visuais de fundo e destaque baseadas no status da etapa.
 */
function getStageStatusColors(status: StageStatus) {
  switch (status) {
    case "concluido": return { cardBackground: "#edf8f0", pillBackground: "#d7efdf", pillText: colors.success };
    case "em_andamento": return { cardBackground: "#eef2ff", pillBackground: "#dde6ff", pillText: "#4169e1" };
    case "atrasado": return { cardBackground: "#fff0eb", pillBackground: "#ffdcd1", pillText: colors.danger };
    case "bloqueado": return { cardBackground: "#f1efe9", pillBackground: "#e1ddd4", pillText: colors.textMuted };
    default: return { cardBackground: colors.surface, pillBackground: "#f3efe8", pillText: colors.textMuted };
  }
}

/**
 * Formata data ISO para exibicao brasileira.
 */
function toDisplayDate(value: string | null) {
  if (!value) return "";
  const parts = value.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Converte data brasileira para formato de banco ISO.
 */
function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

/**
 * Gera a grade de dias para o componente de calendario customizado.
 */
function buildMonthGrid(currentMonthDate: Date) {
  const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 35 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { key: `${date.getTime()}`, iso: date.toISOString().split("T")[0], dayNumber: date.getDate(), currentMonth: date.getMonth() === currentMonthDate.getMonth() };
  });
}

/**
 * Formulario de Etapa: Criacao e edicao de marcos do cronograma.
 * future_fix: Migrar para seletor de status via BottomSheet para melhor UX em mobile.
 */
function StageForm({ stage, visible, loading, deleting, onClose, onSave, onDelete }: any) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [responsible, setResponsible] = useState("");
  const [status, setStatus] = useState<StageStatus>("nao_iniciado");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [activeField, setActiveField] = useState<"start" | "end" | null>(null);

  // Sincroniza o rascunho com os dados reais ao abrir para edicao.
  useEffect(() => {
    if (visible) {
      setName(stage?.name ?? "");
      setCategory(stage?.category ?? "");
      setResponsible(stage?.responsible ?? "");
      setStatus(stage?.status ?? "nao_iniciado");
      setPlannedStart(stage?.planned_start ? toDisplayDate(stage.planned_start) : "");
      setPlannedEnd(stage?.planned_end ? toDisplayDate(stage.planned_end) : "");
    }
  }, [stage, visible]);

  /**
   * Executa a validacao e dispara o salvamento da etapa.
   */
  const handleInternalSave = () => {
    const nameVal = Validator.required(name, "nome");
    if (!nameVal.isValid) { Alert.alert("Erro", nameVal.error!); return; }
    onSave({ name: name.trim(), category, responsible, status, plannedStart: toIsoDate(plannedStart), plannedEnd: toIsoDate(plannedEnd), percentComplete: stage?.percent_complete ?? 0 });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{stage ? "Editar" : "Nova"} Etapa</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Nome da Etapa *</Text>
            <TextInput style={styles.fieldInput} value={name} onChangeText={setName} />
            <View style={styles.row}>
              <View style={{flex: 1}}><Text style={styles.fieldLabel}>Início</Text><Pressable style={styles.dateField} onPress={() => { setActiveField("start"); setDateOpen(true); }}><Text>{plannedStart || "dd/mm/aaaa"}</Text></Pressable></View>
              <View style={{flex: 1}}><Text style={styles.fieldLabel}>Fim</Text><Pressable style={styles.dateField} onPress={() => { setActiveField("end"); setDateOpen(true); }}><Text>{plannedEnd || "dd/mm/aaaa"}</Text></Pressable></View>
            </View>
            <View style={styles.formActions}>
              <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={handleInternalSave}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar Etapa</Text>}
              </Pressable>
              {stage && (
                <Pressable style={({ pressed }) => [styles.deleteButton, (deleting || pressed) && styles.buttonPressed]} onPress={onDelete}>
                  {deleting ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteButtonText}>Excluir Etapa</Text>}
                </Pressable>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      <Modal transparent visible={dateOpen}><Pressable style={styles.modalBackdrop} onPress={() => setDateOpen(false)}><View style={styles.calendarModalCard}><View style={styles.calendarGrid}>{buildMonthGrid(new Date()).map(cell => (<Pressable key={cell.key} style={styles.calendarDay} onPress={() => { if (activeField === "start") setPlannedStart(toDisplayDate(cell.iso)); else setPlannedEnd(toDisplayDate(cell.iso)); setDateOpen(false); }}><Text>{cell.dayNumber}</Text></Pressable>))}</View></View></Pressable></Modal>
    </Modal>
  );
}

/**
 * Tela de Cronograma: Listagem inteligente com busca e filtros por status.
 * future_fix: Implementar arrastar-e-soltar para reordenar importancia das etapas.
 */
export function ScheduleScreen() {
  const { stages, isLoading } = useStages();
  const upsertStage = useUpsertStage();
  const deleteStage = useDeleteStage();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StageStatus | "todos">("todos");

  /**
   * Filtra as etapas em tempo real baseado no nome e no status selecionado.
   */
  const filteredStages = useMemo(() => {
    return stages.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "todos" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [stages, searchQuery, statusFilter]);

  /**
   * Consolida o progresso geral da obra para o dashboard.
   */
  const summary = useMemo(() => {
    const total = stages.length;
    const completed = stages.filter(s => s.status === "concluido").length;
    const overallPercent = total > 0 ? Math.round(stages.reduce((sum, s) => sum + (s.percent_complete ?? 0), 0) / total) : 0;
    return { total, completed, overallPercent };
  }, [stages]);

  const handleDelete = () => {
    if (!selectedStage) return;
    Alert.alert("Excluir?", "Remover esta etapa?", [
      { text: "Não" },
      { text: "Sim", style: "destructive", onPress: () => deleteStage.mutateAsync({ id: selectedStage.id, projectId: selectedStage.project_id }).then(() => { setFormOpen(false); setSelectedStage(null); }) }
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}><Text style={styles.title}>Cronograma</Text><Pressable style={styles.newButton} onPress={() => { setSelectedStage(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Nova</Text></Pressable></View>

      <View style={styles.filterSection}>
        <View style={styles.searchBar}><Text>🔍</Text><TextInput style={styles.searchInput} placeholder="Buscar etapa..." value={searchQuery} onChangeText={setSearchQuery} />{searchQuery !== "" && <Pressable onPress={() => setSearchQuery("")}><Text style={styles.clearSearch}>×</Text></Pressable>}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {[{value: "todos", label: "Todos"}, ...statusOptions].map(opt => (<Pressable key={opt.value} style={[styles.chip, statusFilter === opt.value && styles.chipActive]} onPress={() => setStatusFilter(opt.value as any)}><Text style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>{opt.label}</Text></Pressable>))}
        </ScrollView>
      </View>

      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}><Text style={styles.progressTitle}>Progresso Geral</Text><Text style={styles.progressPercent}>{summary.overallPercent}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${summary.overallPercent}%` }]} /></View>
          </View>
          {filteredStages.map((s) => {
            const c = getStageStatusColors(s.status);
            return (
              <Pressable key={s.id} style={[styles.stageCard, { backgroundColor: c.cardBackground }]} onPress={() => { setSelectedStage(s); setFormOpen(true); }}>
                <View style={styles.stageHeader}>
                  <View style={{flex: 1}}><Text style={styles.stageName}>{s.name}</Text><Text style={styles.stageMeta}>Prev: {s.planned_start ? toDisplayDate(s.planned_start) : "—"} até {s.planned_end ? toDisplayDate(s.planned_end) : "—"}</Text></View>
                  <View style={[styles.stageStatusPill, { backgroundColor: c.pillBackground }]}><Text style={[styles.stageStatusText, { color: c.pillText }]}>{statusOptions.find(o => o.value === s.status)?.label}</Text></View>
                </View>
                <View style={styles.stageProgressTrack}><View style={[styles.stageProgressFill, { width: `${s.percent_complete ?? 0}%` }]} /></View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <StageForm stage={selectedStage} visible={formOpen} loading={upsertStage.isPending} deleting={deleteStage.isPending} onClose={() => setFormOpen(false)} onSave={(p: any) => upsertStage.mutateAsync({ id: selectedStage?.id, projectId: stages[0]?.project_id, ...p }).then(()=>setFormOpen(false))} onDelete={handleDelete} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  newButton: { borderRadius: 12, backgroundColor: "#d97b00", paddingHorizontal: 14, paddingVertical: 12 },
  newButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  filterSection: { marginBottom: 16, gap: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  clearSearch: { fontSize: 18, color: colors.textMuted, paddingHorizontal: 8 },
  filterChips: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.cardBorder },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  chipTextActive: { color: "#fff" },
  content: { paddingBottom: 32, gap: 12 },
  progressCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontSize: 14, fontWeight: "700" },
  progressPercent: { fontSize: 14, fontWeight: "800" },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: "#efe6dc", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#d8a16f" },
  stageCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 10 },
  stageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  stageName: { fontSize: 18, fontWeight: "700", color: colors.text },
  stageMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  stageStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stageStatusText: { fontSize: 10, fontWeight: "800" },
  stageProgressTrack: { height: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.05)", overflow: "hidden" },
  stageProgressFill: { height: "100%", backgroundColor: "#d8a16f" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  closeIcon: { fontSize: 24, color: colors.textMuted },
  modalContent: { gap: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted },
  dateField: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted },
  row: { flexDirection: "row", gap: 10 },
  formActions: { gap: 10, marginTop: 10 },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  deleteButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.danger, paddingVertical: 16, alignItems: "center" },
  deleteButtonText: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  calendarModalCard: { backgroundColor: "#fff", padding: 20, borderRadius: 20, margin: 20 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDay: { width: "14.28%", height: 40, alignItems: "center", justifyContent: "center" },
  buttonPressed: { opacity: 0.8 }
});
