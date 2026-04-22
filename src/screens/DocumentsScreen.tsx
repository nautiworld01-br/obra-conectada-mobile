import * as DocumentPicker from "expo-document-picker";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AnimatedModal } from "../components/AnimatedModal";
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
import { AppDatePicker } from "../components/AppDatePicker";


const categoryOptions: { value: DocumentCategory | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "contrato", label: "Contrato" },
  { value: "alvara", label: "Alvara" },
  { value: "laudo", label: "Laudo" },
  { value: "nota_fiscal", label: "Nota fiscal" },
  { value: "outro", label: "Outro" },
];

const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const monthLabels = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".jpg", ".jpeg", ".png", ".webp"]);

// Funcoes utilitarias para formatacao de dados, calculo de status de vencimento e manipulacao de arquivos.
// future_fix: extrair funcoes de data e bytes para um modulo de utilitarios compartilhado.
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

function inferExtension(fileName: string | null | undefined) {
  if (!fileName) return "";
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
}

function validatePickedDocument(asset: DocumentPicker.DocumentPickerAsset) {
  const extension = inferExtension(asset.name);
  const mimeType = asset.mimeType?.toLowerCase() ?? null;
  const typeAllowed =
    (mimeType && ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) ||
    (extension && ALLOWED_DOCUMENT_EXTENSIONS.has(extension));

  if (!typeAllowed) {
    return "Formato nao suportado. Envie PDF, Word, Excel, TXT ou imagem (JPG/PNG/WebP).";
  }

  if (asset.size && asset.size > MAX_DOCUMENT_SIZE_BYTES) {
    return `Arquivo muito grande. O limite atual e ${formatBytes(MAX_DOCUMENT_SIZE_BYTES)}.`;
  }

  return null;
}

// Determina o status visual do documento com base na proximidade do vencimento.
// Retorna um label amigavel e um "tom" para aplicacao de cores na UI (success, warning, danger).
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

function buildMonthGrid(currentMonthDate: Date) {
  const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 35 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      iso: date.toISOString().split("T")[0],
      dayNumber: date.getDate(),
      currentMonth: date.getMonth() === currentMonthDate.getMonth(),
    };
  });
}

