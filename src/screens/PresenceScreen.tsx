import { useState, useMemo, useEffect } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, Image } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useTeam } from "../hooks/useTeam";
import { usePresence, useUpsertPresence, AttendanceStatus } from "../hooks/usePresence";

function isoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function displayDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export function PresenceScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateKey = useMemo(() => isoDate(selectedDate), [selectedDate]);
  
  const { project, employees, isLoading: loadingTeam } = useTeam();
  const { attendance, isLoading: loadingPresence } = usePresence(dateKey);
  const upsertPresence = useUpsertPresence();

  // Estado local para gerenciar as marcações antes de salvar
  const [localAttendance, setLocalAttendance] = useState<Record<string, AttendanceStatus | undefined>>({});

  useEffect(() => {
    const mapping: Record<string, AttendanceStatus> = {};
    attendance.forEach((row) => {
      mapping[row.employee_id] = row.status;
    });
    setLocalAttendance(mapping);
  }, [attendance]);

  const activeEmployees = useMemo(() => 
    employees.filter(e => e.status === "ativo"), 
  [employees]);

  const handleStatusChange = (employeeId: string, status: AttendanceStatus) => {
    setLocalAttendance(prev => ({
      ...prev,
      [employeeId]: prev[employeeId] === status ? undefined : status
    }));
  };

  const handleSave = async () => {
    if (!project?.id) return;
    
    const records = Object.entries(localAttendance)
      .filter((entry): entry is [string, AttendanceStatus] => Boolean(entry[1]))
      .map(([employee_id, status]) => ({ employee_id, status }));

    try {
      await upsertPresence.mutateAsync({
        projectId: project.id,
        date: dateKey,
        records
      });
      Alert.alert("Sucesso", records.length ? "Presença registrada com sucesso." : "Lista de chamada limpa para este dia.");
    } catch (error) {
      Alert.alert("Erro", "Não foi possível salvar a presença.");
    }
  };

  const changeDay = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + offset);
    setSelectedDate(next);
  };

  const isLoading = loadingTeam || loadingPresence;
  const summary = useMemo(() => {
    const statuses = Object.values(localAttendance);
    return {
      presente: statuses.filter((status) => status === "presente").length,
      meioPeriodo: statuses.filter((status) => status === "meio_periodo").length,
      falta: statuses.filter((status) => status === "falta").length,
    };
  }, [localAttendance]);

  return (
    <AppScreen title="Presença" subtitle="Controle diário de entrada e saída dos funcionários fixos da casa.">
      <View style={styles.dateNavigator}>
        <Pressable style={styles.arrowButton} onPress={() => changeDay(-1)}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <View style={styles.dateDisplay}>
          <Text style={styles.dateTitle}>{displayDate(selectedDate)}</Text>
          {dateKey === isoDate(new Date()) && <Text style={styles.todayBadge}>Hoje</Text>}
        </View>
        <Pressable style={styles.arrowButton} onPress={() => changeDay(1)}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.presente}</Text>
          <Text style={styles.summaryLabel}>Presentes</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.meioPeriodo}</Text>
          <Text style={styles.summaryLabel}>Meio período</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.falta}</Text>
          <Text style={styles.summaryLabel}>Faltas</Text>
        </View>
      </View>

      <SectionCard title="Lista de chamada" subtitle={`${activeEmployees.length} funcionários ativos na casa.`}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : activeEmployees.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum funcionário ativo cadastrado na equipe.</Text>
        ) : (
          <View style={styles.list}>
            {activeEmployees.map((employee) => {
              const currentStatus = localAttendance[employee.id];
              return (
                <View key={employee.id} style={styles.employeeRow}>
                  <View style={styles.employeeInfo}>
                    <View style={styles.avatar}>
                      {employee.photo ? (
                        <Image source={{ uri: employee.photo }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarTxt}>{employee.full_name[0]}</Text>
                      )}
                    </View>
                    <View>
                      <Text style={styles.employeeName}>{employee.full_name}</Text>
                      <Text style={styles.employeeRole}>{employee.role}</Text>
                    </View>
                  </View>

                  <View style={styles.statusGroup}>
                    <StatusButton 
                      label="P" 
                      active={currentStatus === "presente"} 
                      color={colors.success} 
                      onPress={() => handleStatusChange(employee.id, "presente")} 
                    />
                    <StatusButton 
                      label="1/2" 
                      active={currentStatus === "meio_periodo"} 
                      color={colors.warning} 
                      onPress={() => handleStatusChange(employee.id, "meio_periodo")} 
                    />
                    <StatusButton 
                      label="F" 
                      active={currentStatus === "falta"} 
                      color={colors.danger} 
                      onPress={() => handleStatusChange(employee.id, "falta")} 
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>

      <Pressable 
        style={({ pressed }) => [styles.saveButton, (pressed || upsertPresence.isPending) && styles.buttonPressed]} 
        onPress={handleSave}
        disabled={upsertPresence.isPending}
      >
        {upsertPresence.isPending ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.saveButtonText}>Salvar Presença</Text>
        )}
      </Pressable>

      <Text style={styles.helperText}>Toque novamente no mesmo status para desmarcar o funcionário antes de salvar.</Text>
    </AppScreen>
  );
}

function StatusButton({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable 
      onPress={onPress}
      style={[
        styles.statusBtn, 
        { borderColor: color },
        active && { backgroundColor: color }
      ]}
    >
      <Text style={[styles.statusBtnText, { color: color }, active && { color: colors.surface }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dateNavigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { fontSize: 24, color: colors.text, fontWeight: "300" },
  dateDisplay: { alignItems: "center" },
  dateTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  todayBadge: { fontSize: 11, fontWeight: "800", color: colors.primary, marginTop: 2, textTransform: "uppercase" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  summaryLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  list: { gap: 16 },
  employeeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  employeeInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: colors.primarySoft, 
    alignItems: "center", 
    justifyContent: "center",
    overflow: "hidden" 
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { color: colors.primary, fontWeight: "800" },
  employeeName: { fontSize: 14, fontWeight: "700", color: colors.text },
  employeeRole: { fontSize: 12, color: colors.textMuted, textTransform: "capitalize" },
  statusGroup: { flexDirection: "row", gap: 8 },
  statusBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBtnText: { fontSize: 12, fontWeight: "800" },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  saveButtonText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  buttonPressed: { opacity: 0.8 },
  emptyText: { textAlign: "center", color: colors.textMuted, paddingVertical: 20 },
  helperText: { marginTop: -12, marginBottom: 24, textAlign: "center", color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
