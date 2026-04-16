import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
import { uploadAppMediaIfNeeded } from "../lib/appMedia";

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
const monthLabels = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function toDisplayDate(value: string | null) {
  if (!value) return "";
  return formatDate(value);
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
      date, iso: isoDate(date), dayNumber: date.getDate(),
      currentMonth: date.getMonth() === currentMonthDate.getMonth(),
    };
  });
}

function getStatusColors(status: PaymentStatus) {
  switch (status) {
    case "pago": return { background: "#e7f4ec", text: colors.success };
    case "aprovado": return { background: "#e6f0ff", text: "#3566d6" };
    case "em_analise": return { background: "#ece9ff", text: "#6a56d2" };
    case "recusado": return { background: "#fdeae7", text: colors.danger };
    default: return { background: "#fff3df", text: colors.warning };
  }
}

/**
 * Modal de Formulario para Pagamentos com suporte a Anexo de Comprovante.
 */
function PaymentFormModal(_: any) {
  const { visible, payment, stages, loading, onClose, onSave } = _;
  const [draft, setDraft] = useState({
    period: "", category: "mao_de_obra_projeto", plannedAmount: "", requestedAmount: "",
    description: "", percentWork: "", stageId: null, observations: "", dueDate: "", receiptUrl: ""
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());
  const [isUploading, setIsStatusUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft({
        period: payment?.period ?? "",
        category: payment?.category ?? "mao_de_obra_projeto",
        plannedAmount: payment?.planned_amount?.toString() ?? "",
        requestedAmount: payment?.requested_amount?.toString() ?? "",
        description: payment?.description ?? "",
        percentWork: payment?.percent_work?.toString() ?? "",
        stageId: payment?.stage_id ?? null,
        observations: payment?.observations ?? "",
        dueDate: toDisplayDate(payment?.due_date ?? null),
        receiptUrl: payment?.receipt_url ?? ""
      });
      setLocalError(null);
    }
  }, [payment, visible]);

  const pickReceipt = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Galeria", "Permissao necessaria."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setDraft(c => ({ ...c, receiptUrl: result.assets[0].uri }));
  };

  const handleSave = async () => {
    if (!draft.period.trim() || !draft.requestedAmount) { setLocalError("Preencha os campos obrigatorios."); return; }
    setIsStatusUploading(true);
    try {
      const finalReceiptUrl = await uploadAppMediaIfNeeded({
        uri: draft.receiptUrl,
        pathPrefix: `projects/${payment?.project_id || "new"}/payments/receipts`,
        fileBaseName: "receipt"
      });
      await onSave({ ...draft, receiptUrl: finalReceiptUrl });
    } catch (e) { setLocalError("Falha no upload do anexo."); }
    finally { setIsStatusUploading(false); }
  };

  const monthGrid = useMemo(() => buildMonthGrid(datePickerMonth), [datePickerMonth]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{payment ? "Editar" : "Novo"} Pagamento</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Periodo *</Text><TextInput style={styles.fieldInput} value={draft.period} onChangeText={v => setDraft(c => ({...c, period: v}))} placeholder="Ex: Abril/2026" /></View>
            <View style={styles.row}>
              <View style={[styles.fieldBlock, {flex: 1}]}><Text style={styles.fieldLabel}>Valor Solicitado *</Text><TextInput style={styles.fieldInput} value={draft.requestedAmount} onChangeText={v => setDraft(c => ({...c, requestedAmount: v}))} keyboardType="numeric" placeholder="0.00" /></View>
              <View style={[styles.fieldBlock, {flex: 1}]}><Text style={styles.fieldLabel}>Vencimento</Text><Pressable style={styles.dateField} onPress={() => setDateOpen(true)}><Text style={styles.dateFieldText}>{draft.dueDate || "dd/mm/aaaa"}</Text><Text>◫</Text></Pressable></View>
            </View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Comprovante / Nota</Text>
              <Pressable style={styles.mediaButton} onPress={pickReceipt}>
                {draft.receiptUrl ? <Image source={{ uri: draft.receiptUrl }} style={styles.receiptPreview} /> : <Text style={styles.mediaButtonText}>+ Anexar Foto</Text>}
              </Pressable>
            </View>
            {localError && <Text style={styles.localError}>{localError}</Text>}
            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || isUploading || pressed) && styles.buttonPressed]} onPress={handleSave}>
              {(loading || isUploading) ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar Pagamento</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <Modal transparent visible={dateOpen} onRequestClose={() => setDateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDateOpen(false)}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarGrid}>{monthGrid.map(cell => (
              <Pressable key={cell.key} style={[styles.calendarDay, toIsoDate(draft.dueDate) === cell.iso && styles.calendarDaySelected]} onPress={() => { setDraft(c => ({...c, dueDate: toDisplayDate(cell.iso)})); setDateOpen(false); }}>
                <Text style={[styles.calendarDayText, !cell.currentMonth && styles.calendarDayOutside]}>{cell.dayNumber}</Text>
              </Pressable>
            ))}</View>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

/**
 * Detalhes do Pagamento com visualização do anexo.
 */
