import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useRooms } from "../hooks/useRooms";
import { AppIcon } from "../components/AppIcon";
import { AppDatePicker } from "../components/AppDatePicker";
import { AnimatedModal } from "../components/AnimatedModal";

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

const sortOptions = [
  { value: "recentes", label: "Mais recentes" },
  { value: "antigos", label: "Mais antigos" },
  { value: "atrasadas", label: "Mais atrasadas" },
  { value: "maior_progresso", label: "Maior progresso" },
  { value: "menor_progresso", label: "Menor progresso" },
] as const;

type StageSortOrder = (typeof sortOptions)[number]["value"];

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

function getStatusCountCardColors(status: StageStatus) {
  switch (status) {
    case "concluido":
      return { backgroundColor: colors.successLight, borderColor: colors.success, textColor: colors.success };
    case "em_andamento":
      return { backgroundColor: colors.infoLight, borderColor: colors.info, textColor: colors.info };
    case "atrasado":
      return { backgroundColor: colors.dangerLight, borderColor: colors.danger, textColor: colors.danger };
    case "bloqueado":
      return { backgroundColor: colors.surfaceMuted, borderColor: colors.textMuted, textColor: colors.textMuted };
    default:
      return { backgroundColor: colors.surface, borderColor: colors.cardBorder, textColor: colors.text };
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

function getStageDelayWeight(stage: StageRow) {
  if (stage.status === "atrasado") return 3;
  if (stage.status === "bloqueado") return 2;
  if (!stage.planned_end) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const plannedEnd = new Date(`${stage.planned_end}T00:00:00`);

  if (Number.isNaN(plannedEnd.getTime())) return 0;
  if (plannedEnd.getTime() < today.getTime() && stage.status !== "concluido") return 1;
  return 0;
}

/**
 * Formulario de Etapa: Criacao e edicao de marcos do cronograma.
 */
function StageForm({ stage, rooms, visible, loading, deleting, onClose, onSave, onDelete }: any) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [responsible, setResponsible] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
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
      setRoomId(stage?.room_id ?? null);
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
      roomId,
      status, 
      plannedStart: plannedStart || null, 
      plannedEnd: plannedEnd || null, 
      percentComplete: finalPercent
    });
  };

  return (
    <AnimatedModal visible={visible} onRequestClose={onClose} position="center" contentStyle={styles.modalCard}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{stage ? "Editar" : "Nova"} Etapa</Text>
        <Pressable onPress={onClose}>
          <AppIcon name="X" size={24} color={colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Nome da Etapa *</Text>
              <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholder="Ex: Fundacao" />
            </View>
            
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Cômodo relacionado</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionChipsRow}>
                <Pressable style={[styles.optionChip, roomId === null && styles.optionChipActive]} onPress={() => setRoomId(null)}>
                  <Text style={[styles.optionChipText, roomId === null && styles.optionChipTextActive]}>Sem cômodo</Text>
                </Pressable>
                {rooms.map((room: { id: string; name: string }) => (
                  <Pressable key={room.id} style={[styles.optionChip, roomId === room.id && styles.optionChipActive]} onPress={() => setRoomId(room.id)}>
                    <Text style={[styles.optionChipText, roomId === room.id && styles.optionChipTextActive]}>{room.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
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
              <Text style={styles.helperTextSmall}>`Concluído` fecha em 100%. `Não Iniciado` volta para 0%. Para usar 100%, selecione `Concluído`.</Text>
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
    </AnimatedModal>
  );
}

/**
 * Tela de Cronograma: Listagem inteligente com busca e filtros por status.
 * future_fix: Implementar arrastar-e-soltar para reordenar importancia das etapas.
 */
export function ScheduleScreen() {
  const { project } = useProject();
  const { rooms } = useRooms();
  const { stages, isLoading } = useStages();
  const upsertStage = useUpsertStage();
  const deleteStage = useDeleteStage();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StageStatus | "todos">("todos");
  const [roomFilter, setRoomFilter] = useState<string | "todos">("todos");
  const [sortOrder, setSortOrder] = useState<StageSortOrder>("recentes");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [roomFilterDropdownOpen, setRoomFilterDropdownOpen] = useState(false);
  const roomNameById = useMemo(
    () => Object.fromEntries(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );

  /**
   * Filtra as etapas em tempo real baseado no nome e no status selecionado.
   */
  const filteredStages = useMemo(() => {
    return [...stages].filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "todos" || s.status === statusFilter;
      const matchRoom = roomFilter === "todos" || s.room_id === roomFilter;
      return matchSearch && matchStatus && matchRoom;
    }).sort((a, b) => {
      if (sortOrder === "atrasadas") {
        const delayWeightComparison = getStageDelayWeight(b) - getStageDelayWeight(a);
        if (delayWeightComparison !== 0) {
          return delayWeightComparison;
        }

        const endDateComparison = (a.planned_end ?? "").localeCompare(b.planned_end ?? "");
        if (endDateComparison !== 0) {
          return endDateComparison;
        }

        return a.name.localeCompare(b.name);
      }

      if (sortOrder === "maior_progresso" || sortOrder === "menor_progresso") {
        const direction = sortOrder === "maior_progresso" ? -1 : 1;
        const progressComparison = ((a.percent_complete ?? 0) - (b.percent_complete ?? 0)) * direction;
        if (progressComparison !== 0) {
          return progressComparison;
        }

        const startDateComparison = (a.planned_start ?? "").localeCompare(b.planned_start ?? "");
        if (startDateComparison !== 0) {
          return startDateComparison * direction;
        }

        return a.name.localeCompare(b.name) * direction;
      }

      const direction = sortOrder === "recentes" ? -1 : 1;
      const primaryA = a.created_at ?? a.planned_start ?? "";
      const primaryB = b.created_at ?? b.planned_start ?? "";
      const primaryComparison = primaryA.localeCompare(primaryB);

      if (primaryComparison !== 0) {
        return primaryComparison * direction;
      }

      const fallbackA = a.planned_start ?? "";
      const fallbackB = b.planned_start ?? "";
      const fallbackComparison = fallbackA.localeCompare(fallbackB);

      if (fallbackComparison !== 0) {
        return fallbackComparison * direction;
      }

      return a.name.localeCompare(b.name) * direction;
    });
  }, [stages, searchQuery, statusFilter, roomFilter, sortOrder]);

  /**
   * Consolida o progresso geral da obra para o dashboard.
   */
  const summary = useMemo(() => {
    const total = stages.length;
    const completed = stages.filter(s => s.status === "concluido").length;
    const overallPercent = total > 0 ? Math.round(stages.reduce((sum, s) => sum + (s.percent_complete ?? 0), 0) / total) : 0;
    const statusCounts = statusOptions.map((option) => ({
      ...option,
      count: stages.filter((stage) => stage.status === option.value).length,
    }));
    return { total, completed, overallPercent, statusCounts };
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
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}><Text style={styles.progressTitle}>Progresso Geral</Text><Text style={styles.progressPercent}>{summary.overallPercent}%</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${summary.overallPercent}%` }]} /></View>
        </View>
        <View style={styles.statusSummaryGrid}>
          <View style={styles.statusSummaryCard}>
            <Text style={styles.statusSummaryCount}>{summary.total}</Text>
            <Text style={styles.statusSummaryLabel}>Total</Text>
          </View>
          {summary.statusCounts.map((item) => {
            const tone = getStatusCountCardColors(item.value);
            return (
              <View
                key={item.value}
                style={[
                  styles.statusSummaryCard,
                  {
                    backgroundColor: tone.backgroundColor,
                    borderColor: tone.borderColor,
                  },
                ]}
              >
                <Text style={[styles.statusSummaryCount, { color: tone.textColor }]}>{item.count}</Text>
                <Text style={[styles.statusSummaryLabel, { color: tone.textColor }]}>{item.label}</Text>
              </View>
            );
          })}
        </View>
        <Pressable style={styles.filtersDropdownButton} onPress={() => {
          setFiltersOpen((current) => !current);
          setRoomFilterDropdownOpen(false);
        }}>
          <View style={styles.filtersDropdownInfo}>
            <AppIcon name="SlidersHorizontal" size={16} color={colors.primary} />
            <Text style={styles.filtersDropdownTitle}>Filtros da lista</Text>
          </View>
          <View style={styles.filtersDropdownBadges}>
            <View style={styles.sortActiveBadge}>
              <AppIcon name="MapPinned" size={12} color={colors.primary} />
              <Text style={styles.sortActiveBadgeText}>
                {roomFilter === "todos" ? "Sem filtro de cômodo" : roomNameById[roomFilter] ?? "Cômodo"}
              </Text>
            </View>
            <View style={styles.sortActiveBadge}>
              <AppIcon name="ArrowUpDown" size={12} color={colors.primary} />
              <Text style={styles.sortActiveBadgeText}>{sortOptions.find((option) => option.value === sortOrder)?.label}</Text>
            </View>
            <AppIcon name={filtersOpen ? "ChevronUp" : "ChevronDown"} size={18} color={colors.textMuted} />
          </View>
        </Pressable>
        {filtersOpen ? (
          <View style={styles.filtersDropdownPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              {[{value: "todos", label: "Todos"}, ...statusOptions].map(opt => (<Pressable key={opt.value} style={[styles.chip, statusFilter === opt.value && styles.chipActive]} onPress={() => setStatusFilter(opt.value as any)}><Text style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>{opt.label}</Text></Pressable>))}
            </ScrollView>
            <View style={styles.sortRow}>
              <View style={styles.sortHeaderRow}>
                <Text style={styles.sortLabel}>Cômodo</Text>
              </View>
              <View style={styles.selectBlock}>
                <Pressable
                  style={({ pressed }) => [styles.selectButton, pressed && styles.buttonPressed]}
                  onPress={() => setRoomFilterDropdownOpen((current) => !current)}
                >
                  <Text style={[styles.selectButtonText, roomFilter === "todos" && styles.selectPlaceholderText]}>
                    {roomFilter === "todos" ? "Selecione um cômodo" : roomNameById[roomFilter] ?? "Cômodo"}
                  </Text>
                  <AppIcon name={roomFilterDropdownOpen ? "ChevronUp" : "ChevronDown"} size={18} color={colors.textMuted} />
                </Pressable>
                {roomFilterDropdownOpen ? (
                  <View style={styles.selectMenu}>
                    <ScrollView nestedScrollEnabled style={styles.selectMenuScroll}>
                      {roomFilter !== "todos" ? (
                        <Pressable
                          style={styles.selectOption}
                          onPress={() => {
                            setRoomFilter("todos");
                            setRoomFilterDropdownOpen(false);
                          }}
                        >
                          <Text style={styles.selectOptionText}>Limpar filtro de cômodo</Text>
                        </Pressable>
                      ) : null}
                      {rooms.map((room) => (
                        <Pressable
                          key={room.id}
                          style={[styles.selectOption, roomFilter === room.id && styles.selectOptionActive]}
                          onPress={() => {
                            setRoomFilter(room.id);
                            setRoomFilterDropdownOpen(false);
                          }}
                        >
                          <Text style={[styles.selectOptionText, roomFilter === room.id && styles.selectOptionTextActive]}>{room.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.sortRow}>
              <View style={styles.sortHeaderRow}>
                <Text style={styles.sortLabel}>Ordenação</Text>
                <View style={styles.sortActiveBadge}>
                  <AppIcon name="ArrowUpDown" size={12} color={colors.primary} />
                  <Text style={styles.sortActiveBadgeText}>{sortOptions.find((option) => option.value === sortOrder)?.label}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                {sortOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, styles.sortChip, sortOrder === option.value && styles.chipActive]}
                    onPress={() => setSortOrder(option.value)}
                  >
                    <Text style={[styles.chipText, sortOrder === option.value && styles.chipTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}
        {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
          <>
          {filteredStages.map((s) => {
            const c = getStageStatusColors(s.status);
            return (
              <Pressable key={s.id} style={[styles.stageCard, { backgroundColor: c.cardBackground }]} onPress={() => { setSelectedStage(s); setFormOpen(true); }}>
                <View style={styles.stageHeader}>
                  <View style={{flex: 1}}>
                    <Text style={styles.stageName}>{s.name}</Text>
                    <Text style={styles.stageMeta}>Prev: {s.planned_start ? toDisplayDate(s.planned_start) : "—"} até {s.planned_end ? toDisplayDate(s.planned_end) : "—"}</Text>
                    {s.room_id ? <Text style={styles.stageMeta}>Cômodo: {roomNameById[s.room_id] ?? "Cômodo removido"}</Text> : null}
                  </View>
                  <View style={[styles.stageStatusPill, { backgroundColor: c.pillBackground }]}><Text style={[styles.stageStatusText, { color: c.pillText }]}>{statusOptions.find(o => o.value === s.status)?.label}</Text></View>
                </View>
                <View style={styles.stageProgressTrack}><View style={[styles.stageProgressFill, { width: `${s.percent_complete ?? 0}%` }]} /></View>
              </Pressable>
            );
          })}
          </>
        )}
      </ScrollView>

      <StageForm 
        stage={selectedStage} 
        rooms={rooms}
        visible={formOpen} 
        loading={upsertStage.isPending} 
        deleting={deleteStage.isPending} 
        onClose={() => setFormOpen(false)} 
        onSave={(p: any) =>
          upsertStage
            .mutateAsync({ id: selectedStage?.id, projectId: project?.id ?? "", ...p })
            .then(() => {
              setFormOpen(false);
              Toast.show({ type: "success", text1: "Etapa salva", text2: "O cronograma foi atualizado." });
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : "Não foi possível salvar a etapa.";
              Alert.alert("Erro", message);
            })
        } 
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
  filtersDropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filtersDropdownInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  filtersDropdownTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  filtersDropdownBadges: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  filtersDropdownPanel: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 12,
  },
  sortRow: { gap: 8 },
  sortHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sortLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  sortActiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sortActiveBadgeText: { fontSize: 11, fontWeight: "800", color: colors.primary },
  sortChip: { minHeight: 34, justifyContent: "center" },
  selectBlock: { position: "relative" },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    gap: 12,
  },
  selectButtonText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
  selectPlaceholderText: { color: colors.textMuted },
  selectMenu: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  selectMenuScroll: { maxHeight: 240 },
  selectOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  selectOptionActive: { backgroundColor: colors.primarySoft },
  selectOptionText: { fontSize: 14, fontWeight: "600", color: colors.text },
  selectOptionTextActive: { color: colors.primary, fontWeight: "800" },
  content: { paddingBottom: 32, gap: 12 },
  progressCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  progressPercent: { fontSize: 14, fontWeight: "800", color: colors.text },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.cardBorder, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary },
  statusSummaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusSummaryCard: {
    minWidth: 96,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  statusSummaryCount: { fontSize: 20, fontWeight: "900", color: colors.text },
  statusSummaryLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  stageCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 10 },
  stageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  stageName: { fontSize: 18, fontWeight: "700", color: colors.text },
  stageMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  stageStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stageStatusText: { fontSize: 10, fontWeight: "800" },
  stageProgressTrack: { height: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.05)", overflow: "hidden" },
  stageProgressFill: { height: "100%", backgroundColor: colors.primary },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalCard: { width: "100%", backgroundColor: colors.surface, borderRadius: 24, padding: 20, height: "86%", overflow: "hidden" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalScroll: { flex: 1, minHeight: 0 },
  modalContent: { gap: 16, paddingBottom: 20, flexGrow: 1 },
  fieldBlock: { gap: 4 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted, color: colors.text },
  optionChipsRow: { gap: 8, paddingVertical: 4 },
  optionChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted },
  optionChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionChipText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  optionChipTextActive: { color: colors.primary },
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