// Tela de gestao de documentos do projeto (plantas, contratos, notas fiscais, etc).
// Permite o upload, visualizacao e controle de vencimento de arquivos no Supabase Storage.
export function DocumentsScreen() {
  // Hooks para autenticacao e operacoes CRUD de documentos.
  // useDocuments centraliza a busca da lista de arquivos vinculados a casa/projeto.
  const { user } = useAuth();
  const { project, documents, isLoading } = useDocuments();
  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();
  const signedUrl = useSignedDocumentUrl();
  
  // Estados para controle de filtros, abertura de modais e campos do formulario de novo documento.
  // future_fix: utilizar um estado de objeto unico para o formulario de upload.
  const [filter, setFilter] = useState<DocumentCategory | "todos">("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("contrato");
  const [expiresAt, setExpiresAt] = useState("");
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmRemovePickedFile, setConfirmRemovePickedFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ progress: number; message: string } | null>(null);
  
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());

  const monthGrid = useMemo(() => buildMonthGrid(datePickerMonth), [datePickerMonth]);
  const monthLabel = `${monthLabels[datePickerMonth.getMonth()]} ${datePickerMonth.getFullYear()}`;
  const isSavingDocument = createDocument.isPending || Boolean(uploadProgress);

  // Filtragem e calculo de resumo (total, vencidos, a vencer) para exibicao no topo da tela.
  // Memoriza os resultados para evitar recalculas desnecessarios em cada re-render.
  const filteredDocuments = useMemo(
    () => (filter === "todos" ? documents : documents.filter((item) => item.category === filter)),
    [documents, filter],
  );

  const summary = useMemo(() => {
    const expiringSoon = documents.filter((item) => expiresStatus(item.expires_at).tone === "warning").length;
    const expired = documents.filter((item) => expiresStatus(item.expires_at).tone === "danger").length;
    return { total: documents.length, expiringSoon, expired };
  }, [documents]);

  // Logica para selecao de arquivos do dispositivo usando Expo DocumentPicker.
  // future_fix: validar o tamanho maximo do arquivo antes do upload para evitar erros de timeout.
  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: "*/*",
    });

    if (result.canceled) {
      return;
    }

    const nextFile = result.assets[0] ?? null;
    if (!nextFile) {
      return;
    }

    const validationError = validatePickedDocument(nextFile);
    if (validationError) {
      setPickedFile(null);
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    setPickedFile(nextFile);
  };

  const resetForm = () => {
    setTitle("");
    setCategory("contrato");
    setExpiresAt("");
    setPickedFile(null);
    setLocalError(null);
    setConfirmRemovePickedFile(false);
    setUploadProgress(null);
  };

  // Processo de salvamento: primeiro faz o upload do binario para o Storage e depois salva o metadado no DB.
  // Garante a integridade referencial entre o arquivo fisico e o registro na tabela do Supabase.
  const handleSave = async () => {
    if (!project?.id || !user?.id) {
      Alert.alert("Obra", "Configure a obra antes de cadastrar documentos.");
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

    const validationError = validatePickedDocument(pickedFile);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    if (!supabase) {
      setLocalError("Supabase nao configurado.");
      return;
    }

    try {
      setLocalError(null);
      setUploadProgress({ progress: 5, message: "Preparando documento..." });
      const filePath = buildFilePath(project.id, category, pickedFile.name);

      await uploadLocalFileToStorage({
        bucket: "project-documents",
        filePath,
        fileUri: pickedFile.uri,
        contentType: pickedFile.mimeType ?? "application/octet-stream",
        onProgress: setUploadProgress,
      });

      setUploadProgress({ progress: 100, message: "Salvando dados do documento..." });
      await createDocument.mutateAsync({
        projectId: project.id,
        userId: user.id,
        title: title.trim(),
        category,
        expiresAt: expiresAt || null, // Ja esta em ISO via AppDatePicker
        fileName: pickedFile.name,
        filePath,
        mimeType: pickedFile.mimeType ?? null,
        sizeBytes: pickedFile.size ?? null,
      });

      resetForm();
      setFormOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o documento.";
      setLocalError(message);
    } finally {
      setUploadProgress(null);
    }
  };

  const applyCalendarDate = (iso: string) => {
    const [year, month, day] = iso.split("-");
    setExpiresAt(`${day}/${month}/${year}`);
    setCalendarOpen(false);
  };

  // Recupera uma URL assinada (temporaria) para visualizacao segura do documento.
  // future_fix: implementar cache local de URLs assinadas para evitar chamadas repetidas ao Supabase.
  const handleOpenDocument = async (document: ProjectDocumentRow) => {
    try {
      const url = await signedUrl.mutateAsync({ filePath: document.file_path });
      await Linking.openURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o documento.";
      Alert.alert("Erro ao abrir", message);
    }
  };

  const handleOpenPickedFile = async () => {
    if (!pickedFile?.uri) return;

    try {
      await Linking.openURL(pickedFile.uri);
    } catch {
      Alert.alert("Arquivo", "Não foi possível abrir o arquivo selecionado.");
    }
  };

  const handleDeleteDocument = (document: ProjectDocumentRow) => {
    if (!project?.id) {
      Alert.alert("Obra", "Configure a obra antes de excluir documentos.");
      return;
    }

    const performDelete = async () => {
      try {
        await deleteDocument.mutateAsync({
          id: document.id,
          projectId: project.id,
          filePath: document.file_path,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível excluir o documento.";
        if (Platform.OS === "web") alert(message);
        else Alert.alert("Erro ao excluir", message);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Excluir documento? Esse arquivo sera removido da biblioteca da obra.")) {
        void performDelete();
      }
      return;
    }

    Alert.alert("Excluir documento?", "Esse arquivo sera removido da biblioteca da obra.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => void performDelete(),
      },
    ]);
  };

  // Renderizacao da tela principal com Header, Resumo de status e Listagem de arquivos.
  // Os documentos sao exibidos em cards com informacoes de categoria, vencimento e tamanho.
  return (
    <AppScreen title="Documentos" subtitle="Upload, consulta e abertura segura de arquivos da obra via Supabase Storage.">
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

      <SectionCard title="Biblioteca da obra" subtitle="Cadastre contrato, alvara, laudo, nota fiscal e outros arquivos importantes.">
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
          <Text style={styles.emptyText}>Configure a obra antes de cadastrar a biblioteca de documentos.</Text>
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

      <AnimatedModal visible={formOpen} onRequestClose={() => { setFormOpen(false); resetForm(); }} position="center" contentStyle={styles.modalCard}>
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
                <AppDatePicker 
                  label="Vencimento" 
                  value={expiresAt} 
                  onChange={setExpiresAt} 
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
                <Text style={styles.helperText}>Permitidos: PDF, Word, Excel, TXT e imagens. Limite atual: {formatBytes(MAX_DOCUMENT_SIZE_BYTES)}.</Text>
              </View>

              {localError ? <Text style={styles.localError}>{localError}</Text> : null}

              {uploadProgress ? (
                <View style={styles.progressBlock}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${uploadProgress.progress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{Math.round(uploadProgress.progress)}% • {uploadProgress.message}</Text>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [styles.primaryButton, (pressed || isSavingDocument) && styles.buttonPressed]}
                onPress={() => void handleSave()}
                disabled={isSavingDocument}
              >
                {isSavingDocument ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Salvar documento</Text>}
              </Pressable>
        </ScrollView>
      </AnimatedModal>

      {/* Calendario Modal Padronizado */}
      <AnimatedModal visible={calendarOpen} onRequestClose={() => setCalendarOpen(false)} position="center" contentStyle={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Pressable 
                style={styles.calendarArrow} 
                onPress={() => setDatePickerMonth(new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() - 1, 1))}
              >
                <Text style={styles.calendarArrowText}>‹</Text>
              </Pressable>
              <Text style={styles.calendarMonth}>{monthLabel}</Text>
              <Pressable 
                style={styles.calendarArrow} 
                onPress={() => setDatePickerMonth(new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() + 1, 1))}
              >
                <Text style={styles.calendarArrowText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.calendarWeekHeader}>
              {weekLabels.map((label) => (
                <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {monthGrid.map((cell) => {
                const isSelected = toIsoDate(expiresAt) === cell.iso;
                return (
                  <Pressable
                    key={cell.key}
                    style={[
                      styles.calendarDay,
                      isSelected && styles.calendarDaySelected,
                    ]}
                    onPress={() => applyCalendarDate(cell.iso)}
                  >
                    <Text style={[
                      styles.calendarDayText,
                      !cell.currentMonth && styles.calendarDayOutside,
                      isSelected && styles.calendarDayTextSelected
                    ]}>
                      {cell.dayNumber}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarFooter}>
              <Pressable onPress={() => { setExpiresAt(""); setCalendarOpen(false); }}>
                <Text style={styles.clearText}>Limpar</Text>
              </Pressable>
            </View>
      </AnimatedModal>

      <AnimatedModal visible={confirmRemovePickedFile} onRequestClose={() => setConfirmRemovePickedFile(false)} position="center" contentStyle={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Excluir arquivo?</Text>
            <Text style={styles.confirmText}>Deseja remover este arquivo selecionado?</Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancel} onPress={() => setConfirmRemovePickedFile(false)}>
                <Text style={styles.confirmCancelText}>Não</Text>
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
      </AnimatedModal>
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
  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  progressBlock: { gap: 8 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  progressText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  confirmCard: { width: "100%", maxWidth: 320, borderRadius: 18, backgroundColor: colors.surface, padding: 18, gap: 12 },
  confirmTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  confirmText: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: "center" },
  confirmActions: { flexDirection: "row", gap: 10 },
  confirmCancel: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, paddingVertical: 12, alignItems: "center" },
  confirmCancelText: { color: colors.text, fontWeight: "700" },
  confirmAccept: { flex: 1, borderRadius: 12, backgroundColor: colors.danger, paddingVertical: 12, alignItems: "center" },
  confirmAcceptText: { color: colors.surface, fontWeight: "800" },
  buttonPressed: { opacity: 0.82 },
  // Estilos padronizados do campo de Data (Schedule Style)
  dateField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
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
    fontSize: 16,
    fontWeight: "600",
  },
  // Estilos do Calendario
  calendarCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  calendarArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarArrowText: {
    fontSize: 24,
    color: colors.text,
  },
  calendarMonth: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    textTransform: "capitalize",
  },
  calendarWeekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarWeekLabel: {
    width: "14.28%",
    textAlign: "center",
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  calendarDay: {
    width: "14.28%",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  calendarDaySelected: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    fontSize: 14,
    color: colors.text,
  },
  calendarDayOutside: {
    color: "#ccc",
  },
  calendarDayTextSelected: {
    color: colors.surface,
    fontWeight: "800",
  },
  calendarFooter: {
    marginTop: 16,
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 12,
  },
  clearText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  }
});
