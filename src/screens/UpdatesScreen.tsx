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
  useToggleApprovedUpdate,
  useUpdates,
  useUpsertUpdate,
} from "../hooks/useUpdates";
import { uploadAppMediaListIfNeeded } from "../lib/appMedia";

const statusOptions: { value: UpdateStatus; label: string }[] = [
  { value: "no_prazo", label: "No Prazo" },
  { value: "adiantado", label: "Adiantado" },
  { value: "atrasado", label: "Atrasado" },
];

/**
 * Converte strings separadas por virgula ou quebra de linha em array.
 */
function parseList(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

/**
 * Converte array de strings em uma única string separada por virgula.
 */
function stringifyList(values: string[] | null | undefined) {
  return values && values.length ? values.join(", ") : "";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function getStatusColors(status: UpdateStatus) {
  switch (status) {
    case "adiantado": return { background: "#e8efff", text: "#3566d6" };
    case "atrasado": return { background: "#fdeae7", text: colors.danger };
    case "no_prazo":
    default: return { background: "#e7f4ec", text: colors.success };
  }
}

type UpdateDraft = {
  weekRef: string;
  summary: string;
  status: UpdateStatus;
  servicesCompleted: string;
  servicesNotCompleted: string;
  difficulties: string;
  materialsReceived: string;
  materialsMissing: string;
  nextWeekPlan: string;
  observations: string;
  photos: string[];
  videos: string[];
};

type UpdateFormModalProps = {
  visible: boolean;
  update: UpdateRow | null;
  loading: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
};

/**
 * Formulario de atualizacao semanal (Relatorio do Empreiteiro).
 * future_fix: Adicionar campo de 'Percentual de Conclusao Global' sugerido.
 */
function UpdateFormModal(_: UpdateFormModalProps) {
  const { visible, update, loading, onClose, onSave } = _;
  const [draft, setDraft] = useState<UpdateDraft>({
    weekRef: "", summary: "", status: "no_prazo",
    servicesCompleted: "", servicesNotCompleted: "",
    difficulties: "", materialsReceived: "",
    materialsMissing: "", nextWeekPlan: "",
    observations: "", photos: [], videos: [],
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ type: "photo" | "video"; index: number } | null>(null);

  // Sincroniza estado com dados existentes para edicao.
  useEffect(() => {
    setDraft({
      weekRef: update?.week_ref ?? "",
      summary: update?.summary ?? "",
      status: update?.status ?? "no_prazo",
      servicesCompleted: stringifyList(update?.services_completed),
      servicesNotCompleted: stringifyList(update?.services_not_completed),
      difficulties: update?.difficulties ?? "",
      materialsReceived: stringifyList(update?.materials_received),
      materialsMissing: stringifyList(update?.materials_missing),
      nextWeekPlan: update?.next_week_plan ?? "",
      observations: update?.observations ?? "",
      photos: update?.photos ?? [],
      videos: update?.videos ?? [],
    });
    setLocalError(null);
    setStatusOpen(false);
    setPendingRemoval(null);
  }, [update, visible]);

  /**
   * Abre a galeria para selecionar fotos ou videos e os adiciona ao rascunho.
   */
  const pickMedia = async (mediaType: "images" | "videos") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Galeria", "Permissao necessaria."); return; }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [mediaType], allowsEditing: false, 
      allowsMultipleSelection: true, quality: 0.85,
    });

    if (!result.canceled && result.assets.length) {
      const uris = result.assets.map((asset) => asset.uri).filter(Boolean);
      setDraft((current) => ({
        ...current,
        [mediaType === "images" ? "photos" : "videos"]: [...current[mediaType === "images" ? "photos" : "videos"], ...uris],
      }));
    }
  };

  const handleSave = async () => {
    if (!draft.weekRef.trim()) { setLocalError("Informe a semana."); return; }
    if (!draft.summary.trim()) { setLocalError("Informe o resumo."); return; }
    
    await onSave({
      ...draft,
      weekRef: draft.weekRef.trim(),
      summary: draft.summary.trim(),
      servicesCompleted: parseList(draft.servicesCompleted),
      servicesNotCompleted: parseList(draft.servicesNotCompleted),
      materialsReceived: parseList(draft.materialsReceived),
      materialsMissing: parseList(draft.materialsMissing),
    });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{update ? "Editar Atualizacao" : "Nova Atualizacao"}</Text>
            <Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.row}>
              <View style={[styles.fieldBlock, { flex: 1 }]}><Text style={styles.fieldLabel}>Semana *</Text><TextInput style={[styles.fieldInput, styles.primaryInput]} value={draft.weekRef} onChangeText={(v) => setDraft(c => ({...c, weekRef: v}))} placeholder="01/2026" /></View>
              <View style={[styles.fieldBlock, { flex: 1 }]}><Text style={styles.fieldLabel}>Status</Text><Pressable style={styles.selectField} onPress={() => setStatusOpen(true)}><Text style={styles.selectFieldText}>{statusOptions.find(o => o.value === draft.status)?.label}</Text><Text>˅</Text></Pressable></View>
            </View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Resumo *</Text><TextInput multiline style={[styles.fieldInput, styles.textArea]} value={draft.summary} onChangeText={(v) => setDraft(c => ({...c, summary: v}))} placeholder="O que aconteceu..." /></View>
            <View style={styles.fieldBlock}><Text style={styles.fieldLabel}>Fotos e Videos</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable style={[styles.mediaButton, { flex: 1 }]} onPress={() => void pickMedia("images")}><Text style={styles.mediaButtonText}>+ Fotos</Text></Pressable>
                <Pressable style={[styles.mediaButton, { flex: 1 }]} onPress={() => void pickMedia("videos")}><Text style={styles.mediaButtonText}>+ Videos</Text></Pressable>
              </View>
            </View>
            {localError && <Text style={styles.localError}>{localError}</Text>}
            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={() => void handleSave()}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Salvar Relatorio</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
      
      {/* Modal de Confirmacao de Remocao de Midia */}
      <Modal transparent visible={Boolean(pendingRemoval)} onRequestClose={() => setPendingRemoval(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Remover item?</Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => setPendingRemoval(null)}><Text>Nao</Text></Pressable>
              <Pressable style={styles.confirmAccept} onPress={() => {
                setDraft(c => ({
                  ...c,
                  photos: pendingRemoval?.type === "photo" ? c.photos.filter((_, i) => i !== pendingRemoval.index) : c.photos,
                  videos: pendingRemoval?.type === "video" ? c.videos.filter((_, i) => i !== pendingRemoval.index) : c.videos,
                }));
                setPendingRemoval(null);
              }}><Text style={{color: "#fff"}}>Sim</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

/**
 * Modal de detalhes da atualizacao semanal para o proprietario.
 * future_fix: Implementar campo de 'Comentarios do Proprietario' para feedback direto no relatorio.
 */
function UpdateDetailModal(_: any) {
  const { update, visible, loading, onClose, onEdit, onDelete, onToggleApproved } = _;
  if (!update) return null;
  const statusStyle = getStatusColors(update.status);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.detailCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Relatorio Semanal</Text>
            <Pressable onPress={onClose}><Text style={styles.closeIcon}>×</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.detailTopRow}>
              <Text style={styles.detailWeek}>{update.week_ref}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}><Text style={[styles.statusPillText, { color: statusStyle.text }]}>{update.status}</Text></View>
            </View>
            <Text style={styles.detailSummary}>{update.summary}</Text>
            <View style={styles.detailActionRowTop}>
              <Pressable style={styles.editPill} onPress={onEdit}><Text style={styles.editPillText}>Editar</Text></Pressable>
              <Pressable style={styles.deletePill} onPress={onDelete}><Text style={styles.deletePillText}>Excluir</Text></Pressable>
            </View>
            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={onToggleApproved}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>{update.approved ? "Remover Aprovacao" : "Aprovar Relatorio"}</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Tela de Atualizacoes Semanais: Canal de comunicacao oficial obra-proprietario.
 * future_fix: Adicionar notificacao push quando uma nova atualizacao for publicada.
 */
export function UpdatesScreen() {
  const { user } = useAuth();
  const { project, updates, isLoading } = useUpdates();
  const upsertUpdate = useUpsertUpdate();
  const deleteUpdate = useDeleteUpdate();
  const toggleApproved = useToggleApprovedUpdate();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateRow | null>(null);
  const [editingUpdate, setEditingUpdate] = useState<UpdateRow | null>(null);

  const handleSave = async (payload: any) => {
    if (!project?.id || !user?.id) return;
    try {
      // Faz o upload das midias (se houver novas) antes de salvar o registro.
      const uploadedPhotos = await uploadAppMediaListIfNeeded({ uris: payload.photos, pathPrefix: `projects/${project.id}/updates/photos`, fileBaseName: `upd_photo` });
      const uploadedVideos = await uploadAppMediaListIfNeeded({ uris: payload.videos, pathPrefix: `projects/${project.id}/updates/videos`, fileBaseName: `upd_video`, contentType: "video/mp4" });
      
      await upsertUpdate.mutateAsync({ id: editingUpdate?.id, projectId: project.id, userId: user.id, ...payload, photos: uploadedPhotos, videos: uploadedVideos });
      setFormOpen(false);
    } catch (e) { Alert.alert("Erro", "Falha ao salvar atualizacao."); }
  };

  const handleToggleApproved = () => {
    if (!project?.id || !selectedUpdate) return;
    void toggleApproved.mutateAsync({ id: selectedUpdate.id, projectId: project.id, approved: !selectedUpdate.approved }).then(() => setSelectedUpdate(null));
  };

  if (!project) return (<AppScreen title="Atualizacoes" subtitle="Configure a casa primeiro."><View style={styles.emptyState}><Text>$</Text></View></AppScreen>);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.title}>Atualizacoes</Text><Text style={styles.subtitle}>Relatorios do empreiteiro</Text></View>
        <Pressable style={styles.newButton} onPress={() => { setEditingUpdate(null); setFormOpen(true); }}><Text style={styles.newButtonText}>+ Nova</Text></Pressable>
      </View>

      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={styles.content}>
          {updates.map((update) => (
            <Pressable key={update.id} style={styles.updateCard} onPress={() => setSelectedUpdate(update)}>
              <View style={styles.cardTopRow}><Text style={styles.updateWeek}>{update.week_ref}</Text>{update.approved && <Text style={styles.approvedText}>✓</Text>}</View>
              <Text style={styles.updateSummary} numberOfLines={2}>{update.summary}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <UpdateFormModal visible={formOpen} update={editingUpdate} loading={upsertUpdate.isPending} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <UpdateDetailModal update={selectedUpdate} visible={Boolean(selectedUpdate)} loading={toggleApproved.isPending} onClose={() => setSelectedUpdate(null)} onEdit={() => { setEditingUpdate(selectedUpdate); setFormOpen(true); }} onDelete={() => {}} onToggleApproved={handleToggleApproved} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  headerCopy: { flex: 1 },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 2, fontSize: 13, color: colors.textMuted },
  newButton: { borderRadius: 12, backgroundColor: "#d97b00", paddingHorizontal: 14, paddingVertical: 12 },
  newButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  content: { paddingTop: 16, paddingBottom: 32, gap: 10 },
  updateCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  cardTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  updateWeek: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.text },
  updateSummary: { fontSize: 14, lineHeight: 22, color: colors.textMuted },
  approvedText: { fontSize: 18, color: colors.success, fontWeight: "700" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(31, 28, 23, 0.42)", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 8 },
  modalCard: { width: "100%", maxHeight: "88%", backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 16 },
  detailCard: { width: "100%", maxHeight: "88%", backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text },
  closeIcon: { fontSize: 24, color: colors.textMuted, marginLeft: 12 },
  modalContent: { gap: 14, paddingBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  fieldBlock: { gap: 8 },
  fieldLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  fieldInput: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12, color: colors.text, fontSize: 15 },
  primaryInput: { borderWidth: 2, borderColor: "#d97b00" },
  textArea: { minHeight: 92, textAlignVertical: "top" },
  selectField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12 },
  selectFieldText: { flex: 1, color: colors.text, fontSize: 15 },
  mediaButton: { borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, paddingVertical: 12, alignItems: "center" },
  mediaButtonText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  confirmBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  confirmCard: { width: 280, backgroundColor: "#fff", padding: 20, borderRadius: 16 },
  confirmTitle: { fontSize: 16, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  confirmActions: { flexDirection: "row", gap: 10 },
  confirmCancel: { flex: 1, padding: 12, alignItems: "center" },
  confirmAccept: { flex: 1, padding: 12, alignItems: "center", backgroundColor: colors.danger, borderRadius: 8 },
  localError: { color: colors.danger, fontSize: 13 },
  primaryButton: { borderRadius: 14, backgroundColor: "#d97b00", paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  dropdownModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "center", paddingHorizontal: 20 },
  dropdownModalCard: { backgroundColor: "#fff", borderRadius: 14, overflow: "hidden" },
  dropdownModalContent: { paddingVertical: 6 },
  dropdownItem: { padding: 14 },
  dropdownItemActive: { backgroundColor: "#f0f0f0" },
  dropdownItemText: { fontSize: 15 },
  dropdownItemTextActive: { fontWeight: "700" },
  detailTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  detailWeek: { fontSize: 22, fontWeight: "800", color: colors.text },
  detailSummary: { fontSize: 15, lineHeight: 22, color: colors.text, marginBottom: 20 },
  detailActionRowTop: { flexDirection: "row", gap: 10, marginBottom: 20 },
  editPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#eee" },
  editPillText: { fontSize: 13, fontWeight: "700" },
  deletePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#fdeae7" },
  deletePillText: { fontSize: 13, fontWeight: "700", color: colors.danger },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
  buttonPressed: { opacity: 0.82 },
});
