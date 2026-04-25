import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { useDailyLogs } from "../hooks/useDailyLogs";
import { usePayments } from "../hooks/usePayments";
import { useProfile } from "../hooks/useProfile";
import { useStages } from "../hooks/useStages";
import { useUpdates } from "../hooks/useUpdates";
import { useRooms } from "../hooks/useRooms";

// Funcoes utilitarias para formatacao de dados de exibicao.
function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function getRoomHealthTone(status: "sem_dados" | "atencao" | "em_andamento" | "concluido") {
  switch (status) {
    case "concluido":
      return {
        backgroundColor: colors.successLight,
        borderColor: colors.success,
        textColor: colors.success,
        label: "Concluído",
      };
    case "atencao":
      return {
        backgroundColor: colors.dangerLight,
        borderColor: colors.danger,
        textColor: colors.danger,
        label: "Atenção",
      };
    case "em_andamento":
      return {
        backgroundColor: colors.infoLight,
        borderColor: colors.info,
        textColor: colors.info,
        label: "Em andamento",
      };
    default:
      return {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.cardBorder,
        textColor: colors.textMuted,
        label: "Sem dados",
      };
  }
}

export function DashboardScreen() {
  // Inicializacao de hooks de contexto e busca de dados (Supabase).
  // Carrega informacoes de perfil, logs diarios, etapas, atualizacoes e pagamentos.
  const { user } = useAuth();
  const { isOwner } = useProfile();
  const { logs, isLoading: logsLoading } = useDailyLogs();
  const { stages, isLoading: stagesLoading } = useStages();
  const { updates, isLoading: updatesLoading } = useUpdates();
  const { rooms, isLoading: roomsLoading } = useRooms();
  const { payments, isLoading: paymentsLoading } = usePayments();

  const loading = logsLoading || stagesLoading || updatesLoading || paymentsLoading || roomsLoading;

  // Calculo e memorizacao dos dados consolidados para o dashboard.
  // Filtra logs do usuario logado, calcula progresso das etapas e total financeiro pago.
  const dashboardData = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const myLogs = logs.filter((log) => log.created_by === user?.id);
    const myLogsThisMonth = myLogs.filter((log) => {
      const date = new Date(`${log.date}T00:00:00`);
      return date.getMonth() === month && date.getFullYear() === year;
    });
    const latestMyLog = myLogs[0] ?? null;
    const completedStages = stages.filter((stage) => stage.status === "concluido").length;
    const inProgressStages = stages.filter((stage) => stage.status === "em_andamento").length;
    const delayedStages = stages.filter((stage) => stage.status === "atrasado").length;
    const stageProgress = stages.length
      ? Math.round(stages.reduce((sum, stage) => sum + (stage.percent_complete ?? 0), 0) / stages.length)
      : 0;
    const paidTotal = payments
      .filter((payment) => payment.status === "pago" || payment.status === "aprovado")
      .reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
    const roomSummaries = rooms.map((room) => {
      const roomLogs = logs.filter((log) => log.room_id === room.id);
      const roomStages = stages.filter((stage) => stage.room_id === room.id);
      const roomUpdates = updates.filter((update) => update.room_id === room.id);
      const completedStagesByRoom = roomStages.filter((stage) => stage.status === "concluido").length;
      const delayedStagesByRoom = roomStages.filter((stage) => stage.status === "atrasado" || stage.status === "bloqueado").length;
      const stageProgressByRoom = roomStages.length
        ? Math.round(roomStages.reduce((sum, stage) => sum + (stage.percent_complete ?? 0), 0) / roomStages.length)
        : 0;
      const latestLogDate = roomLogs[0]?.date ?? null;
      const latestUpdate = roomUpdates[0] ?? null;
      const hasAnyData = roomLogs.length > 0 || roomStages.length > 0 || roomUpdates.length > 0;
      const healthStatus: "sem_dados" | "atencao" | "em_andamento" | "concluido" =
        !hasAnyData ? "sem_dados"
        : delayedStagesByRoom > 0 || roomUpdates.some((update) => update.status === "atrasado") ? "atencao"
        : roomStages.length > 0 && completedStagesByRoom === roomStages.length ? "concluido"
        : "em_andamento";

      return {
        id: room.id,
        name: room.name,
        logsCount: roomLogs.length,
        stagesCount: roomStages.length,
        updatesCount: roomUpdates.length,
        completedStagesByRoom,
        delayedStagesByRoom,
        stageProgressByRoom,
        latestLogDate,
        latestUpdateStatus: latestUpdate?.status ?? null,
        healthStatus,
      };
    });
    const roomsWithActivity = roomSummaries.filter((room) => room.logsCount || room.stagesCount || room.updatesCount).length;
    const roomsNeedingAttention = roomSummaries.filter((room) => room.healthStatus === "atencao").length;
    const roomsCompleted = roomSummaries.filter((room) => room.healthStatus === "concluido").length;

    return {
      myLogs,
      myLogsThisMonth,
      latestMyLog,
      completedStages,
      inProgressStages,
      delayedStages,
      stageProgress,
      paidTotal,
      roomSummaries,
      roomsWithActivity,
      roomsNeedingAttention,
      roomsCompleted,
    };
  }, [logs, payments, rooms, stages, updates, user?.id]);

  // Renderizacao do estado de carregamento enquanto os dados sao buscados.
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Montando dashboard...</Text>
      </View>
    );
  }

  // Renderizacao especifica para funcionarios (nao proprietarios).
  // Foca em metricas pessoais de registros realizados.
  if (!isOwner) {
    return (
      <AppScreen title="Início" subtitle="Resumo operacional do que você registrou na obra.">
        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{dashboardData.myLogs.length}</Text>
            <Text style={styles.metricLabel}>Meus registros</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{dashboardData.myLogsThisMonth.length}</Text>
            <Text style={styles.metricLabel}>Este mes</Text>
          </View>
        </View>

        <SectionCard title="Ultima atividade" subtitle="Seu lancamento operacional mais recente.">
          {dashboardData.latestMyLog ? (
            <View style={styles.employeeLatestWrap}>
              <Text style={styles.employeeDate}>{formatDate(dashboardData.latestMyLog.date)}</Text>
              <Text style={styles.employeeActivity} numberOfLines={3}>
                {dashboardData.latestMyLog.activities || "Sem descricao informada."}
              </Text>
              <Text style={styles.employeeMeta}>Clima: {dashboardData.latestMyLog.weather || "Não informado"}</Text>
            </View>
          ) : (
            <Text style={styles.emptyCopy}>Você ainda não registrou atividades no Dia a Dia.</Text>
          )}
        </SectionCard>

        <SectionCard title="Visao operacional" subtitle="Acompanhe rapido o estado da obra sem entrar nas telas.">
          <View style={styles.employeeOverviewList}>
            <Text style={styles.infoRow}>Etapas em andamento: {dashboardData.inProgressStages}</Text>
            <Text style={styles.infoRow}>Etapas concluidas: {dashboardData.completedStages}</Text>
            <Text style={styles.infoRow}>Etapas atrasadas: {dashboardData.delayedStages}</Text>
          </View>
        </SectionCard>
      </AppScreen>
    );
  }

  // Renderizacao principal para proprietarios/administradores.
  // Exibe panorama geral de progresso, metricas globais e situacao da equipe.
  return (
    <AppScreen title="Dashboard" subtitle="Resumo geral da obra e dos registros operacionais.">
      <SectionCard title="Progresso geral" subtitle="Leitura consolidada das etapas e da operacao.">
        <View style={styles.heroRow}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressValue}>{dashboardData.stageProgress}%</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Panorama da obra</Text>
            <Text style={styles.heroText}>
              {dashboardData.completedStages} concluidas, {dashboardData.inProgressStages} em andamento e {dashboardData.delayedStages} atrasadas.
            </Text>
          </View>
        </View>
      </SectionCard>

      <View style={styles.grid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{stages.length}</Text>
          <Text style={styles.metricLabel}>Etapas</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{updates.length}</Text>
          <Text style={styles.metricLabel}>Relatórios</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{logs.length}</Text>
          <Text style={styles.metricLabel}>Registros diários</Text>
        </View>
        {/* Card financeiro removido conforme plano de visibilidade operacional */}
      </View>

      <SectionCard title="Andamento por cômodo" subtitle="Consolidação do Dia a Dia, Crono e Relatórios em cada frente da obra.">
        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{rooms.length}</Text>
            <Text style={styles.metricLabel}>Cômodos</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{dashboardData.roomsWithActivity}</Text>
            <Text style={styles.metricLabel}>Com atividade</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{dashboardData.roomsCompleted}</Text>
            <Text style={styles.metricLabel}>Concluídos</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{dashboardData.roomsNeedingAttention}</Text>
            <Text style={styles.metricLabel}>Pedem atenção</Text>
          </View>
        </View>

        <View style={styles.roomList}>
          {dashboardData.roomSummaries.length === 0 ? (
            <Text style={styles.emptyCopy}>Cadastre cômodos nas configurações da casa/obra para acompanhar o andamento por ambiente.</Text>
          ) : dashboardData.roomSummaries.map((room) => {
            const tone = getRoomHealthTone(room.healthStatus);
            return (
              <View key={room.id} style={styles.roomCard}>
                <View style={styles.roomCardHeader}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <View
                    style={[
                      styles.roomStatusPill,
                      {
                        backgroundColor: tone.backgroundColor,
                        borderColor: tone.borderColor,
                      },
                    ]}
                  >
                    <Text style={[styles.roomStatusText, { color: tone.textColor }]}>{tone.label}</Text>
                  </View>
                </View>

                <View style={styles.roomProgressRow}>
                  <Text style={styles.roomProgressLabel}>Crono</Text>
                  <Text style={styles.roomProgressValue}>{room.stageProgressByRoom}%</Text>
                </View>
                <View style={styles.roomProgressTrack}>
                  <View style={[styles.roomProgressFill, { width: `${room.stageProgressByRoom}%` }]} />
                </View>

                <View style={styles.roomMetricsRow}>
                  <View style={styles.roomMiniMetric}>
                    <Text style={styles.roomMiniMetricValue}>{room.logsCount}</Text>
                    <Text style={styles.roomMiniMetricLabel}>Dia a Dia</Text>
                  </View>
                  <View style={styles.roomMiniMetric}>
                    <Text style={styles.roomMiniMetricValue}>{room.completedStagesByRoom}/{room.stagesCount}</Text>
                    <Text style={styles.roomMiniMetricLabel}>Etapas</Text>
                  </View>
                  <View style={styles.roomMiniMetric}>
                    <Text style={styles.roomMiniMetricValue}>{room.updatesCount}</Text>
                    <Text style={styles.roomMiniMetricLabel}>Relatórios</Text>
                  </View>
                </View>

                <View style={styles.roomMetaList}>
                  <Text style={styles.roomMetaText}>
                    Último dia a dia: {formatDate(room.latestLogDate)}
                  </Text>
                  <Text style={styles.roomMetaText}>
                    Relatório recente: {room.latestUpdateStatus ? room.latestUpdateStatus.replace("_", " ") : "—"}
                  </Text>
                  <Text style={styles.roomMetaText}>
                    Pendências do crono: {room.delayedStagesByRoom}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title="Equipe em campo" subtitle="Registros operacionais dos funcionários.">
        <View style={styles.employeeOverviewList}>
          <Text style={styles.infoRow}>Lancamentos da equipe: {logs.length}</Text>
          <Text style={styles.infoRow}>Lancamentos seus: {dashboardData.myLogs.length}</Text>
          <Text style={styles.infoRow}>Lancamentos deste mes: {dashboardData.myLogsThisMonth.length}</Text>
        </View>
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingText: {
    color: colors.textMuted,
  },
  heroRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  progressCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primarySoft,
    borderWidth: 6,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  progressValue: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 24,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 8,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  roomList: {
    marginTop: 16,
    gap: 12,
  },
  roomCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 12,
  },
  roomCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  roomName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  roomStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roomStatusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  roomProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roomProgressLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  roomProgressValue: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  roomProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  roomProgressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  roomMetricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  roomMiniMetric: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  roomMiniMetricValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  roomMiniMetricLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  roomMetaList: {
    gap: 6,
  },
  roomMetaText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  employeeLatestWrap: {
    gap: 6,
  },
  employeeDate: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  employeeActivity: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  employeeMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyCopy: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  employeeOverviewList: {
    gap: 10,
  },
  infoRow: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
