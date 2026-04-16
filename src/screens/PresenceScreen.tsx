import { useState, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Modal, ScrollView } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useDailyLogs } from "../hooks/useDailyLogs";

const MONTHS_LIST = [
  { id: 3, label: "Abril" },
  { id: 4, label: "Maio" },
  { id: 5, label: "Junho" },
  { id: 6, label: "Julho" },
  { id: 7, label: "Agosto" },
  { id: 8, label: "Setembro" },
  { id: 9, label: "Outubro" },
  { id: 10, label: "Novembro" },
  { id: 11, label: "Dezembro" },
];

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

/**
 * Calcula a semana do mes baseada no calendario real (Domingo a Sabado).
 * Garante que dias da mesma semana calendario fiquem na mesma coluna.
 */
function getCalendarWeekOfMonth(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const offsetDate = date.getDate() + firstDayWeekday - 1;
  return Math.floor(offsetDate / 7) + 1;
}

export function PresenceScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [summaryMonth, setSummaryMonth] = useState<{ id: number; label: string } | null>(null);
  
  const dateKey = useMemo(() => isoDate(selectedDate), [selectedDate]);
  const { employees, logs, isLoading } = useDailyLogs();

  const dailyLog = useMemo(() => logs.find(log => log.date === dateKey), [logs, dateKey]);
  const activeEmployees = useMemo(() => employees.filter(e => e.status === "ativo"), [employees]);

  // Estatisticas do resumo mensal
  const monthStats = useMemo(() => {
    if (!summaryMonth) return null;
    const currentYear = new Date().getFullYear();
    const monthLogs = logs.filter(log => {
      const [y, m] = log.date.split("-").map(Number);
      return y === currentYear && m === (summaryMonth.id + 1);
    });

    const individualStats = activeEmployees.map(emp => {
      const presences = monthLogs.filter(log => log.presenceIds.includes(emp.id)).length;
      const absences = monthLogs.filter(log => log.presenceIds.length === 0).length;
      return { name: emp.full_name, role: emp.role, presences, absences };
    });

    const totalPresences = individualStats.reduce((sum, s) => sum + s.presences, 0);
    const totalAbsences = individualStats.reduce((sum, s) => sum + s.absences, 0);
    const totalEvents = totalPresences + totalAbsences;
    const averagePercent = totalEvents > 0 ? Math.round((totalPresences / totalEvents) * 100) : 0;

    return { individualStats, totalPresences, totalAbsences, averagePercent };
  }, [summaryMonth, logs, activeEmployees]);

  // Dados do grafico de barras semanais
  const chartData = useMemo(() => {
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();
    const monthLogs = logs.filter(log => {
      const [y, m] = log.date.split("-").map(Number);
      return y === currentYear && m === (currentMonth + 1);
    });

    return [1, 2, 3, 4, 5, 6].map(weekNum => {
      const series = activeEmployees.map(emp => {
        const value = monthLogs.filter(log => 
          log.presenceIds.includes(emp.id) && getCalendarWeekOfMonth(log.date) === weekNum
        ).length;
        return { id: emp.id, color: emp.role === "marinheiro" ? "#2563EB" : "#8B5CF6", value };
      });
      return { label: `S${weekNum}`, series };
    }).filter((w, i) => i < 4 || w.series.some(s => s.value > 0));
  }, [logs, activeEmployees, selectedDate]);

  const changeDay = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + offset);
    setSelectedDate(next);
  };

  const summary = useMemo(() => {
    if (!dailyLog) return { presentes: 0, faltas: 0 };
    const presentes = activeEmployees.filter(e => dailyLog.presenceIds.includes(e.id)).length;
    let faltas = dailyLog.presenceIds.length === 0 ? activeEmployees.length : 0;
    return { presentes, faltas };
  }, [dailyLog, activeEmployees]);

  return (
    <AppScreen title="Relatório de Presença" subtitle="Frequência baseada no Diário de Obra.">
      
      <View style={styles.dateNavigator}>
        <Pressable style={styles.arrowButton} onPress={() => changeDay(-1)}><Text style={styles.arrowText}>‹</Text></Pressable>
        <View style={styles.dateDisplay}>
          <Text style={styles.dateTitle}>{displayDate(selectedDate)}</Text>
          {dateKey === isoDate(new Date()) && <Text style={styles.todayBadge}>Hoje</Text>}
        </View>
        <Pressable style={styles.arrowButton} onPress={() => changeDay(1)}><Text style={styles.arrowText}>›</Text></Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, dailyLog ? { color: colors.success } : { color: colors.textMuted }]}>{dailyLog ? summary.presentes : "—"}</Text>
          <Text style={styles.summaryLabel}>Presentes</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, dailyLog ? { color: colors.danger } : { color: colors.textMuted }]}>{dailyLog ? summary.faltas : "—"}</Text>
          <Text style={styles.summaryLabel}>Faltas</Text>
        </View>
      </View>

      <SectionCard title="Frequência Semanal" subtitle="Dias trabalhados por cada membro da equipe.">
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.chartContainer}>
            <View style={styles.yAxis}>
              {[7, 5, 3, 1, 0].map(n => <Text key={n} style={styles.yAxisText}>{n}</Text>)}
            </View>
            <View style={styles.chartMain}>
              <View style={styles.grid}>
                {[0, 1, 2, 3].map(i => <View key={i} style={styles.gridLine} />)}
              </View>
              <View style={styles.barsWrapper}>
                {chartData.map((week, idx) => (
                  <View key={idx} style={styles.weekCol}>
                    <View style={styles.barsGroup}>
                      {week.series.map(s => (
                        <View key={s.id} style={[styles.bar, { height: `${(s.value / 7) * 100}%`, backgroundColor: s.color }]} />
                      ))}
                    </View>
                    <Text style={styles.xAxisText}>{week.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.legendWrapper}>
              {activeEmployees.map(emp => (
                <View key={emp.id} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: emp.role === "marinheiro" ? "#2563EB" : "#8B5CF6" }]} />
                  <Text style={styles.legendText}>{emp.full_name.split(" ")[0]}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </SectionCard>

      {dailyLog ? (
        <SectionCard title="Equipe no Dia" subtitle="Status individual na data selecionada.">
          <View style={styles.list}>
            {activeEmployees.map((employee) => {
              const isPresent = dailyLog?.presenceIds.includes(employee.id);
              const isGlobalAbsence = dailyLog.presenceIds.length === 0;
              return (
                <View key={employee.id} style={styles.employeeRow}>
                  <View style={styles.employeeInfo}>
                    <View style={styles.avatar}><Text style={styles.avatarTxt}>{employee.full_name[0]}</Text></View>
                    <View>
                      <Text style={styles.employeeName}>{employee.full_name}</Text>
                      <Text style={styles.employeeRole}>{employee.role}</Text>
                    </View>
                  </View>
                  {isPresent ? (
                    <View style={styles.statusBadgeSuccess}><Text style={styles.statusBadgeText}>Presente</Text></View>
                  ) : isGlobalAbsence ? (
                    <View style={styles.statusBadgeDanger}><Text style={styles.statusBadgeText}>Falta</Text></View>
                  ) : (
                    <View style={styles.statusBadgeNeutral}><Text style={styles.statusBadgeTextNeutral}>—</Text></View>
                  )}
                </View>
              );
            })}
          </View>
        </SectionCard>
      ) : !isLoading && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Nenhum diário registrado.</Text>
          <Text style={styles.emptyStateSubtext}>Os dados são importados do Diário de Obra.</Text>
        </View>
      )}

      <SectionCard title="Resumos Mensais" subtitle="Clique para ver estatísticas consolidadas por mês.">
        <View style={styles.monthsList}>
          {MONTHS_LIST.map((m) => (
            <Pressable key={m.id} style={({ pressed }) => [styles.monthItem, pressed && styles.monthItemPressed]} onPress={() => setSummaryMonth(m)}>
              <Text style={styles.monthLabel}>{m.label}</Text>
              <Text style={styles.monthArrow}>›</Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      <Modal transparent animationType="slide" visible={Boolean(summaryMonth)} onRequestClose={() => setSummaryMonth(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Resumo de {summaryMonth?.label}</Text>
              <Pressable onPress={() => setSummaryMonth(null)}><Text style={styles.closeIcon}>×</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalSummaryRow}>
                <View style={styles.modalStatCard}><Text style={[styles.modalStatValue, { color: colors.success }]}>{monthStats?.totalPresences}</Text><Text style={styles.modalStatLabel}>Presenças</Text></View>
                <View style={styles.modalStatCard}><Text style={[styles.modalStatValue, { color: colors.danger }]}>{monthStats?.totalAbsences}</Text><Text style={styles.modalStatLabel}>Faltas Coletivas</Text></View>
              </View>
              <Text style={styles.sectionTitle}>Estatísticas por Funcionário</Text>
              <View style={styles.individualList}>
                {monthStats?.individualStats.map((s, i) => (
                  <View key={i} style={styles.individualRow}>
                    <View style={styles.individualInfo}><Text style={styles.individualName}>{s.name}</Text><Text style={styles.individualRole}>{s.role}</Text></View>
                    <View style={styles.individualCounters}><Text style={styles.countText}><Text style={{ color: colors.success, fontWeight: "800" }}>{s.presences}P</Text> {s.absences > 0 ? <>/ <Text style={{ color: colors.danger, fontWeight: "800" }}>{s.absences}F</Text></> : null}</Text></View>
                  </View>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}><Text style={styles.footerLabel}>Assiduidade média da equipe:</Text><Text style={styles.footerPercent}>{monthStats?.averagePercent}%</Text></View>
          </View>
        </View>
      </Modal>

      <Text style={styles.footerNote}>Os dados acima são automáticos. Edite o Diário de Obra para alterar a presença.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  dateNavigator: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, backgroundColor: colors.surface, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder },
  arrowButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  arrowText: { fontSize: 24, color: colors.text, fontWeight: "300" },
  dateDisplay: { alignItems: "center" },
  dateTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  todayBadge: { fontSize: 11, fontWeight: "800", color: colors.primary, marginTop: 2, textTransform: "uppercase" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  chartContainer: { paddingVertical: 10 },
  chartMain: { height: 150, marginLeft: 25, position: "relative", marginBottom: 25 },
  yAxis: { position: "absolute", left: 0, height: 150, justifyContent: "space-between", alignItems: "flex-end", width: 20, zIndex: 1 },
  yAxisText: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  grid: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  gridLine: { height: 1, backgroundColor: colors.cardBorder, width: "100%" },
  barsWrapper: { flex: 1, flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end" },
  weekCol: { alignItems: "center", flex: 1 },
  barsGroup: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: "100%" },
  bar: { width: 10, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 2 },
  xAxisText: { fontSize: 10, color: colors.textMuted, fontWeight: "700", position: "absolute", bottom: -20 },
  legendWrapper: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: colors.text, fontWeight: "600" },
  list: { gap: 16 },
  employeeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  employeeInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  employeeName: { fontSize: 14, fontWeight: "700", color: colors.text },
  employeeRole: { fontSize: 12, color: colors.textMuted, textTransform: "capitalize" },
  statusBadgeSuccess: { backgroundColor: colors.success, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusBadgeDanger: { backgroundColor: colors.danger, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusBadgeNeutral: { backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder },
  statusBadgeText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  statusBadgeTextNeutral: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyStateText: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  emptyStateSubtext: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 4 },
  footerNote: { marginTop: 12, marginBottom: 30, textAlign: "center", color: colors.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 20 },
  monthsList: { gap: 8 },
  monthItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder },
  monthItemPressed: { opacity: 0.7, backgroundColor: colors.cardBorder },
  monthLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  monthArrow: { fontSize: 20, color: colors.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: "75%", padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  closeIcon: { fontSize: 28, color: colors.textMuted },
  modalScroll: { gap: 20 },
  modalSummaryRow: { flexDirection: "row", gap: 12 },
  modalStatCard: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: 16, alignItems: "center", gap: 4 },
  modalStatValue: { fontSize: 24, fontWeight: "800" },
  modalStatLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 10 },
  individualList: { gap: 12 },
  individualRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder },
  individualName: { fontSize: 14, fontWeight: "700", color: colors.text },
  individualRole: { fontSize: 12, color: colors.textMuted },
  individualCounters: { alignItems: "flex-end" },
  countText: { fontSize: 13, color: colors.text },
  modalFooter: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.cardBorder, alignItems: "center", gap: 4 },
  footerLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  footerPercent: { fontSize: 32, fontWeight: "900", color: colors.primary },
});
