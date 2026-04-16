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

const monthOptions = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

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

function PaymentFormModal(_: any) {
  const { visible, payment, projectId, stages, loading, onClose, onSave } = _;
  const [draft, setDraft] = useState({
    periodMonth: monthOptions[new Date().getMonth()],
    periodYear: new Date().getFullYear().toString(),
    category: "mao_de_obra_projeto",
    requestedAmount: "",
    description: "",
    stageId: null,
    dueDate: "",
    receiptUrl: ""
  });
  
  const [localError, setLocalError] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [isUploading, setIsStatusUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      const currentPeriod = payment?.period || "";
      const parts = currentPeriod.split(" ");
      const m = parts[0];
      const y = parts[1];
      setDraft({
        periodMonth: m || monthOptions[new Date().getMonth()],
        periodYear: y || new Date().getFullYear().toString(),
        category: payment?.category ?? "mao_de_obra_projeto",
        requestedAmount: payment?.requested_amount?.toString() ?? "",
        description: payment?.description ?? "",
        stageId: payment?.stage_id ?? null,
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
    if (!draft.requestedAmount) { setLocalError("Informe o valor."); return; }
    setIsStatusUploading(true);
    try {
      const finalReceiptUrl = await uploadAppMediaIfNeeded({
        uri: draft.receiptUrl,
        pathPrefix: `projects/${projectId}/payments/receipts`,
        fileBaseName: "receipt"
      });
      
      await onSave({ 
        ...draft, 
        period: `${draft.periodMonth} ${draft.periodYear}`,
        receiptUrl: finalReceiptUrl 
      });
    } catch (e) { setLocalError("Falha no upload do anexo."); }
    finally { setIsStatusUploading(false); }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{payment ? "Editar" : "Novo"} Pagamento</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Mês de Referência *</Text>
              <View style={styles.row}>
                <Pressable style={[styles.selectField, {flex: 2}]} onPress={() => setMonthOpen(true)}>
                  <Text style={styles.selectFieldText}>{draft.periodMonth}</Text>
                  <Text>˅</Text>
                </Pressable>
                <TextInput style={[styles.fieldInput, {flex: 1}]} value={draft.periodYear} onChangeText={v => setDraft(c => ({...c, periodYear: v}))} keyboardType="numeric" placeholder="Ano" />
              </View>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Valor Solicitado (R$) *</Text>
              <View style={styles.currencyInputWrapper}>
                <Text style={styles.currencyPrefix}>R$</Text>
                <TextInput style={[styles.fieldInput, {flex: 1, borderLeftWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0}]} value={draft.requestedAmount} onChangeText={v => setDraft(c => ({...c, requestedAmount: v.replace(",", ".")}))} keyboardType="decimal-pad" placeholder="0,00" />
              </View>
            </View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Vencimento</Text><Pressable style={styles.dateField} onPress={() => setDateOpen(true)}><Text style={styles.dateFieldText}>{draft.dueDate || "dd/mm/aaaa"}</Text><Text>◫</Text></Pressable></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Descrição / Título *</Text><TextInput style={styles.fieldInput} value={draft.description} onChangeText={v => setDraft(c => ({...c, description: v}))} placeholder="Ex: Adiantamento Quinzena" /></View>
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

      <Modal transparent visible={monthOpen} onRequestClose={() => setMonthOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMonthOpen(false)}>
          <View style={styles.dropdownModalCard}>
            <ScrollView style={{maxHeight: 300}}>{monthOptions.map(m => (
              <Pressable key={m} style={styles.dropdownItem} onPress={() => { setDraft(c => ({...c, periodMonth: m})); setMonthOpen(false); }}>
                <Text style={styles.dropdownItemText}>{m}</Text>
              </Pressable>
            ))}</ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal transparent visible={dateOpen} onRequestClose={() => setDateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDateOpen(false)}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarGrid}>{buildMonthGrid(new Date()).map(cell => (
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

function PaymentDetailModal(_: any) {
  const { payment, visible, loading, onClose, onEdit, onDelete, onApprove, onMarkPaid } = _;
  if (!payment) return null;
  const statusStyle = getStatusColors(payment.status);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.detailCard} onPress={() => undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Detalhe do Pagamento</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.detailRow}><Text style={styles.detailPeriod}>{payment.period}</Text><View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}><Text style={[styles.statusPillText, { color: statusStyle.text }]}>{payment.status.toUpperCase()}</Text></View></View>
            <Text style={styles.detailAmount}>{formatCurrency(Number(payment.requested_amount))}</Text>
            <Text style={styles.detailLabel}>Referente a: {payment.description}</Text>
            
            {payment.receipt_url && (
              <View style={styles.receiptSection}>
                <Text style={styles.detailLabel}>Anexo:</Text>
                <Pressable onPress={() => Linking.openURL(payment.receipt_url)}>
                  <Image source={{ uri: payment.receipt_url }} style={styles.receiptImageLarge} />
                </Pressable>
              </View>
            )}

            <View style={styles.detailActionRow}>
              <Pressable style={styles.editPill} onPress={onEdit}><Text style={styles.editPillText}>Editar</Text></Pressable>
              <Pressable style={styles.deletePill} onPress={onDelete}><Text style={styles.deletePillText}>Excluir</Text></Pressable>
            </View>

            <View style={styles.mainActionsRow}>
              {payment.status === "pendente" && <Pressable style={[styles.primaryButton, {flex: 1}]} onPress={onApprove}><Text style={styles.primaryButtonText}>Aprovar</Text></Pressable>}
              {payment.status === "aprovado" && <Pressable style={[styles.successButton, {flex: 1}]} onPress={onMarkPaid}><Text style={styles.primaryButtonText}>Confirmar Pagamento</Text></Pressable>}
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
  const deletePayment = useDeletePayment();
  
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);

  const handleSave = async (payload: any) => {
    if (!project?.id || !user?.id) return;
    await upsertPayment.mutateAsync({ 
      id: editingPayment?.id, projectId: project.id, userId: user.id, 
      ...payload, plannedAmount: 0, 
      requestedAmount: Number(payload.requestedAmount),
      percentWork: 0, stageId: payload.stageId, observations: "",
      dueDate: toIsoDate(payload.dueDate), receiptUrl: payload.receiptUrl
    });
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedPayment || !project?.id) return;
    Alert.alert("Excluir?", "Deseja remover este registro financeiro?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => {
        await deletePayment.mutateAsync({ id: selectedPayment.id, projectId: project.id });
        setSelectedPayment(null);
      }}
    ]);
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
              <Text style={styles.paymentDesc} numberOfLines={1}>{p.description}</Text>
              {p.receipt_url && <Text style={styles.attachmentBadge}>📎 Anexo</Text>}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <PaymentFormModal visible={formOpen} payment={editingPayment} projectId={project?.id} stages={stages} loading={upsertPayment.isPending} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <PaymentDetailModal payment={selectedPayment} visible={Boolean(selectedPayment)} loading={deletePayment.isPending} onClose={() => setSelectedPayment(null)} onEdit={() => { setEditingPayment(selectedPayment); setFormOpen(false); setSelectedPayment(null); setTimeout(()=>setFormOpen(true), 300); }} onDelete={handleDelete} onApprove={() => updateStatus.mutateAsync({ id: selectedPayment!.id, projectId: project!.id, userId: user!.id, status: "aprovado" }).then(()=>setSelectedPayment(null))} onMarkPaid={() => updateStatus.mutateAsync({ id: selectedPayment!.id, projectId: project!.id, userId: user!.id, status: "pago", paymentDate: isoDate(new Date()) }).then(()=>setSelectedPayment(null))} />
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
  paymentCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 4 },
  paymentCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paymentPeriod: { fontSize: 14, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  paymentAmount: { fontSize: 22, fontWeight: "800", color: colors.text },
  paymentDesc: { fontSize: 14, color: colors.textMuted },
  attachmentBadge: { fontSize: 12, color: colors.primary, fontWeight: "700", marginTop: 4 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
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
  currencyInputWrapper: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, overflow: "hidden" },
  currencyPrefix: { paddingLeft: 14, fontSize: 15, fontWeight: "700", color: colors.textMuted },
  dateField: { flexDirection: "row", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted },
  dateFieldText: { fontSize: 15 },
  selectField: { flexDirection: "row", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted },
  selectFieldText: { fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", gap: 10 },
  mediaButton: { height: 100, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: "dashed", backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mediaButtonText: { color: colors.textMuted, fontWeight: "700" },
  receiptPreview: { width: "100%", height: "100%" },
  receiptImageLarge: { width: "100%", height: 220, borderRadius: 16, marginTop: 10, backgroundColor: "#f0f0f0" },
  receiptSection: { gap: 8, marginTop: 10 },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  successButton: { borderRadius: 14, backgroundColor: colors.success, paddingVertical: 16, alignItems: "center" },
  editPill: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder, alignItems: "center", justifyContent: "center" },
  editPillText: { fontWeight: "700", fontSize: 14, color: colors.text, textAlign: "center", lineHeight: 20 },
  deletePill: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#fdeae7", borderWidth: 1, borderColor: "#f1c9c3", alignItems: "center", justifyContent: "center" },
  deletePillText: { fontWeight: "700", fontSize: 14, color: colors.danger, textAlign: "center", lineHeight: 20 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  detailPeriod: { fontSize: 18, fontWeight: "700", color: colors.textMuted },
  detailAmount: { fontSize: 32, fontWeight: "900", color: colors.text, marginBottom: 4 },
  detailLabel: { fontSize: 15, color: colors.text, lineHeight: 22 },
  detailActionRow: { flexDirection: "row", gap: 10, marginTop: 24, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 20 },
  mainActionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  localError: { color: colors.danger, fontSize: 13 },
  dropdownModalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 10, width: "80%", alignSelf: "center" },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dropdownItemText: { fontSize: 16, fontWeight: "600" },
  calendarModalCard: { backgroundColor: "#fff", padding: 20, borderRadius: 20, margin: 20 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDay: { width: "14.28%", height: 40, alignItems: "center", justifyContent: "center" },
  calendarDaySelected: { backgroundColor: colors.primary, borderRadius: 20 },
  calendarDayText: { fontSize: 14 },
  calendarDayOutside: { color: "#ccc" },
  buttonPressed: { opacity: 0.8 }
});
