import * as DocumentPicker from "expo-document-picker";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import {
  DocumentCategory,
  ProjectDocumentRow,
  useCreateDocument,
  useDeleteDocument,
  useDocuments,
  useSignedDocumentUrl,
} from "../hooks/useDocuments";
import { uploadLocalFileToStorage } from "../lib/storageUpload";
import { supabase } from "../lib/supabase";

const categoryOptions: { value: DocumentCategory | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "contrato", label: "Contrato" },
  { value: "alvara", label: "Alvara" },
  { value: "laudo", label: "Laudo" },
  { value: "nota_fiscal", label: "Nota fiscal" },
  { value: "outro", label: "Outro" },
];

function formatDate(value: string | null) {
  if (!value) return "Sem vencimento";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function toIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [day, month, year] = trimmed.split("/");
  if (!day || !month || !year) return null;

  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return "Tamanho nao informado";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function expiresStatus(expiresAt: string | null) {
  if (!expiresAt) {
    return { label: "Sem vencimento", tone: "neutral" as const };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const date = new Date(`${expiresAt}T00:00:00`);
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { label: "Vencido", tone: "danger" as const };
  if (diff <= 30) return { label: "Vence em breve", tone: "warning" as const };
  return { label: "Em dia", tone: "success" as const };
}

function buildFilePath(projectId: string, category: DocumentCategory, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${projectId}/${category}/${Date.now()}_${safeName}`;
}

export function DocumentsScreen() {
  const { user } = useAuth();
  const { project, documents, isLoading } = useDocuments();
  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();
  const signedUrl = useSignedDocumentUrl();
  const [filter, setFilter] = useState<DocumentCategory | "todos">("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("contrato");
  const [expiresAt, setExpiresAt] = useState("");
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmRemovePickedFile, setConfirmRemovePickedFile] = useState(false);

  const filteredDocuments = useMemo(
    () => (filter === "todos" ? documents : documents.filter((item) => item.category === filter)),
    [documents, filter],
  );

  const summary = useMemo(() => {
    const expiringSoon = documents.filter((item) => expiresStatus(item.expires_at).tone === "warning").length;
    const expired = documents.filter((item) => expiresStatus(item.expires_at).tone === "danger").length;
    return { total: documents.length, expiringSoon, expired };
  }, [documents]);

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: "*/*",
    });

    if (result.canceled) {
      return;
    }

    setPickedFile(result.assets[0] ?? null);
  };

  const resetForm = () => {
    setTitle("");
    setCategory("contrato");
    setExpiresAt("");
    setPickedFile(null);
    setLocalError(null);
    setConfirmRemovePickedFile(false);
  };

  const handleSave = async () => {
    if (!project?.id || !user?.id) {
      Alert.alert("Casa", "Configure a casa antes de cadastrar documentos.");
      return;
    }

    if (!title.trim()) {
      setLocalError("Informe um titulo para o documento.");
      return;
    }

    if (!pickedFile?.uri || !pickedFile.name) {
      setLocalError("Selecione um arquivo antes de salvar.");
      return;
    }

    const expiresAtIso = toIsoDate(expiresAt);
    if (expiresAt.trim() && !expiresAtIso) {
      setLocalError("Use a data no formato dd/mm/aaaa.");
      return;
    }

    if (!supabase) {
      setLocalError("Supabase nao configurado.");
      return;
    }

    try {
      setLocalError(null);
      const filePath = buildFilePath(project.id, category, pickedFile.name);

      await uploadLocalFileToStorage({
        bucket: "project-documents",
        filePath,
        fileUri: pickedFile.uri,
        contentType: pickedFile.mimeType ?? "application/octet-stream",
      });

      await createDocument.mutateAsync({
        projectId: project.id,
        userId: user.id,
        title: title.trim(),
        category,
        expiresAt: expiresAtIso,
        fileName: pickedFile.name,
        filePath,
        mimeType: pickedFile.mimeType ?? null,
        sizeBytes: pickedFile.size ?? null,
      });

      resetForm();
      setFormOpen(false);
    } catch (error) {
      console.error("Upload error:", error);
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar o documento.";
      setLocalError(message);
    }
  };

  const handleOpenDocument = async (document: ProjectDocumentRow) => {
    try {
      const url = await signedUrl.mutateAsync({ filePath: document.file_path });
      await Linking.openURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel abrir o documento.";
      Alert.alert("Erro ao abrir", message);
    }
  };

  const handleOpenPickedFile = async () => {
    if (!pickedFile?.uri) return;

    try {
      await Linking.openURL(pickedFile.uri);
    } catch {
      Alert.alert("Arquivo", "Nao foi possivel abrir o arquivo selecionado.");
    }
  };

  const handleDeleteDocument = (document: ProjectDocumentRow) => {
    if (!project?.id) return;

    Alert.alert("Excluir documento?", "Esse arquivo sera removido da biblioteca da casa.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deleteDocument.mutateAsync({
            id: document.id,
            projectId: project.id,
            filePath: document.file_path,
          }).catch((error) => {
            const message = error instanceof Error ? error.message : "Nao foi possivel excluir o documento.";
            Alert.alert("Erro ao excluir", message);
          });
        },
      },
    ]);
  };

  return (
    <AppScreen title="Documentos" subtitle="Upload, consulta e abertura segura de arquivos da casa via Supabase Storage.">
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.total}</Text>
          <Text style={styles.summaryLabel}>Arquivos</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.expiringSoon}</Text>
          <Text style={styles.summaryLabel}>Vence em breve</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.expired}</Text>
          <Text style={styles.summaryLabel}>Vencidos</Text>
        </View>
      </View>

      <SectionCard title="Biblioteca da casa" subtitle="Cadastre contrato, alvara, laudo, nota fiscal e outros arquivos importantes.">
        <View style={styles.actionRow}>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} onPress={() => setFormOpen(true)}>
            <Text style={styles.primaryButtonText}>+ Novo documento</Text>
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          {categoryOptions.map((option) => {
            const active = filter === option.value;
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.buttonPressed]}
                onPress={() => setFilter(option.value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Carregando documentos...</Text>
          </View>
        ) : !project ? (
          <Text style={styles.emptyText}>Configure a casa antes de cadastrar a biblioteca de documentos.</Text>
        ) : filteredDocuments.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum documento encontrado nesse filtro.</Text>
        ) : (
          <View style={styles.list}>
            {filteredDocuments.map((document) => {
              const expiry = expiresStatus(document.expires_at);
              return (
                <View key={document.id} style={styles.documentCard}>
                  <View style={styles.documentHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.documentTitle}>{document.title}</Text>
                      <Text style={styles.documentSubtitle}>{document.file_name}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        expiry.tone === "danger"
                          ? styles.statusDanger
                          : expiry.tone === "warning"
                            ? styles.statusWarning
                            : styles.statusSuccess,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          expiry.tone === "danger"
                            ? styles.statusDangerText
                            : expiry.tone === "warning"
                              ? styles.statusWarningText
                              : styles.statusSuccessText,
                        ]}
                      >
                        {expiry.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metaWrap}>
                    <Text style={styles.metaText}>Categoria: {categoryOptions.find((option) => option.value === document.category)?.label ?? document.category}</Text>
                    <Text style={styles.metaText}>Vencimento: {formatDate(document.expires_at)}</Text>
                    <Text style={styles.metaText}>{formatBytes(document.size_bytes)}</Text>
                  </View>

                  <View style={styles.cardActions}>
                    <Pressable style={styles.secondaryButton} onPress={() => void handleOpenDocument(document)}>
                      <Text style={styles.secondaryButtonText}>Abrir</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryButton} onPress={() => handleDeleteDocument(document)}>
                      <Text style={[styles.secondaryButtonText, styles.dangerText]}>Excluir</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>

      <Modal transparent animationType="fade" visible={formOpen} onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setFormOpen(false); resetForm(); }} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo documento</Text>
              <Pressable onPress={() => { setFormOpen(false); resetForm(); }}>
                <Text style={styles.closeIcon}>×</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Titulo *</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Ex.: Contrato principal da obra"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Categoria</Text>
                <View style={styles.categoryGrid}>
                  {categoryOptions.filter((option) => option.value !== "todos").map((option) => {
                    const active = category === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={({ pressed }) => [styles.categoryChip, active && styles.categoryChipActive, pressed && styles.buttonPressed]}
                        onPress={() => setCategory(option.value as DocumentCategory)}
                      >
                        <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Vencimento</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={expiresAt}
                  onChangeText={setExpiresAt}
                  placeholder="dd/mm/aaaa"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Arquivo *</Text>
                <Pressable style={styles.fieldInput} onPress={() => void handlePickFile()}>
                  <Text style={styles.fieldText}>{pickedFile ? "Trocar arquivo" : "Selecionar arquivo"}</Text>
                </Pressable>
                {pickedFile ? (
                  <View style={styles.previewBlock}>
                    <Text style={styles.previewLabel}>Preview do arquivo</Text>
                    <Pressable
                      style={styles.filePreviewCard}
                      onPress={() => void handleOpenPickedFile()}
                      onLongPress={() => setConfirmRemovePickedFile(true)}
                      delayLongPress={1500}
                    >
                      <Text style={styles.filePreviewName}>{pickedFile.name}</Text>
                      <Text style={styles.fileHint}>{formatBytes(pickedFile.size ?? null)}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {localError ? <Text style={styles.localError}>{localError}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.primaryButton, (pressed || createDocument.isPending) && styles.buttonPressed]}
                onPress={() => void handleSave()}
                disabled={createDocument.isPending}
              >
                {createDocument.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Salvar documento</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={confirmRemovePickedFile} onRequestClose={() => setConfirmRemovePickedFile(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmRemovePickedFile(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Excluir arquivo?</Text>
            <Text style={styles.confirmText}>Deseja remover este arquivo selecionado?</Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => setConfirmRemovePickedFile(false)}>
                <Text style={styles.confirmCancelText}>Nao</Text>
              </Pressable>
              <Pressable
                style={styles.confirmAccept}
                onPress={() => {
                  setPickedFile(null);
                  setConfirmRemovePickedFile(false);
                }}
              >
                <Text style={styles.confirmAcceptText}>Sim</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  summaryLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  actionRow: { flexDirection: "row", justifyContent: "flex-end" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterChipText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  filterChipTextActive: { color: colors.primary },
  loadingState: { gap: 10, alignItems: "center", paddingVertical: 16 },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  list: { gap: 12 },
  documentCard: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
  },
  documentHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  documentTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  documentSubtitle: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  metaWrap: { gap: 4 },
  metaText: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  cardActions: { flexDirection: "row", gap: 8 },
  primaryButton: {
    borderRadius: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  dangerText: { color: colors.danger },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  statusSuccess: { backgroundColor: "#e7f4ec" },
  statusSuccessText: { color: colors.success },
  statusWarning: { backgroundColor: "#f7e7ce" },
  statusWarningText: { color: colors.warning },
  statusDanger: { backgroundColor: "#fdeae7" },
  statusDangerText: { color: colors.danger },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31, 28, 23, 0.24)",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "84%",
    borderRadius: 22,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text },
  closeIcon: { fontSize: 24, color: colors.textMuted, marginLeft: 12 },
  modalContent: { gap: 14, paddingBottom: 8 },
  fieldBlock: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  fieldInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
  },
  fieldText: { fontSize: 15, color: colors.text },
  previewBlock: { gap: 8 },
  previewLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  filePreviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  filePreviewName: { fontSize: 14, fontWeight: "700", color: colors.text },
  fileHint: { fontSize: 12, color: colors.textMuted },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  categoryChipText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  categoryChipTextActive: { color: colors.primary },
  localError: { color: colors.danger, fontSize: 13 },
  confirmCard: { width: "100%", maxWidth: 320, borderRadius: 18, backgroundColor: colors.surface, padding: 18, gap: 12 },
  confirmTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  confirmText: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: "center" },
  confirmActions: { flexDirection: "row", gap: 10 },
  confirmCancel: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, paddingVertical: 12, alignItems: "center" },
  confirmCancelText: { color: colors.text, fontWeight: "700" },
  confirmAccept: { flex: 1, borderRadius: 12, backgroundColor: colors.danger, paddingVertical: 12, alignItems: "center" },
  confirmAcceptText: { color: colors.surface, fontWeight: "800" },
  buttonPressed: { opacity: 0.82 },
});