function PaymentDetailModal(_: any) {
  const { payment, visible, onClose, onEdit, onApprove, onMarkPaid } = _;
  if (!payment) return null;
  const statusStyle = getStatusColors(payment.status);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.detailCard} onPress={() => undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Detalhe</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.detailPeriod}>{payment.period}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}><Text style={[styles.statusPillText, { color: statusStyle.text }]}>{payment.status.toUpperCase()}</Text></View>
            <Text style={styles.detailAmount}>{formatCurrency(Number(payment.requested_amount))}</Text>
            <Text style={styles.detailLabel}>Descricao: {payment.description}</Text>
            
            {payment.receipt_url && (
              <View style={styles.receiptSection}>
                <Text style={styles.detailLabel}>Comprovante:</Text>
                <Pressable onPress={() => Linking.openURL(payment.receipt_url)}>
                  <Image source={{ uri: payment.receipt_url }} style={styles.receiptImageLarge} />
                </Pressable>
              </View>
            )}

            <View style={styles.detailActionRow}>
              <Pressable style={styles.editPill} onPress={onEdit}><Text>Editar</Text></Pressable>
              {payment.status === "pendente" && <Pressable style={[styles.primaryButton, {flex: 1}]} onPress={onApprove}><Text style={styles.primaryButtonText}>Aprovar</Text></Pressable>}
              {payment.status === "aprovado" && <Pressable style={[styles.successButton, {flex: 1}]} onPress={onMarkPaid}><Text style={styles.primaryButtonText}>Baixar (Pago)</Text></Pressable>}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function PaymentsScreen() {
  const { user } = useAuth();
  const { project, payments, isLoading } = usePayments();
  const { stages } = useStages();
  const upsertPayment = useUpsertPayment();
  const updateStatus = useUpdatePaymentStatus();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);

  const handleSave = async (payload: any) => {
    if (!project?.id || !user?.id) return;
    await upsertPayment.mutateAsync({ 
      id: editingPayment?.id, projectId: project.id, userId: user.id, 
      ...payload, plannedAmount: Number(payload.plannedAmount), 
      requestedAmount: Number(payload.requestedAmount),
      percentWork: Number(payload.percentWork)
    });
    setFormOpen(false);
  };

  const handleApprove = async () => {
    if (selectedPayment && user) {
      await updateStatus.mutateAsync({ id: selectedPayment.id, projectId: project!.id, userId: user.id, status: "aprovado" });
      setSelectedPayment(null);
    }
  };

  const handleMarkPaid = async () => {
    if (selectedPayment && user) {
      await updateStatus.mutateAsync({ id: selectedPayment.id, projectId: project!.id, userId: user.id, status: "pago", paymentDate: isoDate(new Date()) });
      setSelectedPayment(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.title}>Pagamentos</Text></View>
        <Pressable style={styles.newButton} onPress={() => { setEditingPayment(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Novo</Text></Pressable>
      </View>

      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
        <ScrollView contentContainerStyle={styles.content}>
          {payments.map(p => (
            <Pressable key={p.id} style={styles.paymentCard} onPress={() => setSelectedPayment(p)}>
              <View style={styles.paymentCardTop}><Text style={styles.paymentPeriod}>{p.period}</Text><View style={[styles.statusPill, { backgroundColor: getStatusColors(p.status).background }]}><Text style={[styles.statusPillText, { color: getStatusColors(p.status).text }]}>{p.status}</Text></View></View>
              <Text style={styles.paymentAmount}>{formatCurrency(Number(p.requested_amount))}</Text>
              {p.receipt_url && <Text style={styles.attachmentBadge}>📎 Comprovante anexo</Text>}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <PaymentFormModal visible={formOpen} payment={editingPayment} stages={stages} loading={upsertPayment.isPending} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <PaymentDetailModal payment={selectedPayment} visible={Boolean(selectedPayment)} onClose={() => setSelectedPayment(null)} onEdit={() => { setEditingPayment(selectedPayment); setFormOpen(false); setSelectedPayment(null); setTimeout(()=>setFormOpen(true), 300); }} onApprove={handleApprove} onMarkPaid={handleMarkPaid} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  newButton: { borderRadius: 12, backgroundColor: "#d97b00", paddingHorizontal: 14, paddingVertical: 12 },
  newButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  content: { paddingTop: 16, paddingBottom: 32, gap: 10 },
  paymentCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 8 },
  paymentCardTop: { flexDirection: "row", justifyContent: "space-between" },
  paymentPeriod: { fontSize: 16, fontWeight: "800", color: colors.text },
  paymentAmount: { fontSize: 20, fontWeight: "800", color: colors.text },
  attachmentBadge: { fontSize: 12, color: colors.primary, fontWeight: "700", marginTop: 4 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  detailCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  closeIcon: { fontSize: 24, color: colors.textMuted },
  modalContent: { gap: 16 },
  fieldBlock: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "700" },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted },
  dateField: { flexDirection: "row", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted },
  dateFieldText: { fontSize: 15 },
  row: { flexDirection: "row", gap: 10 },
  mediaButton: { height: 120, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: "dashed", backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mediaButtonText: { color: colors.textMuted, fontWeight: "700" },
  receiptPreview: { width: "100%", height: "100%" },
  receiptImageLarge: { width: "100%", height: 200, borderRadius: 16, marginTop: 10 },
  receiptSection: { gap: 8, marginTop: 10 },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  successButton: { borderRadius: 14, backgroundColor: colors.success, paddingVertical: 16, alignItems: "center" },
  editPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder },
  detailActionRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  detailPeriod: { fontSize: 22, fontWeight: "800" },
  detailAmount: { fontSize: 28, fontWeight: "900", color: colors.text },
  detailLabel: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  localError: { color: colors.danger, fontSize: 13 },
  calendarModalCard: { backgroundColor: "#fff", padding: 20, borderRadius: 20, margin: 20 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDay: { width: "14.28%", height: 40, alignItems: "center", justifyContent: "center" },
  calendarDaySelected: { backgroundColor: colors.primary, borderRadius: 20 },
  calendarDayText: { fontSize: 14 },
  calendarDayOutside: { color: "#ccc" },
  buttonPressed: { opacity: 0.8 }
});
