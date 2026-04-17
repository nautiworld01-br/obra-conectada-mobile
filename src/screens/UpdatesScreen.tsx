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
import {
  UpdateRow,
  UpdateStatus,
  useDeleteUpdate,
  useUpdateReview,
  useUpdates,
  useUpsertUpdate,
  useSuggestSummary,
} from "../hooks/useUpdates";
import { useProfile } from "../hooks/useProfile";
import { uploadAppMediaListIfNeeded } from "../lib/appMedia";
import { AppIcon } from "../components/AppIcon";

const statusOptions: { value: UpdateStatus; label: string }[] = [
  { value: "no_prazo", label: "No Prazo" },
  { value: "adiantado", label: "Adiantado" },
  { value: "atrasado", label: "Atrasado" },
];

/**
 * Gera a lista de semanas do ano atual para o seletor.
 */
function generateYearWeeks() {
  const weeks = [];
  const now = new Date();
  const year = now.getFullYear();
  
  let d = new Date(year, 0, 1);
  while (d.getDay() !== 1) { d.setDate(d.getDate() + 1); }

  for (let i = 1; i <= 52; i++) {
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    
    const label = `Semana ${i.toString().padStart(2, "0")} (${start.getDate().toString().padStart(2, "0")}/${(start.getMonth()+1).toString().padStart(2, "0")} - ${end.getDate().toString().padStart(2, "0")}/${(end.getMonth()+1).toString().padStart(2, "0")})`;
    const value = `${i.toString().padStart(2, "0")}/${year}`;
    
    weeks.push({ label, value, isCurrent: now >= start && now <= end });
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

function stringifyList(values: string[] | null | undefined) {
  return values && values.length ? values.join(", ") : "";
}

function parseList(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function getStatusColors(status: UpdateStatus) {
  switch (status) {
    case "adiantado": return { background: colors.infoLight, text: colors.info };
    case "atrasado": return { background: colors.dangerLight, text: colors.danger };
    default: return { background: colors.successLight, text: colors.success };
  }
}

/**
 * Modal de Formulario para Relatorios Semanais.
 */
function UpdateFormModal(_: any) {
  const { visible, update, projectId, loading, onClose, onSave } = _;
  const yearWeeks = useMemo(() => generateYearWeeks(), []);
  const currentWeek = useMemo(() => yearWeeks.find(w => w.isCurrent)?.value || "", [yearWeeks]);
  const suggestSummary = useSuggestSummary();

  const [draft, setDraft] = useState({
    weekRef: "", summary: "", status: "no_prazo" as UpdateStatus,
    servicesCompleted: "", servicesNotCompleted: "",
    photos: [] as string[], videos: [] as string[]
  });
  
  const [statusOpen, setStatusOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft({
        weekRef: update?.week_ref ?? currentWeek,
        summary: update?.summary ?? "",
        status: update?.status ?? "no_prazo",
        servicesCompleted: stringifyList(update?.services_completed),
        servicesNotCompleted: stringifyList(update?.services_not_completed),
        photos: update?.photos ?? [],
        videos: update?.videos ?? [],
      });
    }
  }, [update, visible, currentWeek]);

  const handleGenerateSuggestion = async () => {
    if (!draft.weekRef || !projectId) return;

    const [weekNum, year] = draft.weekRef.split("/").map(Number);
    let d = new Date(year, 0, 1);
    while (d.getDay() !== 1) { d.setDate(d.getDate() + 1); }
    d.setDate(d.getDate() + (weekNum - 1) * 7);
    
    const weekStart = d.toISOString().split("T")[0];
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    const weekEnd = end.toISOString().split("T")[0];

    try {
      const suggestion = await suggestSummary.mutateAsync({ projectId, weekStart, weekEnd });
      if (draft.summary.trim() && !update) {
        Alert.alert("Substituir?", "Deseja substituir o resumo atual pela sugestão automática?", [
          { text: "Não" },
          { text: "Sim", onPress: () => setDraft(c => ({ ...c, summary: suggestion })) }
        ]);
      } else {
        setDraft(c => ({ ...c, summary: suggestion }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      Alert.alert("Erro na Sugestão", `Não foi possível gerar: ${msg}`);
      console.error("Erro RPC Sugestão:", e);
    }
  };

  const handleSave = () => {
    if (!draft.weekRef) { Alert.alert("Erro", "Selecione a semana do relatório."); return; }
    if (!draft.summary.trim()) { Alert.alert("Erro", "O resumo das atividades é obrigatório."); return; }
    
    onSave({
      ...draft,
      servicesCompleted: parseList(draft.servicesCompleted),
      servicesNotCompleted: parseList(draft.servicesNotCompleted),
    });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{update ? "Editar" : "Novo"} Relatório</Text>
            <Pressable onPress={onClose}>
              <AppIcon name="X" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Semana do Relatório *</Text>
              <Pressable style={styles.selectField} onPress={() => setWeekOpen(true)}>
                <Text style={styles.selectText}>{yearWeeks.find(w => w.value === draft.weekRef)?.label || "Selecione a semana..."}</Text>
                <AppIcon name="ChevronDown" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Status da Obra</Text>
              <Pressable style={styles.selectField} onPress={() => setStatusOpen(true)}>
                <Text style={styles.selectText}>{statusOptions.find(o => o.value === draft.status)?.label}</Text>
                <AppIcon name="ChevronDown" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            
            <View style={styles.fieldBlock}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Resumo das Atividades *</Text>
                <Pressable 
                  style={[styles.suggestBtn, suggestSummary.isPending && { opacity: 0.6 }]} 
                  onPress={handleGenerateSuggestion}
                  disabled={suggestSummary.isPending}
                >
                  {suggestSummary.isPending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <AppIcon name="Sparkles" size={14} color={colors.primary} />
                      <Text style={styles.suggestBtnText}>Sugerir</Text>
                    </>
                  )}
                </Pressable>
              </View>
              <TextInput 
                multiline 
                placeholder="O que foi feito esta semana?"
                style={[styles.fieldInput, styles.textArea]} 
                value={draft.summary} 
                onChangeText={v => setDraft(c => ({...c, summary: v}))} 
              />
            </View>

            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={handleSave}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar Relatório</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <Modal transparent visible={statusOpen} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setStatusOpen(false)}>
          <View style={styles.dropdownCard}>
            {statusOptions.map(o => (
              <Pressable key={o.value} style={styles.dropdownItem} onPress={() => { setDraft(c => ({...c, status: o.value})); setStatusOpen(false); }}>
                <Text style={styles.dropdownText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal transparent visible={weekOpen} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setWeekOpen(false)}>
          <View style={[styles.dropdownCard, { height: "60%" }]}>
            <Text style={styles.dropdownTitle}>Selecione a Semana</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {yearWeeks.map(w => (
                <Pressable 
                  key={w.value} 
                  style={[styles.dropdownItem, w.value === draft.weekRef && { backgroundColor: colors.primarySoft }]} 
                  onPress={() => { setDraft(c => ({...c, weekRef: w.value})); setWeekOpen(false); }}
                >
                  <Text style={[styles.dropdownText, w.isCurrent && { color: colors.primary, fontWeight: "800" }]}>
                    {w.label} {w.isCurrent ? "(Atual)" : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

/**
 * Detalhes do Relatorio com Interacao.
 */
function UpdateDetailModal(_: any) {
  const { update, visible, isOwner, onClose, onEdit, onDelete, onReview } = _;
  if (!update) return null;
  const [comment, setComment] = useState(update.owner_comments || "");
  const statusStyle = getStatusColors(update.status);

  useEffect(() => { setComment(update.owner_comments || ""); }, [update, visible]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.detailCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Relatório Semanal</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <AppIcon name="X" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView 
            contentContainerStyle={styles.modalContent} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.detailHeader}>
              <Text style={styles.detailWeek}>Semana {update.week_ref}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}><Text style={[styles.statusPillText, { color: statusStyle.text }]}>{update.status.toUpperCase()}</Text></View>
            </View>
            <Text style={styles.detailSummary}>{update.summary}</Text>
            
            {/* Seção de Midias */}
            {(update.photos?.length || update.videos?.length) ? (
              <View style={styles.mediaSection}>
                <Text style={styles.sectionTitle}>Mídias da Semana</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 10}}>
                  {update.photos?.map((url: string, i: number) => (
                    <Pressable key={i} onPress={() => Linking.openURL(url)}><Image source={{ uri: url }} style={styles.mediaThumb} /></Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.divider} />

            <View style={styles.commentSection}>
              <Text style={styles.sectionTitle}>Feedback do Proprietário</Text>
              {isOwner ? (
                <TextInput
                  multiline
                  style={styles.commentInput}
                  placeholder="Escreva sua observação aqui..."
                  value={comment}
                  onChangeText={setComment}
                />
              ) : (
                <View style={styles.commentBoxReadOnly}>
                  <Text style={comment ? styles.commentText : styles.commentTextEmpty}>
                    {comment || "Nenhum comentário do proprietário ainda."}
                  </Text>
                </View>
              )}
            </View>

            {isOwner && (
              <View style={styles.reviewActions}>
                <Pressable style={styles.approveButton} onPress={() => onReview(true, comment)}>
                  <Text style={styles.primaryButtonText}>{update.approved ? "Atualizar Feedback" : "Aprovar Relatório"}</Text>
                </Pressable>
                {!update.approved && (
                  <Pressable style={styles.rejectButton} onPress={() => onReview(false, comment)}>
                    <Text style={styles.rejectButtonText}>Recusar / Pedir Ajuste</Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.footerActions}>
              <Pressable style={styles.editPill} onPress={onEdit}><Text style={styles.editPillText}>Editar</Text></Pressable>
              <Pressable style={styles.deletePill} onPress={onDelete}><Text style={styles.deletePillText}>Excluir</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function UpdatesScreen() {
  const { user } = useAuth();
  const { isOwner } = useProfile();
  const { project, updates, isLoading } = useUpdates();
  const upsertUpdate = useUpsertUpdate();
  const deleteUpdate = useDeleteUpdate();
  const updateReview = useUpdateReview();
  
  const [formOpen, setFormOpen] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateRow | null>(null);
  const [editingUpdate, setEditingUpdate] = useState<UpdateRow | null>(null);

  const handleSave = async (payload: any) => {
    if (!project?.id || !user?.id) return;
    try {
      const uploadedPhotos = await uploadAppMediaListIfNeeded({ uris: payload.photos, pathPrefix: `projects/${project.id}/updates/photos`, fileBaseName: `upd_photo` });
      const uploadedVideos = await uploadAppMediaListIfNeeded({ uris: payload.videos, pathPrefix: `projects/${project.id}/updates/videos`, fileBaseName: `upd_video`, contentType: "video/mp4" });
      
      await upsertUpdate.mutateAsync({ id: editingUpdate?.id, projectId: project.id, userId: user.id, ...payload, photos: uploadedPhotos, videos: uploadedVideos });
      
      // Fecha o modal primeiro
      setFormOpen(false);
      
      // Pequeno delay para permitir que o React 19 limpe a árvore do modal antes do Toast
      setTimeout(() => {
        Toast.show({ 
          type: "success", 
          text1: "Relatório salvo", 
          text2: "As informações semanais foram atualizadas." 
        });
      }, 100);
    } catch (e) { 
      Alert.alert("Erro", "Falha ao salvar o relatório."); 
    }
  };

  const handleReview = async (approved: boolean, comment: string) => {
    if (!selectedUpdate || !project?.id) return;
    try {
      await updateReview.mutateAsync({ id: selectedUpdate.id, projectId: project.id, approved, ownerComments: comment });
      
      // Fecha o detalhe primeiro
      setSelectedUpdate(null);
      
      setTimeout(() => {
        Toast.show({ 
          type: "success", 
          text1: approved ? "Relatório aprovado" : "Feedback enviado" 
        });
      }, 100);
    } catch (e) { 
      Alert.alert("Erro", "Falha ao processar a revisão."); 
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.title}>Relatórios</Text><Text style={styles.subtitle}>Acompanhamento semanal</Text></View>
        <Pressable style={styles.newButton} onPress={() => { setEditingUpdate(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Novo</Text></Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {updates.length === 0 ? (
            <Text style={styles.emptySearchText}>Nenhum relatório semanal registrado ainda.</Text>
          ) : updates.map(u => (
            <Pressable 
              key={u.id} 
              style={styles.updateCard} 
              onPress={() => {
                // Pequeno delay para estabilizar renderizacao no React 19
                setTimeout(() => setSelectedUpdate(u), 10);
              }}
            >
              <View style={styles.cardRow}>
                <Text style={styles.cardWeek}>Semana {u.week_ref}</Text>
                {u.approved && <AppIcon name="CheckCircle2" size={18} color={colors.success} />}
              </View>
              <Text style={styles.cardSummary} numberOfLines={2}>{u.summary}</Text>
              {u.owner_comments && <View style={styles.commentBadgeRow}><AppIcon name="MessageSquare" size={12} color={colors.primary} /><Text style={styles.commentBadge}>Comentado</Text></View>}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <UpdateFormModal visible={formOpen} update={editingUpdate} projectId={project?.id} loading={upsertUpdate.isPending} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <UpdateDetailModal update={selectedUpdate} visible={Boolean(selectedUpdate)} isOwner={isOwner} onClose={() => setSelectedUpdate(null)} onEdit={() => { setEditingUpdate(selectedUpdate); setFormOpen(true); setSelectedUpdate(null); }} onReview={handleReview} onDelete={() => {
        const performDelete = async () => {
          if (!selectedUpdate || !project?.id) return;
          try {
            await deleteUpdate.mutateAsync({ id: selectedUpdate.id, projectId: project.id });
            setSelectedUpdate(null);
            Toast.show({ type: "success", text1: "Relatório removido" });
          } catch (e) {
            Alert.alert("Erro", "Nao foi possivel excluir o relatório.");
          }
        };

        if (Platform.OS === "web") {
          if (window.confirm("Deseja remover este relatório semanal?")) {
            void performDelete();
          }
          return;
        }

        Alert.alert("Excluir?", "Deseja remover este relatório?", [
          { text: "Não", style: "cancel" },
          { text: "Sim", style: "destructive", onPress: () => void performDelete() }
        ]);
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted },
  newButton: { borderRadius: 12, backgroundColor: colors.secondary, paddingHorizontal: 14, paddingVertical: 12 },
  newButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  content: { paddingTop: 16, paddingBottom: 32, gap: 12 },
  updateCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 6 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardWeek: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardSummary: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  commentBadgeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  commentBadge: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  detailCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  modalContent: { gap: 16 },
  fieldBlock: { gap: 4 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted, color: colors.text },
  textArea: { minHeight: 120, textAlignVertical: "top" },
  selectField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted },
  selectText: { fontSize: 15, color: colors.text },
  suggestBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primarySoft },
  suggestBtnText: { fontSize: 12, fontWeight: "800", color: colors.primary },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: colors.surface, fontWeight: "800", fontSize: 15 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  detailWeek: { fontSize: 22, fontWeight: "800", color: colors.text },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  detailSummary: { fontSize: 15, lineHeight: 24, color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 10, marginBottom: 8 },
  mediaSection: { marginVertical: 10 },
  mediaThumb: { width: 100, height: 100, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 15 },
  commentSection: { gap: 8 },
  commentInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.primary, padding: 14, minHeight: 80, backgroundColor: colors.surfaceMuted, fontSize: 14, textAlignVertical: "top", color: colors.text },
  commentBoxReadOnly: { padding: 14, borderRadius: 12, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  commentTextEmpty: { fontSize: 14, color: colors.textMuted, fontStyle: "italic" },
  reviewActions: { gap: 10, marginTop: 15 },
  approveButton: { borderRadius: 14, backgroundColor: colors.success, paddingVertical: 16, alignItems: "center" },
  rejectButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.danger, paddingVertical: 16, alignItems: "center" },
  rejectButtonText: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  footerActions: { flexDirection: "row", gap: 10, marginTop: 25, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 20 },
  editPill: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: "center" },
  editPillText: { fontWeight: "700", color: colors.text },
  deletePill: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.dangerLight, alignItems: "center" },
  deletePillText: { fontWeight: "700", color: colors.danger },
  dropdownCard: { backgroundColor: colors.surface, padding: 20, borderRadius: 24, width: "90%", alignSelf: "center", marginBottom: 60, elevation: 5 },
  dropdownTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 15, textAlign: "center" },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, borderRadius: 12 },
  dropdownText: { fontSize: 15, fontWeight: "600", color: colors.text },
  emptySearchText: { textAlign: "center", paddingVertical: 40, color: colors.textMuted },
  buttonPressed: { opacity: 0.8 }
});
