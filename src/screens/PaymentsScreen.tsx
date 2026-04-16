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
import { Validator } from "../lib/validation";
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
import { AppIcon } from "../components/AppIcon";

/**
 * Opções de categoria para classificação financeira.
 */
const categoryOptions: { value: PaymentCategory | "todos"; label: string; short: string }[] = [
  { value: "todos", label: "Todas Categorias", short: "Todos" },
  { value: "mao_de_obra_projeto", label: "Mao de obra Projeto Inicial", short: "MO Projeto" },
  { value: "mao_de_obra_extras", label: "Mao de obra Servicos Extras", short: "MO Extras" },
  { value: "insumos_extras", label: "Insumos Servicos Extra", short: "Insumos Extra" },
];

/**
 * Status possíveis para o fluxo de aprovação e pagamento.
 */
const statusOptions: { value: PaymentStatus | "todos"; label: string }[] = [
  { value: "todos", label: "Todos Status" },
  { value: "pendente", label: "Pendente" },
  { value: "em_analise", label: "Em Analise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "pago", label: "Pago" },
  { value: "recusado", label: "Recusado" },
];

const monthOptions = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Formata valores numéricos para moeda Real (R$).
 */
function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/**
 * Converte data ISO para exibição brasileira.
 */
function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Converte data brasileira para ISO (banco).
 */
function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

/**
 * Gera a grade do seletor de datas.
 */
function buildMonthGrid(currentMonthDate: Date) {
  const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 35 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { key: `${date.getTime()}`, iso: date.toISOString().split("T")[0], dayNumber: date.getDate(), currentMonth: date.getMonth() === currentMonthDate.getMonth() };
  });
}

/**
 * Define cores baseadas no status do pagamento.
 */
function getStatusColors(status: PaymentStatus) {
  switch (status) {
    case "pago": return { background: colors.successLight, text: colors.success };
    case "aprovado": return { background: colors.infoLight, text: colors.info };
    case "em_analise": return { background: colors.warningLight, text: colors.warning };
    case "recusado": return { background: colors.dangerLight, text: colors.danger };
    default: return { background: colors.warningLight, text: colors.warning };
  }
}

/**
 * Modal de Formulario: Cadastro e edicao de solicitacoes financeiras.
 * future_fix: Adicionar suporte a múltiplos anexos por pagamento.
 */
