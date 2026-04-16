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
  UpdateRow,
  UpdateStatus,
  useDeleteUpdate,
  useUpdateReview,
  useUpdates,
  useUpsertUpdate,
} from "../hooks/useUpdates";
import { useProfile } from "../hooks/useProfile";
import { uploadAppMediaListIfNeeded } from "../lib/appMedia";

const statusOptions: { value: UpdateStatus; label: string }[] = [
  { value: "no_prazo", label: "No Prazo" },
  { value: "adiantado", label: "Adiantado" },
  { value: "atrasado", label: "Atrasado" },
];

function stringifyList(values: string[] | null | undefined) {
  return values && values.length ? values.join(", ") : "";
}

function parseList(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function getStatusColors(status: UpdateStatus) {
  switch (status) {
    case "adiantado": return { background: "#e8efff", text: "#3566d6" };
    case "atrasado": return { background: "#fdeae7", text: colors.danger };
    default: return { background: "#e7f4ec", text: colors.success };
  }
}

/**
 * Modal de Formulario para Relatorios Semanais.
 */
function UpdateFormModal(_: any) {
  const { visible, update, loading, onClose, onSave } = _;
  const [draft, setDraft] = useState({
    weekRef: "", summary: "", status: "no_prazo" as UpdateStatus,
    servicesCompleted: "", servicesNotCompleted: "",
    photos: [] as string[], videos: [] as string[]
  });
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft({
        weekRef: update?.week_ref ?? "",
        summary: update?.summary ?? "",
        status: update?.status ?? "no_prazo",
        servicesCompleted: stringifyList(update?.services_completed),
        servicesNotCompleted: stringifyList(update?.services_not_completed),
        photos: update?.photos ?? [],
        videos: update?.videos ?? [],
      });
    }
  }, [update, visible]);

  const handleSave = () => {
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
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{update ? "Editar" : "Novo"} Relatório</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.row}>
              <View style={{flex: 1}}><Text style={styles.fieldLabel}>Semana *</Text><TextInput style={styles.fieldInput} value={draft.weekRef} onChangeText={v => setDraft(c => ({...c, weekRef: v}))} placeholder="01/2026" /></View>
              <View style={{flex: 1}}><Text style={styles.fieldLabel}>Status</Text><Pressable style={styles.selectField} onPress={() => setStatusOpen(true)}><Text>{statusOptions.find(o => o.value === draft.status)?.label}</Text></Pressable></View>
            </View>
            <Text style={styles.fieldLabel}>Resumo das Atividades *</Text>
            <TextInput multiline style={[styles.fieldInput, styles.textArea]} value={draft.summary} onChangeText={v => setDraft(c => ({...c, summary: v}))} />
            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={handleSave}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar Relatório</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <Modal transparent visible={statusOpen} onRequestClose={() => setStatusOpen(false)}>
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
    </Modal>
  );
}

/**
 * Detalhes do Relatorio com Interacao (Comentarios do Proprietario).
 */
