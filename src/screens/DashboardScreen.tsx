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

// Funcoes utilitarias para formatacao de dados de exibicao.
// future_fix: centralizar estas funcoes em um arquivo utils para reutilizacao em todo o app.
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

export function DashboardScreen() {
  // Inicializacao de hooks de contexto e busca de dados (Supabase).
  // Carrega informacoes de perfil, logs diarios, etapas, atualizacoes e pagamentos.
  const { user } = useAuth();
  const { isOwner } = useProfile();
  const { logs, isLoading: logsLoading } = useDailyLogs();
  const { stages, isLoading: stagesLoading } = useStages();
  const { updates, isLoading: updatesLoading } = useUpdates();
  const { payments, isLoading: paymentsLoading } = usePayments();

  const loading = logsLoading || stagesLoading || updatesLoading || paymentsLoading;

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

    return {
      myLogs,
      myLogsThisMonth,
      latestMyLog,
      completedStages,
      inProgressStages,
      delayedStages,
      stageProgress,
      paidTotal,
    };
  }, [logs, payments, stages, user?.id]);

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
      <AppScreen title="Inicio" subtitle="Resumo operacional do que voce registrou na obra.">
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
              <Text style={styles.employeeMeta}>Clima: {dashboardData.latestMyLog.weather || "Nao informado"}</Text>
            </View>
          ) : (
            <Text style={styles.emptyCopy}>Voce ainda nao registrou atividades no Dia a Dia.</Text>
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
    <AppScreen title="Dashboard" subtitle="Resumo geral da casa, da obra e dos registros operacionais.">
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
          <Text style={styles.metricLabel}>Atualizacoes</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{logs.length}</Text>
          <Text style={styles.metricLabel}>Registros diarios</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{formatCurrency(dashboardData.paidTotal)}</Text>
          <Text style={styles.metricLabel}>Financeiro executado</Text>
        </View>
      </View>

      <SectionCard title="Equipe em campo" subtitle="Registros operacionais dos funcionarios.">
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
