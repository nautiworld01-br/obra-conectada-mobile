import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
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
import { useAuth } from "../contexts/AuthContext";
import { Validator } from "../lib/validation";
import { AnimatedModal } from "../components/AnimatedModal";
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
import { useProfile } from "../hooks/useProfile";
import { uploadAppMediaIfNeeded } from "../lib/appMedia";
import { AppIcon } from "../components/AppIcon";
import { AppDatePicker } from "../components/AppDatePicker";

const categoryOptions: { value: PaymentCategory | "todos"; label: string; short: string }[] = [
  { value: "todos", label: "Todas Categorias", short: "Todos" },
  { value: "mao_de_obra_projeto", label: "Mão de obra Projeto Inicial", short: "MO Projeto" },
  { value: "mao_de_obra_extras", label: "Mão de obra Serviços Extras", short: "MO Extras" },
  { value: "insumos_extras", label: "Insumos Serviços Extra", short: "Insumos Extra" },
];

const statusOptions: { value: PaymentStatus | "todos"; label: string }[] = [
  { value: "todos", label: "Todos Status" },
  { value: "pendente", label: "Pendente" },
  { value: "em_analise", label: "Em Análise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "pago", label: "Pago" },
  { value: "recusado", label: "Recusado" },
];

const monthOptions = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function getStatusColors(status: PaymentStatus) {
  switch (status) {
    case "pago": return { background: colors.successLight, text: colors.success };
    case "aprovado": return { background: colors.infoLight, text: colors.info };
    case "em_analise": return { background: colors.warningLight, text: colors.warning };
    case "recusado": return { background: colors.dangerLight, text: colors.danger };
    default: return { background: colors.warningLight, text: colors.warning };
  }
}

function PaymentFormModal({ visible, payment, projectId, loading, onClose, onSave }: any) {
  const [draft, setDraft] = useState({
    periodMonth: monthOptions[new Date().getMonth()],
    periodYear: new Date().getFullYear().toString(),
    category: "mao_de_obra_projeto" as PaymentCategory,
    requestedAmount: "", description: "", stageId: null, dueDate: "", receiptUrl: ""
  });
  const [monthOpen, setMonthOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
        dueDate: payment?.due_date ?? "",
        receiptUrl: payment?.receipt_url ?? ""
      });
      setLocalError(null);
    }
  }, [payment, visible]);

  const handleSave = async () => {
    if (!draft.description.trim()) { setLocalError("Descrição obrigatória."); return; }
    const amountVal = Validator.number(draft.requestedAmount, "valor", 0.01);
    if (!amountVal.isValid) { setLocalError(amountVal.error!); return; }

    setIsUploading(true);
    try {
      const finalReceiptUrl = await uploadAppMediaIfNeeded({
        uri: draft.receiptUrl,
        pathPrefix: `projects/${projectId}/payments/receipts`,
        fileBaseName: "receipt"
      });
      await onSave({ 
        ...draft, 
        requestedAmount: amountVal.parsedValue, 
        period: `${draft.periodMonth} ${draft.periodYear}`, 
        receiptUrl: finalReceiptUrl 
      });
    } catch (e) { setLocalError("Erro no upload."); }
    finally { setIsUploading(false); }
  };

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setDraft(c => ({ ...c, receiptUrl: result.assets[0].uri }));
  };

  return (
    <AnimatedModal visible={visible} onRequestClose={onClose} position="bottom" contentStyle={styles.modalCard}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{payment ? "Editar" : "Novo"} Pagamento</Text>
        <Pressable onPress={onClose}><AppIcon name="X" size={24} color={colors.textMuted} /></Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Referência</Text><View style={styles.row}><Pressable style={[styles.selectField, {flex: 2}]} onPress={() => setMonthOpen(true)}><Text style={styles.selectFieldText}>{draft.periodMonth}</Text></Pressable><TextInput style={[styles.fieldInput, {flex: 1}]} value={draft.periodYear} onChangeText={v => setDraft(c => ({...c, periodYear: v}))} keyboardType="numeric" /></View></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Valor (R$)</Text><TextInput style={styles.fieldInput} value={draft.requestedAmount} onChangeText={v => setDraft(c => ({...c, requestedAmount: v}))} keyboardType="numeric" placeholder="0.00" /></View>
            <View style={styles.fieldBlock}><AppDatePicker label="Vencimento" value={draft.dueDate} onChange={(v) => setDraft(c => ({ ...c, dueDate: v }))} /></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Descrição</Text><TextInput style={styles.fieldInput} value={draft.description} onChangeText={v => setDraft(c => ({...c, description: v}))} /></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Comprovante</Text><Pressable style={styles.mediaButton} onPress={pickReceipt}>{draft.receiptUrl ? <Image source={{ uri: draft.receiptUrl }} style={styles.receiptPreview} /> : <Text style={styles.mediaButtonText}>+ Anexar Foto</Text>}</Pressable></View>
            {localError && <Text style={styles.localError}>{localError}</Text>}
            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || isUploading || pressed) && styles.buttonPressed]} onPress={handleSave} disabled={loading || isUploading}>
              {(loading || isUploading) ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar</Text>}
            </Pressable>
      </ScrollView>
      <Modal transparent visible={monthOpen} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setMonthOpen(false)}>
          <View style={styles.dropdownModalCard}><ScrollView>{monthOptions.map(m => (<Pressable key={m} style={styles.dropdownItem} onPress={() => { setDraft(c => ({...c, periodMonth: m})); setMonthOpen(false); }}><Text style={styles.dropdownItemText}>{m}</Text></Pressable>))}</ScrollView></View>
        </Pressable>
      </Modal>
    </AnimatedModal>
  );
}