function UpdateDetailModal(_: any) {
  const { update, visible, loading, isOwner, onClose, onEdit, onDelete, onReview } = _;
  if (!update) return null;
  const [comment, setComment] = useState(update.owner_comments || "");
  const statusStyle = getStatusColors(update.status);

  useEffect(() => { setComment(update.owner_comments || ""); }, [update]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.detailCard} onPress={() => undefined}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Relatório Semanal</Text><Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
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

            {/* INTERAÇÃO: Comentarios do Proprietario */}
            <View style={styles.commentSection}>
              <Text style={styles.sectionTitle}>Feedback do Proprietário</Text>
              {isOwner ? (
                <TextInput
                  multiline
                  style={styles.commentInput}
                  placeholder="Escreva sua observação ou orientações aqui..."
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
                <Pressable 
                  style={({ pressed }) => [styles.approveButton, pressed && styles.buttonPressed]} 
                  onPress={() => onReview(true, comment)}
                >
                  <Text style={styles.primaryButtonText}>{update.approved ? "Salvar Alterações" : "Aprovar Relatório"}</Text>
                </Pressable>
                {!update.approved && (
                  <Pressable 
                    style={({ pressed }) => [styles.rejectButton, pressed && styles.buttonPressed]} 
                    onPress={() => onReview(false, comment)}
                  >
                    <Text style={styles.rejectButtonText}>Recusar / Pedir Ajuste</Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.footerActions}>
              <Pressable style={styles.editPill} onPress={onEdit}><Text style={styles.editPillText}>Editar Relatório</Text></Pressable>
              <Pressable style={styles.deletePill} onPress={onDelete}><Text style={styles.deletePillText}>Excluir</Text></Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
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
      setFormOpen(false);
    } catch (e) { Alert.alert("Erro", "Falha ao salvar."); }
  };

  const handleReview = async (approved: boolean, comment: string) => {
    if (!selectedUpdate || !project?.id) return;
    try {
      await updateReview.mutateAsync({ id: selectedUpdate.id, projectId: project.id, approved, ownerComments: comment });
      setSelectedUpdate(null);
      Alert.alert("Sucesso", approved ? "Relatório aprovado!" : "Feedback enviado.");
    } catch (e) { Alert.alert("Erro", "Falha ao processar review."); }
  };

  if (!project) return <AppScreen title="Atualizações"><Text>Configure a casa primeiro.</Text></AppScreen>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View><Text style={styles.title}>Relatórios</Text><Text style={styles.subtitle}>Acompanhamento semanal</Text></View>
        <Pressable style={styles.newButton} onPress={() => { setEditingUpdate(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Novo</Text></Pressable>
      </View>

      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {updates.map(u => (
            <Pressable key={u.id} style={styles.updateCard} onPress={() => setSelectedUpdate(u)}>
              <View style={styles.cardRow}><Text style={styles.cardWeek}>Semana {u.week_ref}</Text>{u.approved && <Text style={styles.approvedIcon}>✓</Text>}</View>
              <Text style={styles.cardSummary} numberOfLines={2}>{u.summary}</Text>
              {u.owner_comments && <Text style={styles.commentBadge}>💬 Comentado</Text>}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <UpdateFormModal visible={formOpen} update={editingUpdate} loading={upsertUpdate.isPending} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <UpdateDetailModal update={selectedUpdate} visible={Boolean(selectedUpdate)} isOwner={isOwner} onClose={() => setSelectedUpdate(null)} onEdit={() => { setEditingUpdate(selectedUpdate); setFormOpen(true); setSelectedUpdate(null); }} onReview={handleReview} onDelete={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted },
  newButton: { borderRadius: 12, backgroundColor: "#d97b00", paddingHorizontal: 14, paddingVertical: 12 },
  newButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  content: { paddingTop: 16, paddingBottom: 32, gap: 12 },
  updateCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 6 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardWeek: { fontSize: 16, fontWeight: "800", color: colors.text },
  cardSummary: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  approvedIcon: { fontSize: 18, color: colors.success, fontWeight: "900" },
  commentBadge: { fontSize: 12, color: colors.primary, fontWeight: "700", marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  detailCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  closeIcon: { fontSize: 24, color: colors.textMuted },
  modalContent: { gap: 16 },
  row: { flexDirection: "row", gap: 10 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 4 },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, fontSize: 15, backgroundColor: colors.surfaceMuted },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  selectField: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, backgroundColor: colors.surfaceMuted },
  primaryButton: { borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  detailWeek: { fontSize: 22, fontWeight: "800" },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  detailSummary: { fontSize: 15, lineHeight: 24, color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 10, marginBottom: 8 },
  mediaSection: { marginVertical: 10 },
  mediaThumb: { width: 100, height: 100, borderRadius: 12, backgroundColor: "#eee" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 15 },
  commentSection: { gap: 8 },
  commentInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.primary, padding: 14, minHeight: 80, backgroundColor: "#f8faff", fontSize: 14, textAlignVertical: "top" },
  commentBoxReadOnly: { padding: 14, borderRadius: 12, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  commentTextEmpty: { fontSize: 14, color: colors.textMuted, fontStyle: "italic" },
  reviewActions: { gap: 10, marginTop: 15 },
  approveButton: { borderRadius: 14, backgroundColor: colors.success, paddingVertical: 16, alignItems: "center" },
  rejectButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.danger, paddingVertical: 16, alignItems: "center" },
  rejectButtonText: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  footerActions: { flexDirection: "row", gap: 10, marginTop: 25, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 20 },
  editPill: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: "center" },
  editPillText: { fontWeight: "700", color: colors.text },
  deletePill: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#fdeae7", alignItems: "center" },
  deletePillText: { fontWeight: "700", color: colors.danger },
  dropdownCard: { backgroundColor: "#fff", padding: 10, borderRadius: 16, width: "80%", alignSelf: "center" },
  dropdownItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dropdownText: { fontSize: 16, fontWeight: "600" },
  buttonPressed: { opacity: 0.8 }
});