function PaymentFormModal(_: any) {
  const { visible, payment, projectId, stages, loading, onClose, onSave } = _;
  const [draft, setDraft] = useState({
    periodMonth: monthOptions[new Date().getMonth()],
    periodYear: new Date().getFullYear().toString(),
    category: "mao_de_obra_projeto" as PaymentCategory,
    requestedAmount: "", description: "", stageId: null, dueDate: "", receiptUrl: ""
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [isUploading, setIsStatusUploading] = useState(false);

  // Sincroniza estado com dados reais ao abrir para edicao.
  useEffect(() => {
    if (visible) {
      const currentPeriod = payment?.period || "";
      const parts = currentPeriod.split(" ");
      setDraft({
        periodMonth: parts[0] || monthOptions[new Date().getMonth()],
        periodYear: parts[1] || new Date().getFullYear().toString(),
        category: payment?.category ?? "mao_de_obra_projeto",
        requestedAmount: payment?.requested_amount?.toString() ?? "",
        description: payment?.description ?? "",
        stageId: payment?.stage_id ?? null,
        dueDate: payment?.due_date ? `${payment.due_date.split("-")[2]}/${payment.due_date.split("-")[1]}/${payment.due_date.split("-")[0]}` : "",
        receiptUrl: payment?.receipt_url ?? ""
      });
      setLocalError(null);
    }
  }, [payment, visible]);

  /**
   * Captura foto do comprovante e gerencia o upload para o Storage.
   */
  const handleSave = async () => {
    const descVal = Validator.required(draft.description, "descrição");
    if (!descVal.isValid) { setLocalError(descVal.error!); return; }

    const amountVal = Validator.number(draft.requestedAmount, "valor solicitado", 0.01);
    if (!amountVal.isValid) { setLocalError(amountVal.error!); return; }

    setIsStatusUploading(true);
    try {
      const finalReceiptUrl = await uploadAppMediaIfNeeded({
        uri: draft.receiptUrl,
        pathPrefix: `projects/${projectId}/payments/receipts`,
        fileBaseName: "receipt"
      });
      await onSave({ ...draft, requestedAmount: amountVal.parsedValue, period: `${draft.periodMonth} ${draft.periodYear}`, receiptUrl: finalReceiptUrl });
    } catch (e) { setLocalError("Falha no upload."); }
    finally { setIsStatusUploading(false); }
  };

  const pickReceipt = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Galeria", "Permissao necessaria."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setDraft(c => ({ ...c, receiptUrl: result.assets[0].uri }));
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{payment ? "Editar" : "Novo"} Pagamento</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Referencia</Text><View style={styles.row}><Pressable style={[styles.selectField, {flex: 2}]} onPress={() => setMonthOpen(true)}><Text style={styles.selectFieldText}>{draft.periodMonth}</Text></Pressable><TextInput style={[styles.fieldInput, {flex: 1}]} value={draft.periodYear} onChangeText={v => setDraft(c => ({...c, periodYear: v}))} keyboardType="numeric" /></View></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Valor (R$)</Text><TextInput style={styles.fieldInput} value={draft.requestedAmount} onChangeText={v => setDraft(c => ({...c, requestedAmount: v}))} keyboardType="numeric" placeholder="0.00" /></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Vencimento</Text><Pressable style={styles.dateField} onPress={() => setDateOpen(true)}><Text style={styles.dateFieldText}>{draft.dueDate || "dd/mm/aaaa"}</Text></Pressable></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Descrição</Text><TextInput style={styles.fieldInput} value={draft.description} onChangeText={v => setDraft(c => ({...c, description: v}))} /></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Comprovante</Text><Pressable style={styles.mediaButton} onPress={pickReceipt}>{draft.receiptUrl ? <Image source={{ uri: draft.receiptUrl }} style={styles.receiptPreview} /> : <Text style={styles.mediaButtonText}>+ Anexar Foto</Text>}</Pressable></View>
            {localError && <Text style={styles.localError}>{localError}</Text>}
            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || isUploading || pressed) && styles.buttonPressed]} onPress={handleSave}>
              {(loading || isUploading) ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
      <Modal transparent visible={monthOpen} onRequestClose={() => setMonthOpen(false)}><Pressable style={styles.modalBackdrop} onPress={() => setMonthOpen(false)}><View style={styles.dropdownModalCard}><ScrollView>{monthOptions.map(m => (<Pressable key={m} style={styles.dropdownItem} onPress={() => { setDraft(c => ({...c, periodMonth: m})); setMonthOpen(false); }}><Text style={styles.dropdownItemText}>{m}</Text></Pressable>))}</ScrollView></View></Pressable></Modal>
      <Modal transparent visible={dateOpen} onRequestClose={() => setDateOpen(false)}><Pressable style={styles.modalBackdrop} onPress={() => setDateOpen(false)}><View style={styles.calendarModalCard}><View style={styles.calendarGrid}>{buildMonthGrid(new Date()).map(cell => (<Pressable key={cell.key} style={styles.calendarDay} onPress={() => { setDraft(c => ({...c, dueDate: `${cell.iso.split("-")[2]}/${cell.iso.split("-")[1]}/${cell.iso.split("-")[0]}`})); setDateOpen(false); }}><Text>{cell.dayNumber}</Text></Pressable>))}</View></View></Pressable></Modal>
    </Modal>
  );
}

/**
 * Modal de Detalhes: Visualizacao, aprovacao e exclusao de pagamentos.
 */