function PaymentDetailModal({ payment, visible, isOwner, onClose, onEdit, onDelete, onApprove, onMarkPaid, onReview }: any) {
  if (!payment) return null;
  const statusStyle = getStatusColors(payment.status);
  return (
    <AnimatedModal visible={visible} onRequestClose={onClose} position="bottom" contentStyle={styles.detailCard}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Detalhe do Pagamento</Text>
        <Pressable onPress={onClose}><AppIcon name="X" size={24} color={colors.textMuted} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.detailRow}>
              <Text style={styles.detailPeriod}>{payment.period}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}><Text style={[styles.statusPillText, { color: statusStyle.text }]}>{payment.status.toUpperCase()}</Text></View>
            </View>
            <Text style={styles.detailAmount}>{formatCurrency(Number(payment.requested_amount))}</Text>
            <Text style={styles.detailLabel}>Vencimento: {formatDate(payment.due_date)}</Text>
            <Text style={styles.detailLabel}>Desc: {payment.description}</Text>
            {payment.receipt_url && <Pressable onPress={() => Linking.openURL(payment.receipt_url)}><Image source={{ uri: payment.receipt_url }} style={styles.receiptImageLarge} /></Pressable>}
            <View style={styles.detailActionRow}>
              <Pressable style={styles.editPill} onPress={onEdit}><Text style={styles.editPillText}>Editar</Text></Pressable>
              <Pressable style={styles.deletePill} onPress={onDelete}><Text style={styles.deletePillText}>Excluir</Text></Pressable>
            </View>
            
            {/* Acoes Restritas ao Proprietario */}
            {isOwner && (
              <View style={styles.mainActionsRow}>
                {payment.status === "pendente" && (
                  <Pressable style={[styles.approveButton, {flex: 1}]} onPress={onApprove}>
                    <AppIcon name="Check" size={20} color={colors.surface} />
                    <Text style={styles.primaryButtonText}>Aprovar</Text>
                  </Pressable>
                )}
                {payment.status === "aprovado" && (
                  <View style={{ flex: 1, gap: 12 }}>
                    <Pressable style={styles.successButton} onPress={onMarkPaid}>
                      <AppIcon name="CreditCard" size={20} color={colors.surface} />
                      <Text style={styles.primaryButtonText}>Confirmar Pagamento</Text>
                    </Pressable>
                    <Pressable style={styles.revertLink} onPress={() => onReview("pendente")}>
                      <AppIcon name="RotateCcw" size={12} color={colors.textMuted} />
                      <Text style={styles.revertLinkText}>Voltar para Pendente</Text>
                    </Pressable>
                  </View>
                )}
                {payment.status === "pago" && (
                  <View style={{ flex: 1 }}>
                    <Pressable style={styles.revertLink} onPress={() => onReview("aprovado")}>
                      <AppIcon name="RotateCcw" size={12} color={colors.textMuted} />
                      <Text style={styles.revertLinkText}>Estornar (Voltar para Aprovado)</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
      </ScrollView>
    </AnimatedModal>
  );
}

export function PaymentsScreen() {
  const { user } = useAuth();
  const { isOwner } = useProfile();
  const { project, payments, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = usePayments();
  const upsertPayment = useUpsertPayment();
  const updateStatus = useUpdatePaymentStatus();
  const deletePayment = useDeletePayment();
  
  const [activeTab, setActiveTab] = useState<"historico" | "programados" | "financeiro">("historico");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "todos">("todos");

  /**
   * Calculos de Resumo Financeiro (Plano Diretor)
   */
  const financialMetrics = useMemo(() => {
    const initialContract = project?.total_contract_value ?? 0;
    const today = new Date().toISOString().split("T")[0];
    
    const stats = payments.reduce((acc, p) => {
      const val = Number(p.requested_amount);
      const isPaid = p.status === "pago" || p.status === "aprovado";
      
      acc.totalRequested += val;
      if (isPaid) acc.totalApproved += val;
      if (p.status === "pendente" || p.status === "em_analise") acc.totalPending += val;

      // Agrupamento por Categoria (apenas pagos/aprovados)
      if (isPaid) {
        if (p.category === "mao_de_obra_projeto") acc.moProjeto += val;
        if (p.category === "mao_de_obra_extras") acc.moExtras += val;
        if (p.category === "insumos_extras") acc.insumosExtras += val;
      }

      // Identificação de Vencidos (Programados)
      if (!isPaid && p.due_date && p.due_date < today) {
        acc.overdueCount += 1;
        acc.overdueAmount += val;
      }

      return acc;
    }, { 
      totalRequested: 0, totalApproved: 0, totalPending: 0, 
      moProjeto: 0, moExtras: 0, insumosExtras: 0,
      overdueCount: 0, overdueAmount: 0
    });

    const moPercent = initialContract > 0 ? Math.round((stats.moProjeto / initialContract) * 100) : 0;
    const overallPercent = initialContract > 0 ? Math.round((stats.totalApproved / initialContract) * 100) : 0;

    return { ...stats, moPercent, overallPercent, initialContract };
  }, [payments, project]);

  /**
   * Filtragem Inteligente baseada na Aba Ativa
   */
  const filteredPayments = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];

    return payments.filter(p => {
      const matchSearch = p.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.period.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "todos" || p.status === statusFilter;

      if (activeTab === "programados") {
        const isNotPaid = p.status !== "pago" && p.status !== "aprovado";
        return isNotPaid && p.due_date; // Apenas o que tem data e não está pago
      }

      return matchSearch && matchStatus;
    });
  }, [payments, searchQuery, statusFilter, activeTab]);

  const handleSave = async (payload: any) => {
    if (!project?.id || !user?.id) return;
    try {
      await upsertPayment.mutateAsync({ 
        id: editingPayment?.id, 
        projectId: project.id, 
        userId: user.id, 
        ...payload, 
        plannedAmount: 0, 
        requestedAmount: Number(payload.requestedAmount), 
        percentWork: 0, 
        stageId: payload.stageId, 
        observations: "", 
        dueDate: payload.dueDate || null, 
        receiptUrl: payload.receiptUrl 
      });
      setFormOpen(false);
      Toast.show({ type: "success", text1: "Pagamento salvo" });
    } catch (e) { Alert.alert("Erro", "Falha ao salvar pagamento."); }
  };

  const handleDelete = () => {
    if (!selectedPayment || !project?.id) return;
    const performDelete = async () => {
      await deletePayment.mutateAsync({ id: selectedPayment.id, projectId: project.id });
      setSelectedPayment(null);
      Toast.show({ type: "success", text1: "Registro removido" });
    };
    if (Platform.OS === "web") {
      if (window.confirm("Deseja excluir este registro?")) void performDelete();
    } else {
      Alert.alert("Excluir?", "Remover registro?", [{ text: "Não" }, { text: "Sim", style: "destructive", onPress: () => void performDelete() }]);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}><Text style={styles.title}>Financeiro</Text><Pressable style={styles.newButton} onPress={() => { setEditingPayment(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Novo</Text></Pressable></View>
      
      <View style={styles.summaryContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryScroll}>
          <View style={[styles.summaryCard, { backgroundColor: colors.text }]}>
            <Text style={styles.summaryLabel}>TOTAL SOLICITADO</Text>
            <Text style={styles.summaryValue}>{formatCurrency(financialMetrics.totalRequested)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.info }]}>
            <Text style={styles.summaryLabel}>APROVADO + PAGO</Text>
            <Text style={styles.summaryValue}>{formatCurrency(financialMetrics.totalApproved)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.warning }]}>
            <Text style={styles.summaryLabel}>PENDENTE ANALISE</Text>
            <Text style={styles.summaryValue}>{formatCurrency(financialMetrics.totalPending)}</Text>
          </View>
        </ScrollView>
      </View>

      <View style={styles.tabsContainer}>
        <Pressable style={[styles.tabBtn, activeTab === "historico" && styles.tabBtnActive]} onPress={() => setActiveTab("historico")}>
          <Text style={[styles.tabBtnText, activeTab === "historico" && styles.tabBtnTextActive]}>Histórico</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === "programados" && styles.tabBtnActive]} onPress={() => setActiveTab("programados")}>
          <View style={styles.row}>
            <Text style={[styles.tabBtnText, activeTab === "programados" && styles.tabBtnTextActive]}>Programados</Text>
            {financialMetrics.overdueCount > 0 && <View style={styles.overdueBadge} />}
          </View>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === "financeiro" && styles.tabBtnActive]} onPress={() => setActiveTab("financeiro")}>
          <Text style={[styles.tabBtnText, activeTab === "financeiro" && styles.tabBtnTextActive]}>Análise</Text>
        </Pressable>
      </View>

      {activeTab === "financeiro" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.executionSection}>
            <View style={styles.executionHeader}>
              <Text style={styles.executionTitle}>Execução Orçamentária</Text>
              <Text style={styles.executionContract}>Contrato: {formatCurrency(financialMetrics.initialContract)}</Text>
            </View>

            <View style={styles.barContainer}>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>Mão de Obra (Projeto)</Text>
                <Text style={styles.barPercent}>{financialMetrics.moPercent}%</Text>
              </View>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.min(financialMetrics.moPercent, 100)}%`, backgroundColor: colors.primary }]} /></View>
              <Text style={styles.barSubLabel}>Gasto: {formatCurrency(financialMetrics.moProjeto)}</Text>
            </View>

            <View style={styles.barContainer}>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>Extras e Insumos</Text>
                <Text style={styles.barAmount}>{formatCurrency(financialMetrics.moExtras + financialMetrics.insumosExtras)}</Text>
              </View>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.min(financialMetrics.overallPercent, 100)}%`, backgroundColor: colors.secondary }]} /></View>
              <Text style={styles.barSubLabel}>Mão de Obra Extras: {formatCurrency(financialMetrics.moExtras)}</Text>
              <Text style={styles.barSubLabel}>Insumos Extras: {formatCurrency(financialMetrics.insumosExtras)}</Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={styles.filterSection}>
            {activeTab === "historico" && (
              <>
                <View style={styles.searchBar}><AppIcon name="Search" size={18} color={colors.textMuted} /><TextInput style={styles.searchInput} placeholder="Buscar..." value={searchQuery} onChangeText={setSearchQuery} />{searchQuery !== "" && <Pressable onPress={() => setSearchQuery("")}><AppIcon name="XCircle" size={18} color={colors.textMuted} /></Pressable>}</View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                  {statusOptions.map(opt => (<Pressable key={opt.value} style={[styles.chip, statusFilter === opt.value && styles.chipActive]} onPress={() => setStatusFilter(opt.value)}><Text style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>{opt.label}</Text></Pressable>))}
                </ScrollView>
              </>
            )}
            {activeTab === "programados" && (
              <View style={styles.programadosHeader}>
                <Text style={styles.programadosTitle}>Próximos Vencimentos</Text>
                {financialMetrics.overdueCount > 0 && (
                  <View style={styles.overdueBanner}>
                    <AppIcon name="AlertCircle" size={14} color={colors.danger} />
                    <Text style={styles.overdueBannerText}>{financialMetrics.overdueCount} pagamento(s) vencido(s) ({formatCurrency(financialMetrics.overdueAmount)})</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {filteredPayments.length === 0 ? (
                <Text style={styles.emptySearchText}>Nenhum registro encontrado nesta aba.</Text>
              ) : filteredPayments.map(p => {
                const isOverdue = p.due_date && p.due_date < new Date().toISOString().split("T")[0] && p.status !== "pago" && p.status !== "aprovado";
                return (
                  <Pressable key={p.id} style={[styles.paymentCard, isOverdue && { borderColor: colors.danger, borderWidth: 1.5 }]} onPress={() => setSelectedPayment(p)}>
                    <View style={styles.paymentCardTop}>
                      <Text style={styles.paymentPeriod}>{p.period}</Text>
                      <View style={[styles.statusPill, { backgroundColor: getStatusColors(p.status).background }]}>
                        <Text style={[styles.statusPillText, { color: getStatusColors(p.status).text }]}>{p.status}</Text>
                      </View>
                    </View>
                    <View style={styles.rowBetween}>
                      <Text style={styles.paymentAmount}>{formatCurrency(Number(p.requested_amount))}</Text>
                      {p.due_date && <Text style={[styles.paymentDate, isOverdue && { color: colors.danger, fontWeight: "800" }]}>{formatDate(p.due_date)}</Text>}
                    </View>
                    <Text style={styles.paymentDesc} numberOfLines={1}>{p.description}</Text>
                    {p.receipt_url && <View style={styles.attachmentRow}><AppIcon name="Paperclip" size={12} color={colors.primary} /><Text style={styles.attachmentBadge}>Comprovante</Text></View>}
                  </Pressable>
                );
              })}
              {hasNextPage && activeTab === "historico" && (
                <Pressable style={styles.loadMoreButton} onPress={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  <Text style={styles.loadMoreText}>{isFetchingNextPage ? "Carregando..." : "Ver mais"}</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
        </>
      )}
      <PaymentFormModal visible={formOpen} payment={editingPayment} projectId={project?.id} loading={upsertPayment.isPending} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <PaymentDetailModal 
        payment={selectedPayment} 
        visible={Boolean(selectedPayment)} 
        isOwner={isOwner}
        onClose={() => setSelectedPayment(null)} 
        onEdit={() => { setEditingPayment(selectedPayment); setFormOpen(false); setSelectedPayment(null); setTimeout(()=>setFormOpen(true), 300); }} 
        onApprove={() => updateStatus.mutateAsync({ id: selectedPayment!.id, projectId: project!.id, userId: user!.id, status: "aprovado" }).then(()=>setSelectedPayment(null))} 
        onMarkPaid={() => updateStatus.mutateAsync({ id: selectedPayment!.id, projectId: project!.id, userId: user!.id, status: "pago", paymentDate: new Date().toISOString().split("T")[0] }).then(()=>setSelectedPayment(null))} 
        onReview={(newStatus: PaymentStatus) => {
          updateStatus.mutateAsync({ 
            id: selectedPayment!.id, 
            projectId: project!.id, 
            userId: user!.id, 
            status: newStatus,
            paymentDate: newStatus === "pago" ? new Date().toISOString().split("T")[0] : null
          }).then(() => setSelectedPayment(null));
        }}
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
  content: { paddingBottom: 32, gap: 10 },
  summaryContainer: { marginBottom: 16 },
  summaryScroll: { gap: 12, paddingRight: 16 },
  summaryCard: { borderRadius: 16, padding: 14, width: 220, gap: 4 },
  summaryLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  summaryValue: { color: colors.surface, fontSize: 20, fontWeight: "900" },
  tabsContainer: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: colors.cardBorder },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabBtnActive: { backgroundColor: colors.background },
  tabBtnText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabBtnTextActive: { color: colors.primary },
  overdueBadge: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger, marginLeft: 4 },
  programadosHeader: { paddingVertical: 4, gap: 8 },
  programadosTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  overdueBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerLight, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.danger },
  overdueBannerText: { fontSize: 13, fontWeight: "700", color: colors.danger },
  executionSection: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.cardBorder, gap: 14 },
  executionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  executionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  executionContract: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  barContainer: { gap: 6 },
  barLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  barSubLabel: { fontSize: 11, color: colors.textMuted, marginTop: -2 },
  barPercent: { fontSize: 13, fontWeight: "800", color: colors.primary },
  barAmount: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceMuted, overflow: "hidden", borderWidth: 1, borderColor: colors.divider },
  barFill: { height: "100%", borderRadius: 5 },
  paymentCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 4, marginBottom: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  paymentDate: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
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
  selectField: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  selectFieldText: { fontSize: 15, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", gap: 10 },
  mediaButton: { height: 100, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: "dashed", backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mediaButtonText: { color: colors.textMuted, fontWeight: "700" },
  receiptPreview: { width: "100%", height: "100%" },
  receiptImageLarge: { width: "100%", height: 200, borderRadius: 16, marginTop: 10 },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: colors.surface, fontWeight: "800", fontSize: 15 },
  approveButton: { flexDirection: "row", gap: 8, borderRadius: 14, backgroundColor: colors.info, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  successButton: { flexDirection: "row", gap: 8, borderRadius: 14, backgroundColor: colors.success, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  revertLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, paddingVertical: 8 },
  revertLinkText: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textDecorationLine: "underline" },
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
