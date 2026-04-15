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
import { useAuth } from "../contexts/AuthContext";
import {
  PaymentCategory,
  PaymentRow,
  PaymentStatus,
  useDeletePayment,
  usePayments,
  useUpsertPayment,
  useUpdatePaymentStatus,
} from "../hooks/usePayments";
import { StageRow, useStages } from "../hooks/useStages";

const categoryOptions: { value: PaymentCategory; label: string; short: string }[] = [
  { value: "mao_de_obra_projeto", label: "Mao de obra Projeto Inicial", short: "MO Projeto" },
  { value: "mao_de_obra_extras", label: "Mao de obra Servicos Extras", short: "MO Extras" },
  { value: "insumos_extras", label: "Insumos Servicos Extra", short: "Insumos Extra" },
];

const statusOptions: { value: PaymentStatus; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "em_analise", label: "Em Analise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "pago", label: "Pago" },
  { value: "recusado", label: "Recusado" },
];

const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const monthLabels = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function toDisplayDate(value: string | null) {
  if (!value) {
    return "";
  }

  return formatDate(value);
}

function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const [day, month, year] = trimmed.split("/");
  if (!day || !month || !year) {
    return null;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toDate(value: string | null) {
  if (!value) {
    return new Date();
  }

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

function getStatusColors(status: PaymentStatus) {
  switch (status) {
    case "pago":
      return { background: "#e7f4ec", text: colors.success };
    case "aprovado":
      return { background: "#e6f0ff", text: "#3566d6" };
    case "em_analise":
      return { background: "#ece9ff", text: "#6a56d2" };
    case "recusado":
      return { background: "#fdeae7", text: colors.danger };
    case "pendente":
    default:
      return { background: "#fff3df", text: colors.warning };
  }
}

function getCategoryLabel(category: PaymentCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category;
}

function getCategoryShort(category: PaymentCategory) {
  return categoryOptions.find((option) => option.value === category)?.short ?? category;
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dueDate}T00:00:00`);
  return target < today;
}

type FormDraft = {
  period: string;
  category: PaymentCategory;
  plannedAmount: string;
  requestedAmount: string;
  description: string;
  percentWork: string;
  stageId: string | null;
  observations: string;
  dueDate: string;
};

type PaymentFormModalProps = {
  visible: boolean;
  payment: PaymentRow | null;
  stages: StageRow[];
  loading: boolean;
  onClose: () => void;
  onSave: (payload: {
    period: string;
    category: PaymentCategory;
    plannedAmount: number;
    requestedAmount: number;
    description: string;
    percentWork: number;
    stageId: string | null;
    observations: string;
    dueDate: string | null;
  }) => Promise<void>;
};

function PaymentFormModal({ visible, payment, stages, loading, onClose, onSave }: PaymentFormModalProps) {
  const [draft, setDraft] = useState<FormDraft>({
    period: "",
    category: "mao_de_obra_projeto",
    plannedAmount: "",
    requestedAmount: "",
    description: "",
    percentWork: "",
    stageId: null,
    observations: "",
    dueDate: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());

  useEffect(() => {
    setDraft({
      period: payment?.period ?? "",
      category: payment?.category ?? "mao_de_obra_projeto",
      plannedAmount: payment?.planned_amount != null ? String(payment.planned_amount) : "",
      requestedAmount: payment?.requested_amount != null ? String(payment.requested_amount) : "",
      description: payment?.description ?? "",
      percentWork: payment?.percent_work != null ? String(payment.percent_work) : "",
      stageId: payment?.stage_id ?? null,
      observations: payment?.observations ?? "",
      dueDate: toDisplayDate(payment?.due_date ?? null),
    });
    setLocalError(null);
    setCategoryOpen(false);
    setStageOpen(false);
    setDateOpen(false);
    setDatePickerMonth(toDate(payment?.due_date ?? null));
  }, [payment, visible]);

  const monthGrid = useMemo(() => buildMonthGrid(datePickerMonth), [datePickerMonth]);
  const monthLabel = `${monthLabels[datePickerMonth.getMonth()]} ${datePickerMonth.getFullYear()}`;
  const selectedCategory = getCategoryLabel(draft.category);
  const selectedStage = stages.find((stage) => stage.id === draft.stageId)?.name ?? "Selecione";

  const handleSave = async () => {
    if (!draft.period.trim()) {
      setLocalError("Informe o periodo.");
      return;
    }

    if (!draft.description.trim()) {
      setLocalError("Informe a descricao.");
      return;
    }

    const requestedAmount = Number(draft.requestedAmount.replace(",", "."));
    if (!requestedAmount || requestedAmount <= 0) {
      setLocalError("Informe um valor solicitado valido.");
      return;
    }

    const plannedAmount = Number(draft.plannedAmount.replace(",", ".")) || 0;
    const percentWork = Number(draft.percentWork.replace(",", ".")) || 0;

    setLocalError(null);
    await onSave({
      period: draft.period.trim(),
      category: draft.category,
      plannedAmount,
      requestedAmount,
      description: draft.description.trim(),
      percentWork,
      stageId: draft.stageId,
      observations: draft.observations.trim(),
      dueDate: toIsoDate(draft.dueDate),
    });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{payment ? "Editar Pagamento" : "Novo Pagamento"}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Periodo *</Text>
              <TextInput
                style={[styles.fieldInput, styles.primaryInput]}
                value={draft.period}
                onChangeText={(value) => setDraft((current) => ({ ...current, period: value }))}
                placeholder="Ex: Quinzena 04/2026"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Categoria *</Text>
              <Pressable style={styles.selectField} onPress={() => setCategoryOpen(true)}>
                <Text style={styles.selectFieldText}>{selectedCategory}</Text>
                <Text style={styles.selectFieldArrow}>˅</Text>
              </Pressable>
            </View>

            <View style={styles.row}>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Valor Previsto</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={draft.plannedAmount}
                  onChangeText={(value) => setDraft((current) => ({ ...current, plannedAmount: value }))}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Valor Solicitado *</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={draft.requestedAmount}
                  onChangeText={(value) => setDraft((current) => ({ ...current, requestedAmount: value }))}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Descricao *</Text>
              <TextInput
                multiline
                style={[styles.fieldInput, styles.textArea]}
                value={draft.description}
                onChangeText={(value) => setDraft((current) => ({ ...current, description: value }))}
                placeholder="Descreva a solicitacao"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Data de Vencimento</Text>
              <Pressable
                style={styles.dateField}
                onPress={() => {
                  setDatePickerMonth(toDate(toIsoDate(draft.dueDate)));
                  setDateOpen(true);
                }}
              >
                <Text style={draft.dueDate ? styles.dateFieldText : styles.dateFieldPlaceholder}>
                  {draft.dueDate || "dd/mm/aaaa"}
                </Text>
                <Text style={styles.dateFieldIcon}>◫</Text>
              </Pressable>
            </View>

            <View style={styles.row}>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>% Obra</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={draft.percentWork}
                  onChangeText={(value) => setDraft((current) => ({ ...current, percentWork: value }))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Etapa</Text>
                <Pressable style={styles.selectField} onPress={() => setStageOpen(true)}>
                  <Text style={draft.stageId ? styles.selectFieldText : styles.dateFieldPlaceholder}>{selectedStage}</Text>
                  <Text style={styles.selectFieldArrow}>˅</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Observacoes</Text>
              <TextInput
                multiline
                style={[styles.fieldInput, styles.textArea]}
                value={draft.observations}
                onChangeText={(value) => setDraft((current) => ({ ...current, observations: value }))}
                placeholder="Informacoes complementares"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {localError ? <Text style={styles.localError}>{localError}</Text> : null}

            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={() => void handleSave()}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>{payment ? "Salvar Alteracoes" : "Registrar Pagamento"}</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <Modal transparent animationType="fade" visible={categoryOpen} onRequestClose={() => setCategoryOpen(false)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setCategoryOpen(false)}>
          <Pressable style={styles.dropdownModalCard} onPress={() => undefined}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.dropdownModalContent}>
              {categoryOptions.map((option) => {
                const active = option.value === draft.category;

                return (
                  <Pressable
                    key={option.value}
                    style={({ pressed }) => [styles.dropdownItem, active && styles.dropdownItemActive, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setDraft((current) => ({ ...current, category: option.value }));
                      setCategoryOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                      {active ? "✓  " : "   "}
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={stageOpen} onRequestClose={() => setStageOpen(false)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setStageOpen(false)}>
          <Pressable style={styles.dropdownModalCard} onPress={() => undefined}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.dropdownModalContent}>
              <Pressable
                style={({ pressed }) => [styles.dropdownItem, !draft.stageId && styles.dropdownItemActive, pressed && styles.buttonPressed]}
                onPress={() => {
                  setDraft((current) => ({ ...current, stageId: null }));
                  setStageOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, !draft.stageId && styles.dropdownItemTextActive]}>
                  {!draft.stageId ? "✓  " : "   "}
                  Sem etapa
                </Text>
              </Pressable>

              {stages.map((stage) => {
                const active = stage.id === draft.stageId;

                return (
                  <Pressable
                    key={stage.id}
                    style={({ pressed }) => [styles.dropdownItem, active && styles.dropdownItemActive, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setDraft((current) => ({ ...current, stageId: stage.id }));
                      setStageOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                      {active ? "✓  " : "   "}
                      {stage.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={dateOpen} onRequestClose={() => setDateOpen(false)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setDateOpen(false)}>
          <Pressable style={styles.calendarModalCard} onPress={() => undefined}>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarArrowButton} onPress={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
                <Text style={styles.calendarArrowText}>‹</Text>
              </Pressable>
              <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
              <Pressable style={styles.calendarArrowButton} onPress={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
                <Text style={styles.calendarArrowText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.calendarWeekHeader}>
              {weekLabels.map((label) => (
                <Text key={label} style={styles.calendarWeekLabel}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {monthGrid.map((cell) => {
                const activeIso = toIsoDate(draft.dueDate);
                const todayIso = isoDate(new Date());
                const selected = activeIso === cell.iso;
                const suggested = !activeIso && todayIso === cell.iso;

                return (
                  <Pressable
                    key={cell.key}
                    style={({ pressed }) => [
                      styles.calendarDay,
                      selected && styles.calendarDaySelected,
                      suggested && styles.calendarDaySuggested,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => {
                      setDraft((current) => ({ ...current, dueDate: toDisplayDate(cell.iso) }));
                      setDateOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        !cell.currentMonth && styles.calendarDayOutside,
                        selected && styles.calendarDayTextSelected,
                        suggested && styles.calendarDayTextSuggested,
                      ]}
                    >
                      {cell.dayNumber}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarFooter}>
              <Pressable
                style={({ pressed }) => [styles.calendarClearButton, pressed && styles.buttonPressed]}
                onPress={() => {
                  setDraft((current) => ({ ...current, dueDate: "" }));
                  setDateOpen(false);
                }}
              >
                <Text style={styles.calendarClearText}>Limpar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

type PaymentDetailModalProps = {
  payment: PaymentRow | null;
  visible: boolean;
  loading: boolean;
  stage?: StageRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onMarkPaid: () => void;
};

function PaymentDetailModal(_: PaymentDetailModalProps) {
  const { payment, visible, loading, stage, onClose, onEdit, onDelete, onApprove, onReject, onMarkPaid } = _;

  if (!payment) {
    return null;
  }

  const statusStyle = getStatusColors(payment.status);
  const statusLabel = statusOptions.find((option) => option.value === payment.status)?.label ?? payment.status;
  const overdue = isOverdue(payment.due_date);
  const canMarkPaid = Boolean(payment.due_date) && payment.status !== "pago" && payment.status !== "recusado";

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.detailCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Detalhe do Pagamento</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.detailTopRow}>
              <Text style={styles.detailPeriod}>{payment.period}</Text>
              <View style={styles.detailTopActions}>
                <Pressable style={styles.editPill} onPress={onEdit}>
                  <Text style={styles.editPillText}>Editar</Text>
                </Pressable>
                <Pressable style={styles.deletePill} onPress={onDelete}>
                  <Text style={styles.deletePillText}>Excluir</Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}>
              <Text style={[styles.statusPillText, { color: statusStyle.text }]}>{statusLabel}</Text>
            </View>

            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{getCategoryLabel(payment.category)}</Text>
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailLabel}>Valor Previsto</Text>
                <Text style={styles.detailValue}>{formatCurrency(Number(payment.planned_amount ?? 0))}</Text>
              </View>
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailLabel}>Valor Solicitado</Text>
                <Text style={styles.detailValue}>{formatCurrency(Number(payment.requested_amount))}</Text>
              </View>
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailLabel}>Solicitado em</Text>
                <Text style={styles.detailValueSmall}>{formatDate(payment.request_date)}</Text>
              </View>
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailLabel}>% Obra</Text>
                <Text style={styles.detailValueSmall}>{payment.percent_work ?? 0}%</Text>
              </View>
            </View>

            {payment.due_date ? (
              <View style={[styles.dueBanner, overdue && styles.dueBannerDanger]}>
                <Text style={[styles.dueBannerText, overdue && styles.dueBannerTextDanger]}>
                  Vence em {formatDate(payment.due_date)}
                  {overdue ? " • Vencido" : ""}
                </Text>
              </View>
            ) : null}

            {payment.payment_date ? <Text style={styles.detailCaption}>Pago em {formatDate(payment.payment_date)}</Text> : null}

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionLabel}>Descricao</Text>
              <Text style={styles.detailBody}>{payment.description}</Text>
            </View>

            {stage ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Etapa relacionada</Text>
                <Text style={styles.detailBody}>{stage.name}</Text>
              </View>
            ) : null}

            {payment.observations ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Observacoes</Text>
                <Text style={styles.detailBody}>{payment.observations}</Text>
              </View>
            ) : null}

            {canMarkPaid ? (
              <Pressable style={({ pressed }) => [styles.successButton, (loading || pressed) && styles.buttonPressed]} onPress={onMarkPaid}>
                {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Dar Baixa</Text>}
              </Pressable>
            ) : null}

            {payment.status === "pendente" ? (
              <View style={styles.detailActionRow}>
                <Pressable style={({ pressed }) => [styles.successButton, styles.detailActionHalf, (loading || pressed) && styles.buttonPressed]} onPress={onApprove}>
                  {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Aprovar</Text>}
                </Pressable>
                <Pressable style={({ pressed }) => [styles.rejectButton, styles.detailActionHalf, (loading || pressed) && styles.buttonPressed]} onPress={onReject}>
                  {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.rejectButtonText}>Recusar</Text>}
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type PaymentsTab = "historico" | "programados" | "financeiro";

export function PaymentsScreen() {
  const { user } = useAuth();
  const { project, payments, isLoading } = usePayments();
  const { stages } = useStages();
  const upsertPayment = useUpsertPayment();
  const updateStatus = useUpdatePaymentStatus();
  const deletePayment = useDeletePayment();
  const [activeTab, setActiveTab] = useState<PaymentsTab>("historico");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);

  const totalPaid = payments
    .filter((payment) => payment.status === "pago" || payment.status === "aprovado")
    .reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
  const totalApproved = payments
    .filter((payment) => payment.status === "aprovado")
    .reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
  const totalPending = payments
    .filter((payment) => payment.status === "pendente")
    .reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
  const contractValue = Number(project?.total_contract_value ?? 0);
  const saldo = contractValue - totalPaid;
  const paidPercent = contractValue > 0 ? Math.round((totalPaid / contractValue) * 100) : 0;
  const scheduled = useMemo(
    () =>
      [...payments]
        .filter((payment) => payment.due_date && payment.status !== "pago")
        .sort((left, right) => (left.due_date && right.due_date ? left.due_date.localeCompare(right.due_date) : 0)),
    [payments],
  );

  const categoryData = useMemo(() => {
    return categoryOptions.map((category) => {
      const categoryPayments = payments.filter((payment) => payment.category === category.value);
      const total = categoryPayments.reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
      const paid = categoryPayments
        .filter((payment) => payment.status === "pago")
        .reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
      const approved = categoryPayments
        .filter((payment) => payment.status === "aprovado")
        .reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
      const pending = categoryPayments
        .filter((payment) => payment.status === "pendente" || payment.status === "em_analise")
        .reduce((sum, payment) => sum + Number(payment.requested_amount), 0);

      return { ...category, payments: categoryPayments, total, paid, approved, pending };
    });
  }, [payments]);

  const handleOpenNew = () => {
    setEditingPayment(null);
    setFormOpen(true);
  };

  const handleSave = async (payload: {
    period: string;
    category: PaymentCategory;
    plannedAmount: number;
    requestedAmount: number;
    description: string;
    percentWork: number;
    stageId: string | null;
    observations: string;
    dueDate: string | null;
  }) => {
    if (!project?.id || !user?.id) {
      Alert.alert("Casa nao configurada", "Configure a casa antes de registrar pagamentos.");
      return;
    }

    try {
      await upsertPayment.mutateAsync({
        id: editingPayment?.id,
        projectId: project.id,
        userId: user.id,
        period: payload.period,
        category: payload.category,
        plannedAmount: payload.plannedAmount,
        requestedAmount: payload.requestedAmount,
        description: payload.description,
        percentWork: payload.percentWork,
        stageId: payload.stageId,
        observations: payload.observations,
        dueDate: payload.dueDate,
      });

      setFormOpen(false);
      setEditingPayment(null);
      setSelectedPayment(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar o pagamento.";
      Alert.alert("Erro ao salvar", message);
    }
  };

  const handleUpdateStatus = async (status: PaymentStatus, paymentDate?: string | null) => {
    if (!project?.id || !user?.id || !selectedPayment) {
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: selectedPayment.id,
        projectId: project.id,
        userId: user.id,
        status,
        paymentDate,
      });

      setSelectedPayment(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel atualizar o status.";
      Alert.alert("Erro ao atualizar", message);
    }
  };

  const handleDelete = () => {
    if (!project?.id || !selectedPayment) {
      return;
    }

    Alert.alert("Excluir pagamento?", "Esse lancamento sera removido do financeiro da obra.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deletePayment
            .mutateAsync({ id: selectedPayment.id, projectId: project.id })
            .then(() => {
              setSelectedPayment(null);
              setEditingPayment(null);
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : "Nao foi possivel excluir o pagamento.";
              Alert.alert("Erro ao excluir", message);
            });
        },
      },
    ]);
  };

  if (!project) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Pagamentos</Text>
            <Text style={styles.subtitle}>Controle financeiro da obra</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>$</Text>
          <Text style={styles.emptyText}>Configure a casa antes de movimentar o financeiro da obra.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Pagamentos</Text>
          <Text style={styles.subtitle}>Solicitacoes, aprovacoes e saldo financeiro</Text>
        </View>

        <Pressable style={({ pressed }) => [styles.newButton, pressed && styles.buttonPressed]} onPress={handleOpenNew}>
          <Text style={styles.newButtonText}>+ Novo</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Carregando pagamentos...</Text>
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>$</Text>
          <Text style={styles.emptyText}>Nenhum pagamento registrado ainda. Crie o primeiro lancamento da obra.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{formatCurrency(totalPaid)}</Text>
              <Text style={styles.summaryLabel}>Total Pago</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{formatCurrency(saldo)}</Text>
              <Text style={styles.summaryLabel}>Saldo</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{formatCurrency(totalPending)}</Text>
              <Text style={styles.summaryLabel}>Pendentes</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{formatCurrency(totalApproved)}</Text>
              <Text style={styles.summaryLabel}>Aprovados</Text>
            </View>
          </View>

          <View style={styles.progressPanel}>
            {categoryData.map((category) => {
              const categoryExecuted = category.paid + category.approved;
              const percent = contractValue > 0 ? Math.round((categoryExecuted / contractValue) * 100) : 0;

              return (
                <View key={category.value} style={styles.progressMiniCard}>
                  <View style={styles.progressMiniHeader}>
                    <Text style={styles.progressMiniTitle}>{category.short}</Text>
                    <Text style={styles.progressMiniPercent}>{percent}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${percent}%` }]} />
                  </View>
                  <Text style={styles.progressMiniValue}>{formatCurrency(categoryExecuted)}</Text>
                </View>
              );
            })}

            <View style={styles.totalProgressCard}>
              <View style={styles.progressMiniHeader}>
                <Text style={styles.progressMiniTitle}>Total Executado</Text>
                <Text style={styles.progressMiniPercent}>{paidPercent}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${paidPercent}%` }]} />
              </View>
              <Text style={styles.progressCaption}>
                {formatCurrency(totalPaid)} de {formatCurrency(contractValue)}
              </Text>
            </View>
          </View>

          <View style={styles.tabBar}>
            {[
              { key: "historico", label: "Historico" },
              { key: "programados", label: "Programados" },
              { key: "financeiro", label: "Financeiro" },
            ].map((tab) => {
              const active = activeTab === tab.key;

              return (
                <Pressable key={tab.key} style={({ pressed }) => [styles.tabButton, active && styles.tabButtonActive, pressed && styles.buttonPressed]} onPress={() => setActiveTab(tab.key as PaymentsTab)}>
                  <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {activeTab === "historico" ? (
            <View style={styles.listBlock}>
              {payments.map((payment) => {
                const statusStyle = getStatusColors(payment.status);

                return (
                  <Pressable key={payment.id} style={({ pressed }) => [styles.paymentCard, pressed && styles.buttonPressed]} onPress={() => setSelectedPayment(payment)}>
                    <View style={styles.paymentCardTop}>
                      <Text style={styles.paymentPeriod}>{payment.period}</Text>
                      <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}>
                        <Text style={[styles.statusPillText, { color: statusStyle.text }]}>{statusOptions.find((option) => option.value === payment.status)?.label ?? payment.status}</Text>
                      </View>
                    </View>

                    <Text style={styles.paymentAmount}>{formatCurrency(Number(payment.requested_amount))}</Text>
                    <Text style={styles.paymentDescription} numberOfLines={1}>{payment.description}</Text>
                    <Text style={styles.paymentCategory}>{getCategoryLabel(payment.category)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {activeTab === "programados" ? (
            scheduled.length === 0 ? (
              <View style={styles.inlineEmptyCard}>
                <Text style={styles.inlineEmptyText}>Nenhum pagamento programado. Use data de vencimento para organizar os proximos lancamentos.</Text>
              </View>
            ) : (
              <View style={styles.listBlock}>
                {scheduled.map((payment) => {
                  const overdue = isOverdue(payment.due_date);
                  const statusStyle = getStatusColors(payment.status);

                  return (
                    <Pressable key={payment.id} style={({ pressed }) => [styles.paymentCard, styles.scheduledCard, overdue && styles.scheduledCardDanger, pressed && styles.buttonPressed]} onPress={() => setSelectedPayment(payment)}>
                      <View style={styles.paymentCardTop}>
                        <Text style={styles.paymentPeriod}>{payment.period}</Text>
                        <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}>
                          <Text style={[styles.statusPillText, { color: statusStyle.text }]}>{statusOptions.find((option) => option.value === payment.status)?.label ?? payment.status}</Text>
                        </View>
                      </View>

                      <Text style={styles.paymentAmount}>{formatCurrency(Number(payment.requested_amount))}</Text>
                      <Text style={[styles.dueText, overdue && styles.dueTextDanger]}>
                        Vence: {formatDate(payment.due_date)}
                        {overdue ? " • Vencido" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )
          ) : null}

          {activeTab === "financeiro" ? (
            <View style={styles.financeList}>
              {categoryData.map((category) => {
                const grandTotal = payments.reduce((sum, payment) => sum + Number(payment.requested_amount), 0);
                const sharePercent = grandTotal > 0 ? Math.round((category.total / grandTotal) * 100) : 0;

                return (
                  <View key={category.value} style={styles.financeCard}>
                    <View style={styles.financeHeader}>
                      <Text style={styles.financeTitle}>{category.label}</Text>
                      <Text style={styles.financeCounter}>{category.payments.length} lanc.</Text>
                    </View>
                    <View style={styles.financeTopRow}>
                      <Text style={styles.financeTotal}>{formatCurrency(category.total)}</Text>
                      <Text style={styles.financePercent}>{sharePercent}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${sharePercent}%` }]} />
                    </View>

                    <View style={styles.financeSummaryRow}>
                      <View style={styles.financeBadgeSuccess}>
                        <Text style={styles.financeBadgeLabel}>Pago</Text>
                        <Text style={styles.financeBadgeValue}>{formatCurrency(category.paid)}</Text>
                      </View>
                      <View style={styles.financeBadgeInfo}>
                        <Text style={styles.financeBadgeLabel}>Aprovado</Text>
                        <Text style={styles.financeBadgeValue}>{formatCurrency(category.approved)}</Text>
                      </View>
                      <View style={styles.financeBadgeWarning}>
                        <Text style={styles.financeBadgeLabel}>Pendente</Text>
                        <Text style={styles.financeBadgeValue}>{formatCurrency(category.pending)}</Text>
                      </View>
                    </View>

                    {category.payments.length > 0 ? (
                      <View style={styles.financeEntries}>
                        {category.payments.map((payment) => (
                          <Pressable key={payment.id} style={({ pressed }) => [styles.financeEntryRow, pressed && styles.buttonPressed]} onPress={() => setSelectedPayment(payment)}>
                            <View style={styles.financeEntryCopy}>
                              <Text style={styles.financeEntryPeriod}>{payment.period}</Text>
                              <Text numberOfLines={1} style={styles.financeEntryDescription}>{payment.description}</Text>
                            </View>
                            <Text style={styles.financeEntryAmount}>{formatCurrency(Number(payment.requested_amount))}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      )}

      <PaymentFormModal
        visible={formOpen}
        payment={editingPayment}
        stages={stages}
        loading={upsertPayment.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditingPayment(null);
        }}
        onSave={handleSave}
      />

      <PaymentDetailModal
        payment={selectedPayment}
        visible={Boolean(selectedPayment)}
        loading={updateStatus.isPending || deletePayment.isPending}
        stage={stages.find((stage) => stage.id === selectedPayment?.stage_id)}
        onClose={() => setSelectedPayment(null)}
        onEdit={() => {
          setEditingPayment(selectedPayment);
          setFormOpen(true);
        }}
        onDelete={handleDelete}
        onApprove={() => void handleUpdateStatus("aprovado")}
        onReject={() => void handleUpdateStatus("recusado")}
        onMarkPaid={() => void handleUpdateStatus("pago", new Date().toISOString().slice(0, 10))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  newButton: {
    borderRadius: 12,
    backgroundColor: "#d97b00",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexShrink: 0,
    alignSelf: "center",
  },
  newButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "800",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: colors.textMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 32,
    color: "#c7a98b",
  },
  emptyText: {
    textAlign: "center",
    color: "#4f6185",
    fontSize: 16,
    lineHeight: 23,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 32,
    gap: 14,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryCard: {
    width: "48.8%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1d3159",
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  progressPanel: {
    gap: 10,
  },
  progressMiniCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    gap: 8,
  },
  progressMiniHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressMiniTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  progressMiniPercent: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  progressMiniValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "700",
  },
  totalProgressCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#efe6dc",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#d8a16f",
  },
  progressCaption: {
    fontSize: 12,
    color: colors.textMuted,
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingVertical: 11,
    alignItems: "center",
  },
  tabButtonActive: {
    borderColor: "#d2b499",
    backgroundColor: colors.primarySoft,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  tabButtonTextActive: {
    color: colors.primary,
  },
  listBlock: {
    gap: 10,
  },
  paymentCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 8,
  },
  paymentCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  paymentPeriod: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  paymentAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  paymentDescription: {
    fontSize: 13,
    color: colors.textMuted,
  },
  paymentCategory: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
  },
  scheduledCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  scheduledCardDanger: {
    borderLeftColor: colors.danger,
  },
  dueText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "700",
  },
  dueTextDanger: {
    color: colors.danger,
  },
  inlineEmptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 16,
  },
  inlineEmptyText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: "center",
  },
  financeList: {
    gap: 12,
  },
  financeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 12,
  },
  financeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  financeTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  financeCounter: {
    fontSize: 12,
    color: colors.textMuted,
  },
  financeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  financeTotal: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  financePercent: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  financeSummaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  financeBadgeSuccess: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#e8f4ed",
    padding: 10,
    gap: 2,
  },
  financeBadgeInfo: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#e8efff",
    padding: 10,
    gap: 2,
  },
  financeBadgeWarning: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#fff4e2",
    padding: 10,
    gap: 2,
  },
  financeBadgeLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  financeBadgeValue: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
  },
  financeEntries: {
    gap: 8,
  },
  financeEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  financeEntryCopy: {
    flex: 1,
    gap: 2,
  },
  financeEntryPeriod: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  financeEntryDescription: {
    fontSize: 12,
    color: colors.textMuted,
  },
  financeEntryAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 28, 23, 0.42)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  modalCard: {
    width: "100%",
    maxHeight: "86%",
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  detailCard: {
    width: "100%",
    maxHeight: "86%",
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  closeIcon: {
    fontSize: 24,
    color: colors.textMuted,
    marginLeft: 12,
  },
  modalContent: {
    gap: 14,
    paddingBottom: 8,
  },
  fieldBlock: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  fieldInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  dateField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateFieldText: {
    color: colors.text,
    fontSize: 15,
  },
  dateFieldPlaceholder: {
    color: colors.textMuted,
    fontSize: 15,
  },
  dateFieldIcon: {
    color: colors.textMuted,
    fontSize: 15,
  },
  primaryInput: {
    borderWidth: 2,
    borderColor: "#d97b00",
  },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectFieldText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  selectFieldArrow: {
    color: colors.textMuted,
    fontSize: 18,
  },
  dropdownModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 28, 23, 0.12)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  dropdownModalCard: {
    maxHeight: 280,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  dropdownModalContent: {
    paddingVertical: 6,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dropdownItemActive: {
    backgroundColor: "#f1f2f7",
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: 15,
  },
  dropdownItemTextActive: {
    fontWeight: "700",
  },
  calendarModalCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calendarArrowButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  calendarArrowText: {
    color: colors.text,
    fontSize: 20,
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    textTransform: "lowercase",
  },
  calendarWeekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calendarWeekLabel: {
    width: "14.28%",
    textAlign: "center",
    fontSize: 12,
    color: colors.textMuted,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  calendarDay: {
    width: "14.28%",
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  calendarDaySelected: {
    backgroundColor: colors.primarySoft,
  },
  calendarDaySuggested: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 14,
  },
  calendarDayOutside: {
    color: colors.textMuted,
  },
  calendarDayTextSelected: {
    color: colors.primary,
    fontWeight: "800",
  },
  calendarDayTextSuggested: {
    color: colors.primary,
    fontWeight: "700",
  },
  calendarFooter: {
    paddingTop: 12,
    alignItems: "flex-end",
  },
  calendarClearButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  calendarClearText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  localError: {
    color: colors.danger,
    fontSize: 13,
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: "#d97b00",
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
  },
  detailTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  detailTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailPeriod: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  editPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  editPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  deletePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f1c9c3",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fdeae7",
  },
  deletePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.danger,
  },
  categoryPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  detailInfoCard: {
    width: "47.5%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  detailValueSmall: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  dueBanner: {
    borderRadius: 12,
    backgroundColor: "#eef4ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dueBannerDanger: {
    backgroundColor: "#fdeae7",
  },
  dueBannerText: {
    color: "#3566d6",
    fontSize: 13,
    fontWeight: "700",
  },
  dueBannerTextDanger: {
    color: colors.danger,
  },
  detailCaption: {
    fontSize: 13,
    color: colors.textMuted,
  },
  detailSection: {
    gap: 6,
  },
  detailSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  detailBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  successButton: {
    borderRadius: 14,
    backgroundColor: colors.success,
    paddingVertical: 14,
    alignItems: "center",
  },
  rejectButton: {
    borderRadius: 14,
    backgroundColor: colors.danger,
    paddingVertical: 14,
    alignItems: "center",
  },
  rejectButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
  },
  detailActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  detailActionHalf: {
    flex: 1,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
