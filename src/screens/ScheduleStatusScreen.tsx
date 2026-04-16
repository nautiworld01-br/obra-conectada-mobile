import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../config/theme";
import { StageRow, StageStatus, useStages } from "../hooks/useStages";

/**
 * Labels amigaveis para cada status das etapas do cronograma.
 */
const statusLabels: Record<StageStatus, string> = {
  nao_iniciado: "Nao Iniciado",
  em_andamento: "Em Andamento",
  concluido: "Concluido",
  atrasado: "Atrasado",
  bloqueado: "Bloqueado",
};

/**
 * Define as cores do card baseadas no status (Reutiliza a logica da ScheduleScreen).
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
 * Tela de listagem filtrada por status do cronograma.
 * future_fix: Implementar busca por texto dentro desta listagem filtrada.
 */
export function ScheduleStatusScreen({
  status,
  title,
  onBack,
  onOpenStage,
}: {
  status: StageStatus;
  title: string;
  onBack: () => void;
  onOpenStage: (stage: StageRow) => void;
}) {
  const { stages, isLoading } = useStages();
  
  // Filtra as etapas em tempo real baseado no status passado por props.
  const filteredStages = stages.filter((stage) => stage.status === status);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.backLabel}>‹ Voltar</Text></Pressable>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.counter}>{filteredStages.length}</Text>
      </View>

      {isLoading ? (
        <View style={styles.emptyState}><Text style={styles.emptyText}>Carregando etapas...</Text></View>
      ) : filteredStages.length === 0 ? (
        <View style={styles.emptyState}><Text style={styles.emptyText}>Nenhuma etapa com esse status.</Text></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {filteredStages.map((stage) => {
            const statusColors = getStageStatusColors(stage.status);
            return (
              <Pressable key={stage.id} style={({ pressed }) => [styles.stageCard, { backgroundColor: statusColors.cardBackground }, pressed && styles.buttonPressed]} onPress={() => onOpenStage(stage)}>
                <View style={styles.stageHeader}>
                  <View style={styles.stageCopy}><Text style={styles.stageName}>{stage.name}</Text><Text style={styles.stageMeta}>{stage.category || "Sem categoria"} • {stage.responsible || "Sem responsavel"}</Text></View>
                  <View style={[styles.stageStatusPill, { backgroundColor: statusColors.pillBackground }]}><Text style={[styles.stageStatusText, { color: statusColors.pillText }]}>{statusLabels[stage.status]}</Text></View>
                </View>
                <View style={styles.progressHeader}><Text style={styles.stageDates}>Prev: {stage.planned_start || "—"} → {stage.planned_end || "—"}</Text><Text style={styles.stagePercent}>{stage.percent_complete ?? 0}%</Text></View>
                <View style={styles.stageProgressTrack}><View style={[styles.stageProgressFill, { width: `${stage.percent_complete ?? 0}%` }]} /></View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, gap: 10 },
  backLabel: { fontSize: 14, fontWeight: "700", color: colors.primary },
  title: { flex: 1, textAlign: "center", fontSize: 22, fontWeight: "800", color: colors.text },
  counter: { minWidth: 24, textAlign: "right", fontSize: 15, fontWeight: "800", color: colors.textMuted },
  content: { paddingTop: 16, paddingBottom: 32, gap: 10 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyText: { textAlign: "center", color: colors.textMuted, fontSize: 15 },
  stageCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  stageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  stageCopy: { flex: 1, gap: 2 },
  stageName: { fontSize: 18, fontWeight: "700", color: colors.text },
  stageMeta: { fontSize: 12, color: "#4f6185" },
  stageStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stageStatusText: { fontSize: 12, fontWeight: "700" },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stageDates: { fontSize: 12, color: colors.textMuted },
  stagePercent: { fontSize: 12, fontWeight: "800", color: colors.text },
  stageProgressTrack: { height: 8, borderRadius: 999, backgroundColor: "#efe6dc", overflow: "hidden" },
  stageProgressFill: { height: "100%", borderRadius: 999, backgroundColor: "#d8a16f" },
  buttonPressed: { opacity: 0.82 },
});