function PaymentDetailModal(_: any) {
  const { payment, visible, onClose, onEdit, onDelete, onApprove, onMarkPaid } = _;
  if (!payment) return null;
  const statusStyle = getStatusColors(payment.status);
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}><Pressable style={styles.detailCard} onPress={() => undefined}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Detalhe</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}><View style={styles.detailRow}><Text style={styles.detailPeriod}>{payment.period}</Text><View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}><Text style={[styles.statusPillText, { color: statusStyle.text }]}>{payment.status.toUpperCase()}</Text></View></View><Text style={styles.detailAmount}>{formatCurrency(Number(payment.requested_amount))}</Text><Text style={styles.detailLabel}>Desc: {payment.description}</Text>{payment.receipt_url && <Pressable onPress={() => Linking.openURL(payment.receipt_url)}><Image source={{ uri: payment.receipt_url }} style={styles.receiptImageLarge} /></Pressable>}<View style={styles.detailActionRow}><Pressable style={styles.editPill} onPress={onEdit}><Text style={styles.editPillText}>Editar</Text></Pressable><Pressable style={styles.deletePill} onPress={onDelete}><Text style={styles.deletePillText}>Excluir</Text></Pressable></View><View style={styles.mainActionsRow}>{payment.status === "pendente" && <Pressable style={[styles.primaryButton, {flex: 1}]} onPress={onApprove}><Text style={styles.primaryButtonText}>Aprovar</Text></Pressable>}{payment.status === "aprovado" && <Pressable style={[styles.successButton, {flex: 1}]} onPress={onMarkPaid}><Text style={styles.primaryButtonText}>Confirmar</Text></Pressable>}</View></ScrollView></Pressable></Pressable>
    </Modal>
  );
}

/**
 * Tela Financeira: Gestao de fluxo de caixa e comprovantes.
 * future_fix: Adicionar gráfico de 'Gasto por Categoria' para analise de custos.
 */
