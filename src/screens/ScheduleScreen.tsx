import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { colors } from "../config/theme";
import { Validator } from "../lib/validation";
import { StageRow, StageStatus, useDeleteStage, useStages, useUpsertStage } from "../hooks/useStages";
import { useProject } from "../hooks/useProject";
import { AppIcon } from "../components/AppIcon";
import { AppDatePicker } from "../components/AppDatePicker";

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
    case "concluido": return { cardBackground: colors.successLight, pillBackground: colors.successLight, pillText: colors.success };
    case "em_andamento": return { cardBackground: colors.infoLight, pillBackground: colors.infoLight, pillText: colors.info };
    case "atrasado": return { cardBackground: colors.dangerLight, pillBackground: colors.dangerLight, pillText: colors.danger };
    case "bloqueado": return { cardBackground: colors.surfaceMuted, pillBackground: colors.divider, pillText: colors.textMuted };
    default: return { cardBackground: colors.surface, pillBackground: colors.surfaceMuted, pillText: colors.textMuted };
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
 * Formulario de Etapa: Criacao e edicao de marcos do cronograma.
 */
function StageForm({ stage, visible, loading, deleting, onClose, onSave, onDelete }: any) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [responsible, setResponsible] = useState("");
  const [status, setStatus] = useState<StageStatus>("nao_iniciado");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [percentComplete, setPercentComplete] = useState(0);

  // Sincroniza o rascunho com os dados reais ao abrir para edicao.
  useEffect(() => {
    if (visible) {
      setName(stage?.name ?? "");
      setCategory(stage?.category ?? "");
      setResponsible(stage?.responsible ?? "");
      setStatus(stage?.status ?? "nao_iniciado");
      setPlannedStart(stage?.planned_start ?? "");
      setPlannedEnd(stage?.planned_end ?? "");
      setPercentComplete(stage?.percent_complete ?? 0);
    }
  }, [stage, visible]);

  /**
   * Executa a validacao e dispara o salvamento da etapa.
   * Removida a sugestao automatica de status que sobrescrevia a escolha do usuario.
   */
  const handleInternalSave = () => {
    const nameVal = Validator.required(name, "nome");
    if (!nameVal.isValid) { Alert.alert("Erro", nameVal.error!); return; }

    // Sincroniza Porcentagem com o Status Concluido
    let finalPercent = percentComplete;
    if (status === "concluido") finalPercent = 100;
    if (status === "nao_iniciado" && finalPercent === 100) finalPercent = 0;

    onSave({ 
      name: name.trim(), 
      category, 
      responsible, 
      status, 
      plannedStart: plannedStart || null, 
      plannedEnd: plannedEnd || null, 
      percentComplete: finalPercent
    });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{stage ? "Editar" : "Nova"} Etapa</Text>
            <Pressable onPress={onClose}>
              <AppIcon name="X" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Nome da Etapa *</Text>
              <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholder="Ex: Fundacao" />
            </View>
            
            <View style={styles.fieldBlock}>
              <AppDatePicker 
                label="Início Planejado" 
                value={plannedStart} 
                onChange={setPlannedStart} 
              />
            </View>

            <View style={styles.fieldBlock}>
              <AppDatePicker 
                label="Fim Planejado" 
                value={plannedEnd} 
                onChange={setPlannedEnd} 
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Status Manual</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusPillsRow}>
                {statusOptions.map(opt => (
                  <Pressable 
                    key={opt.value} 
                    style={[styles.statusPillBtn, status === opt.value && styles.statusPillBtnActive]}
                    onPress={() => setStatus(opt.value)}
                  >
                    <Text style={[styles.statusPillBtnText, status === opt.value && styles.statusPillBtnTextActive]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.helperTextSmall}>Estados "Em Andamento" e "Atrasado" sao sugeridos automaticamente por data, mas voce pode forçar "Concluido" ou "Bloqueado".</Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Evolução da Etapa: {percentComplete}%</Text>
              <View style={styles.statusPillsRow}>
                {[0, 25, 50, 75, 100].map(val => (
                  <Pressable 
                    key={val} 
                    style={[styles.statusPillBtn, percentComplete === val && styles.statusPillBtnActive]}
                    onPress={() => setPercentComplete(val)}
                  >
                    <Text style={[styles.statusPillBtnText, percentComplete === val && styles.statusPillBtnTextActive]}>{val}%</Text>
                  </Pressable>
                ))}
              </View>
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
    </Modal>
  );
}

/**
 * Tela de Cronograma: Listagem inteligente com busca e filtros por status.
 * future_fix: Implementar arrastar-e-soltar para reordenar importancia das etapas.
 */
export function ScheduleScreen() {
  const { project } = useProject();
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

    const performDelete = async () => {
      try {
        await deleteStage.mutateAsync({ id: selectedStage.id, projectId: selectedStage.project_id });
        setFormOpen(false);
        setSelectedStage(null);
        Toast.show({ type: "success", text1: "Etapa removida", text2: "O cronograma foi atualizado." });
      } catch (e) {
        Alert.alert("Erro", "Não foi possível excluir a etapa.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Deseja remover esta etapa do cronograma?")) {
        void performDelete();
      }
      return;
    }

    Alert.alert("Excluir?", "Remover esta etapa?", [
      { text: "Não", style: "cancel" },
      { text: "Sim", style: "destructive", onPress: () => void performDelete() }
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}><Text style={styles.title}>Cronograma</Text><Pressable style={styles.newButton} onPress={() => { setSelectedStage(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Nova</Text></Pressable></View>

      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <AppIcon name="Search" size={18} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Buscar etapa..." value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery !== "" && (
            <Pressable onPress={() => setSearchQuery("")}>
              <AppIcon name="XCircle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
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

      <StageForm 
        stage={selectedStage} 
        visible={formOpen} 
        loading={upsertStage.isPending} 
        deleting={deleteStage.isPending} 
        onClose={() => setFormOpen(false)} 
        onSave={(p: any) => upsertStage.mutateAsync({ id: selectedStage?.id, projectId: project?.id, ...p }).then(() => {
          setFormOpen(false);
          Toast.show({ type: "success", text1: "Etapa salva", text2: "O cronograma foi atualizado." });
        })} 
        onDelete={handleDelete} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  newButton: { borderRadius: 12, backgroundColor: colors.secondary, paddingHorizontal: 14, paddingVertical: 12 },
  newButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  filterSection: { marginBottom: 16, gap: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: colors.text },
  filterChips: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  chipTextActive: { color: colors.surface },
  content: { paddingBottom: 32, gap: 12 },
  progressCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  progressPercent: { fontSize: 14, fontWeight: "800", color: colors.text },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.cardBorder, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary },
  stageCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 10 },
  stageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  stageName: { fontSize: 18, fontWeight: "700", color: colors.text },
  stageMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  stageStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stageStatusText: { fontSize: 10, fontWeight: "800" },
  stageProgressTrack: { height: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.05)", overflow: "hidden" },
  stageProgressFill: { height: "100%", backgroundColor: colors.primary },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalContent: { gap: 16 },
  fieldBlock: { gap: 4 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted, color: colors.text },
  statusPillsRow: { gap: 8, paddingVertical: 4 },
  statusPillBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted },
  statusPillBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusPillBtnText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  statusPillBtnTextActive: { color: colors.surface },
  helperTextSmall: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  row: { flexDirection: "row", gap: 10 },
  formActions: { gap: 10, marginTop: 10 },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: colors.surface, fontWeight: "800", fontSize: 15 },
  deleteButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.danger, paddingVertical: 16, alignItems: "center" },
  deleteButtonText: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  buttonPressed: { opacity: 0.8 }
});