export function PaymentsScreen() {
  const { user } = useAuth();
  const { project, payments, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = usePayments();
  const { stages } = useStages();
  const upsertPayment = useUpsertPayment();
  const updateStatus = useUpdatePaymentStatus();
  const deletePayment = useDeletePayment();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "todos">("todos");

  /**
   * Filtra pagamentos por busca textual e status.
   */
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const matchSearch = p.description.toLowerCase().includes(searchQuery.toLowerCase()) || p.period.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "todos" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [payments, searchQuery, statusFilter]);

  const handleSave = async (payload: any) => {
    if (!project?.id || !user?.id) return;
    await upsertPayment.mutateAsync({ id: editingPayment?.id, projectId: project.id, userId: user.id, ...payload, plannedAmount: 0, requestedAmount: Number(payload.requestedAmount), percentWork: 0, stageId: payload.stageId, observations: "", dueDate: toIsoDate(payload.dueDate), receiptUrl: payload.receiptUrl });
    setFormOpen(false);
  };

  const totalPaid = useMemo(() => payments.filter(p => p.status === "pago" || p.status === "aprovado").reduce((sum, p) => sum + Number(p.requested_amount), 0), [payments]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}><View><Text style={styles.title}>Financeiro</Text></View><Pressable style={styles.newButton} onPress={() => { setEditingPayment(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Novo</Text></Pressable></View>
      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <AppIcon name="Search" size={18} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Buscar..." value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery !== "" && (
            <Pressable onPress={() => setSearchQuery("")}>
              <AppIcon name="XCircle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {statusOptions.map(opt => (<Pressable key={opt.value} style={[styles.chip, statusFilter === opt.value && styles.chipActive]} onPress={() => setStatusFilter(opt.value)}><Text style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>{opt.label}</Text></Pressable>))}
        </ScrollView>
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.totalPaidCard}><Text style={styles.totalLabel}>Total Pago/Aprovado</Text><Text style={styles.totalValue}>{formatCurrency(totalPaid)}</Text></View>
          {filteredPayments.length === 0 ? <Text style={styles.emptySearchText}>Nenhum pagamento encontrado.</Text> : filteredPayments.map(p => (
            <Pressable key={p.id} style={styles.paymentCard} onPress={() => setSelectedPayment(p)}>
              <View style={styles.paymentCardTop}><Text style={styles.paymentPeriod}>{p.period}</Text><View style={[styles.statusPill, { backgroundColor: getStatusColors(p.status).background }]}><Text style={[styles.statusPillText, { color: getStatusColors(p.status).text }]}>{p.status}</Text></View></View>
              <Text style={styles.paymentAmount}>{formatCurrency(Number(p.requested_amount))}</Text>
              <Text style={styles.paymentDesc} numberOfLines={1}>{p.description}</Text>
              {p.receipt_url && <Text style={styles.attachmentBadge}>📎 Comprovante</Text>}
            </Pressable>
          ))}

          {hasNextPage && (
            <Pressable 
              style={({ pressed }) => [styles.loadMoreButton, pressed && styles.buttonPressed]} 
              onPress={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Carregar pagamentos anteriores...</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      )}
      <PaymentFormModal visible={formOpen} payment={editingPayment} projectId={project?.id} stages={stages} loading={upsertPayment.isPending} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <PaymentDetailModal payment={selectedPayment} visible={Boolean(selectedPayment)} onClose={() => setSelectedPayment(null)} onEdit={() => { setEditingPayment(selectedPayment); setFormOpen(false); setSelectedPayment(null); setTimeout(()=>setFormOpen(true), 300); }} onApprove={() => updateStatus.mutateAsync({ id: selectedPayment!.id, projectId: project!.id, userId: user!.id, status: "aprovado" }).then(()=>setSelectedPayment(null))} onMarkPaid={() => updateStatus.mutateAsync({ id: selectedPayment!.id, projectId: project!.id, userId: user!.id, status: "pago", paymentDate: isoDate(new Date()) }).then(()=>setSelectedPayment(null))} onDelete={() => { Alert.alert("Excluir?", "Remover registro?", [{ text: "Não" }, { text: "Sim", style: "destructive", onPress: () => deletePayment.mutateAsync({ id: selectedPayment!.id, projectId: project!.id }).then(()=>setSelectedPayment(null)) }]); }} />
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
  content: { paddingBottom: 32, gap: 10 },
  totalPaidCard: { backgroundColor: colors.primary, borderRadius: 16, padding: 16, marginBottom: 6 },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  totalValue: { color: colors.surface, fontSize: 24, fontWeight: "900" },
  paymentCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 4 },
  paymentCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paymentPeriod: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  paymentAmount: { fontSize: 20, fontWeight: "800", color: colors.text },
  paymentDesc: { fontSize: 14, color: colors.textMuted },
  attachmentRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  attachmentBadge: { fontSize: 11, color: colors.primary, fontWeight: "800" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  detailCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalContent: { gap: 16 },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted, color: colors.text },
  selectField: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted },
  selectFieldText: { fontSize: 15, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", gap: 10 },
  mediaButton: { height: 100, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: "dashed", backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mediaButtonText: { color: colors.textMuted, fontWeight: "700" },
  receiptPreview: { width: "100%", height: "100%" },
  receiptImageLarge: { width: "100%", height: 200, borderRadius: 16, marginTop: 10 },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: colors.surface, fontWeight: "800", fontSize: 15 },
  successButton: { borderRadius: 14, backgroundColor: colors.success, paddingVertical: 16, alignItems: "center" },
  editPill: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: "center" },
  editPillText: { fontWeight: "700", color: colors.text },
  deletePill: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.dangerLight, alignItems: "center" },
  deletePillText: { color: colors.danger, fontWeight: "700" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  detailPeriod: { fontSize: 16, fontWeight: "700", color: colors.textMuted },
  detailAmount: { fontSize: 32, fontWeight: "900", color: colors.text },
  detailLabel: { fontSize: 14, color: colors.textMuted },
  detailActionRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  mainActionsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  localError: { color: colors.danger, fontSize: 13 },
  dropdownModalCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 10, width: "80%", alignSelf: "center" },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dropdownItemText: { fontSize: 16, fontWeight: "600", color: colors.text },
  emptySearchText: { textAlign: "center", paddingVertical: 40, color: colors.textMuted },
  buttonPressed: { opacity: 0.8 },
  loadMoreButton: { padding: 16, alignItems: "center" },
  loadMoreText: { color: colors.primary, fontWeight: "700" }
});
