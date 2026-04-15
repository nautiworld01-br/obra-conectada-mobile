import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

const statusOptions: { value: UpdateStatus; label: string }[] = [
  { value: "no_prazo", label: "No Prazo" },
  { value: "adiantado", label: "Adiantado" },
  { value: "atrasado", label: "Atrasado" },
];

function parseList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyList(values: string[] | null | undefined) {
  return values && values.length ? values.join(", ") : "";
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function getStatusColors(status: UpdateStatus) {
  switch (status) {
    case "adiantado":
      return { background: "#e8efff", text: "#3566d6" };
    case "atrasado":
      return { background: "#fdeae7", text: colors.danger };
    case "no_prazo":
    default:
      return { background: "#e7f4ec", text: colors.success };
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
  onSave: (payload: {
    weekRef: string;
    summary: string;
    status: UpdateStatus;
    servicesCompleted: string[];
    servicesNotCompleted: string[];
    difficulties: string;
    materialsReceived: string[];
    materialsMissing: string[];
    nextWeekPlan: string;
    observations: string;
    photos: string[];
    videos: string[];
  }) => Promise<void>;
};

function UpdateFormModal(_: UpdateFormModalProps) {
  const { visible, update, loading, onClose, onSave } = _;
  const [draft, setDraft] = useState<UpdateDraft>({
    weekRef: "",
    summary: "",
    status: "no_prazo",
    servicesCompleted: "",
    servicesNotCompleted: "",
    difficulties: "",
    materialsReceived: "",
    materialsMissing: "",
    nextWeekPlan: "",
    observations: "",
    photos: [],
    videos: [],
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

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
  }, [update, visible]);

  const pickMedia = async (mediaType: "images" | "videos") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Galeria", "Permita o acesso a galeria para selecionar arquivos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [mediaType],
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const uris = result.assets.map((asset) => asset.uri).filter(Boolean);

    setDraft((current) => ({
      ...current,
      [mediaType === "images" ? "photos" : "videos"]: [...current[mediaType === "images" ? "photos" : "videos"], ...uris],
    }));
  };

  const handleSave = async () => {
    if (!draft.weekRef.trim()) {
      setLocalError("Informe a semana de referencia.");
      return;
    }

    if (!draft.summary.trim()) {
      setLocalError("Informe o resumo da atualizacao.");
      return;
    }

    setLocalError(null);

    await onSave({
      weekRef: draft.weekRef.trim(),
      summary: draft.summary.trim(),
      status: draft.status,
      servicesCompleted: parseList(draft.servicesCompleted),
      servicesNotCompleted: parseList(draft.servicesNotCompleted),
      difficulties: draft.difficulties.trim(),
      materialsReceived: parseList(draft.materialsReceived),
      materialsMissing: parseList(draft.materialsMissing),
      nextWeekPlan: draft.nextWeekPlan.trim(),
      observations: draft.observations.trim(),
      photos: draft.photos,
      videos: draft.videos,
    });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{update ? "Editar Atualizacao" : "Nova Atualizacao Semanal"}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.row}>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Semana *</Text>
                <TextInput
                  style={[styles.fieldInput, styles.primaryInput]}
                  value={draft.weekRef}
                  onChangeText={(value) => setDraft((current) => ({ ...current, weekRef: value }))}
                  placeholder="Semana 01/2026"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={[styles.fieldBlock, styles.halfField]}>
                <Text style={styles.fieldLabel}>Status</Text>
                <Pressable style={styles.selectField} onPress={() => setStatusOpen(true)}>
                  <Text style={styles.selectFieldText}>{statusOptions.find((option) => option.value === draft.status)?.label ?? "No Prazo"}</Text>
                  <Text style={styles.selectFieldArrow}>˅</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Resumo *</Text>
              <TextInput
                multiline
                style={[styles.fieldInput, styles.textArea]}
                value={draft.summary}
                onChangeText={(value) => setDraft((current) => ({ ...current, summary: value }))}
                placeholder="Resumo da semana"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Servicos Executados</Text>
              <TextInput
                style={styles.fieldInput}
                value={draft.servicesCompleted}
                onChangeText={(value) => setDraft((current) => ({ ...current, servicesCompleted: value }))}
                placeholder="Separar por virgula"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Nao Concluidos</Text>
              <TextInput
                style={styles.fieldInput}
                value={draft.servicesNotCompleted}
                onChangeText={(value) => setDraft((current) => ({ ...current, servicesNotCompleted: value }))}
                placeholder="Separar por virgula"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Dificuldades</Text>
              <TextInput
                multiline
                style={[styles.fieldInput, styles.textArea]}
                value={draft.difficulties}
                onChangeText={(value) => setDraft((current) => ({ ...current, difficulties: value }))}
                placeholder="Bloqueios e pontos de atencao"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Materiais Recebidos</Text>
              <TextInput
                style={styles.fieldInput}
                value={draft.materialsReceived}
                onChangeText={(value) => setDraft((current) => ({ ...current, materialsReceived: value }))}
                placeholder="Separar por virgula"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Materiais Faltantes</Text>
              <TextInput
                style={styles.fieldInput}
                value={draft.materialsMissing}
                onChangeText={(value) => setDraft((current) => ({ ...current, materialsMissing: value }))}
                placeholder="Separar por virgula"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Plano Proxima Semana</Text>
              <TextInput
                multiline
                style={[styles.fieldInput, styles.textArea]}
                value={draft.nextWeekPlan}
                onChangeText={(value) => setDraft((current) => ({ ...current, nextWeekPlan: value }))}
                placeholder="O que vem na proxima semana"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Observacoes</Text>
              <TextInput
                multiline
                style={[styles.fieldInput, styles.textArea]}
                value={draft.observations}
                onChangeText={(value) => setDraft((current) => ({ ...current, observations: value }))}
                placeholder="Anotacoes adicionais"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Fotos e Videos</Text>
              <View style={styles.mediaActionRow}>
                <Pressable style={({ pressed }) => [styles.mediaButton, pressed && styles.buttonPressed]} onPress={() => void pickMedia("images")}>
                  <Text style={styles.mediaButtonText}>Fotos</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.mediaButton, pressed && styles.buttonPressed]} onPress={() => void pickMedia("videos")}>
                  <Text style={styles.mediaButtonText}>Videos</Text>
                </Pressable>
              </View>
              {draft.photos.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaPreviewRow}>
                  {draft.photos.map((photo, index) => (
                    <View key={`${photo}-${index}`} style={styles.mediaThumbWrap}>
                      <Image source={{ uri: photo }} style={styles.mediaThumb} />
                      <Pressable
                        style={styles.mediaRemove}
                        onPress={() =>
                          setDraft((current) => ({
                            ...current,
                            photos: current.photos.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        <Text style={styles.mediaRemoveText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              {draft.videos.length ? (
                <View style={styles.videoList}>
                  {draft.videos.map((video, index) => (
                    <View key={`${video}-${index}`} style={styles.videoRow}>
                      <Text numberOfLines={1} style={styles.videoText}>Video {index + 1}</Text>
                      <Pressable
                        onPress={() =>
                          setDraft((current) => ({
                            ...current,
                            videos: current.videos.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        <Text style={styles.videoRemoveText}>Remover</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {localError ? <Text style={styles.localError}>{localError}</Text> : null}

            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={() => void handleSave()}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>{update ? "Salvar Atualizacao" : "Registrar Atualizacao"}</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <Modal transparent animationType="fade" visible={statusOpen} onRequestClose={() => setStatusOpen(false)}>
        <Pressable style={styles.dropdownModalBackdrop} onPress={() => setStatusOpen(false)}>
          <Pressable style={styles.dropdownModalCard} onPress={() => undefined}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.dropdownModalContent}>
              {statusOptions.map((option) => {
                const active = option.value === draft.status;
                return (
                  <Pressable
                    key={option.value}
                    style={({ pressed }) => [styles.dropdownItem, active && styles.dropdownItemActive, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setDraft((current) => ({ ...current, status: option.value }));
                      setStatusOpen(false);
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
    </Modal>
  );
}

type UpdateDetailModalProps = {
  update: UpdateRow | null;
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleApproved: () => void;
};

function UpdateDetailModal(_: UpdateDetailModalProps) {
  const { update, visible, loading, onClose, onEdit, onDelete, onToggleApproved } = _;

  if (!update) {
    return null;
  }

  const statusStyle = getStatusColors(update.status);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.detailCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Detalhes da Atualizacao</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.detailTopRow}>
              <Text style={styles.detailWeek}>{update.week_ref}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}>
                <Text style={[styles.statusPillText, { color: statusStyle.text }]}>
                  {statusOptions.find((option) => option.value === update.status)?.label ?? update.status}
                </Text>
              </View>
            </View>

            <Text style={styles.detailDate}>{formatDate(update.date)}</Text>
            <Text style={styles.detailSummary}>{update.summary}</Text>

            <View style={styles.detailActionRowTop}>
              <Pressable style={styles.editPill} onPress={onEdit}>
                <Text style={styles.editPillText}>Editar</Text>
              </Pressable>
              <Pressable style={styles.deletePill} onPress={onDelete}>
                <Text style={styles.deletePillText}>Excluir</Text>
              </Pressable>
            </View>

            {update.services_completed?.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Servicos Executados</Text>
                {update.services_completed.map((item) => (
                  <Text key={item} style={styles.detailBullet}>• {item}</Text>
                ))}
              </View>
            ) : null}

            {update.services_not_completed?.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Nao Concluidos</Text>
                {update.services_not_completed.map((item) => (
                  <Text key={item} style={styles.detailBulletDanger}>• {item}</Text>
                ))}
              </View>
            ) : null}

            {update.difficulties ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Dificuldades</Text>
                <Text style={styles.detailBody}>{update.difficulties}</Text>
              </View>
            ) : null}

            {update.materials_received?.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Materiais Recebidos</Text>
                <View style={styles.tagWrap}>
                  {update.materials_received.map((item) => (
                    <View key={item} style={styles.tagSuccess}>
                      <Text style={styles.tagTextSuccess}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {update.materials_missing?.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Materiais Faltantes</Text>
                <View style={styles.tagWrap}>
                  {update.materials_missing.map((item) => (
                    <View key={item} style={styles.tagDanger}>
                      <Text style={styles.tagTextDanger}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {update.next_week_plan ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Plano Proxima Semana</Text>
                <Text style={styles.detailBody}>{update.next_week_plan}</Text>
              </View>
            ) : null}

            {update.observations ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Observacoes</Text>
                <Text style={styles.detailBody}>{update.observations}</Text>
              </View>
            ) : null}

            {(update.photos?.length || 0) > 0 ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Fotos</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaPreviewRow}>
                  {update.photos?.map((photo, index) => <Image key={`${photo}-${index}`} source={{ uri: photo }} style={styles.mediaThumb} />)}
                </ScrollView>
              </View>
            ) : null}

            {(update.videos?.length || 0) > 0 ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>Videos</Text>
                {update.videos?.map((_, index) => (
                  <Text key={index} style={styles.detailBody}>Video {index + 1}</Text>
                ))}
              </View>
            ) : null}

            <Pressable style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.buttonPressed]} onPress={onToggleApproved}>
              {loading ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryButtonText}>{update.approved ? "Remover aprovacao" : "Marcar como aprovada"}</Text>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function UpdatesScreen() {
  const { user } = useAuth();
  const { project, updates, isLoading } = useUpdates();
  const upsertUpdate = useUpsertUpdate();
  const deleteUpdate = useDeleteUpdate();
  const toggleApproved = useToggleApprovedUpdate();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateRow | null>(null);
  const [editingUpdate, setEditingUpdate] = useState<UpdateRow | null>(null);

  const handleOpenNew = () => {
    setEditingUpdate(null);
    setFormOpen(true);
  };

  const handleSave = async (payload: {
    weekRef: string;
    summary: string;
    status: UpdateStatus;
    servicesCompleted: string[];
    servicesNotCompleted: string[];
    difficulties: string;
    materialsReceived: string[];
    materialsMissing: string[];
    nextWeekPlan: string;
    observations: string;
    photos: string[];
    videos: string[];
  }) => {
    if (!project?.id || !user?.id) {
      Alert.alert("Casa nao configurada", "Configure a casa antes de registrar atualizacoes.");
      return;
    }

    try {
      await upsertUpdate.mutateAsync({
        id: editingUpdate?.id,
        projectId: project.id,
        userId: user.id,
        weekRef: payload.weekRef,
        summary: payload.summary,
        status: payload.status,
        servicesCompleted: payload.servicesCompleted,
        servicesNotCompleted: payload.servicesNotCompleted,
        difficulties: payload.difficulties,
        materialsReceived: payload.materialsReceived,
        materialsMissing: payload.materialsMissing,
        nextWeekPlan: payload.nextWeekPlan,
        observations: payload.observations,
        photos: payload.photos,
        videos: payload.videos,
      });

      setFormOpen(false);
      setEditingUpdate(null);
      setSelectedUpdate(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar a atualizacao.";
      Alert.alert("Erro ao salvar", message);
    }
  };

  const handleDelete = () => {
    if (!project?.id || !selectedUpdate) {
      return;
    }

    Alert.alert("Excluir atualizacao?", "Esse registro semanal sera removido.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deleteUpdate
            .mutateAsync({ id: selectedUpdate.id, projectId: project.id })
            .then(() => {
              setSelectedUpdate(null);
              setEditingUpdate(null);
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : "Nao foi possivel excluir a atualizacao.";
              Alert.alert("Erro ao excluir", message);
            });
        },
      },
    ]);
  };

  const handleToggleApproved = () => {
    if (!project?.id || !selectedUpdate) {
      return;
    }

    void toggleApproved
      .mutateAsync({
        id: selectedUpdate.id,
        projectId: project.id,
        approved: !selectedUpdate.approved,
      })
      .then(() => setSelectedUpdate(null))
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Nao foi possivel atualizar a aprovacao.";
        Alert.alert("Erro ao atualizar", message);
      });
  };

  if (!project) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Atualizacoes da Obra</Text>
            <Text style={styles.subtitle}>Relatorios semanais</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⌂</Text>
          <Text style={styles.emptyText}>Configure a casa antes de registrar atualizacoes da obra.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Atualizacoes da Obra</Text>
          <Text style={styles.subtitle}>Relatorios semanais</Text>
        </View>

        <Pressable style={({ pressed }) => [styles.newButton, pressed && styles.buttonPressed]} onPress={handleOpenNew}>
          <Text style={styles.newButtonText}>+ Nova</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Carregando atualizacoes...</Text>
        </View>
      ) : updates.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⌂</Text>
          <Text style={styles.emptyText}>Nenhuma atualizacao semanal registrada ainda.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {updates.map((update) => {
            const statusStyle = getStatusColors(update.status);
            return (
              <Pressable key={update.id} style={({ pressed }) => [styles.updateCard, pressed && styles.buttonPressed]} onPress={() => setSelectedUpdate(update)}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.updateWeek}>{update.week_ref}</Text>
                  <View style={[styles.statusPill, { backgroundColor: statusStyle.background }]}>
                    <Text style={[styles.statusPillText, { color: statusStyle.text }]}>
                      {statusOptions.find((option) => option.value === update.status)?.label ?? update.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.updateSummary} numberOfLines={2}>{update.summary}</Text>

                <View style={styles.cardMetaRow}>
                  <Text style={styles.metaText}>Fotos {update.photos?.length ?? 0}</Text>
                  <Text style={styles.metaText}>Videos {update.videos?.length ?? 0}</Text>
                  {update.approved ? <Text style={styles.approvedText}>Aprovada</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <UpdateFormModal
        visible={formOpen}
        update={editingUpdate}
        loading={upsertUpdate.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditingUpdate(null);
        }}
        onSave={handleSave}
      />

      <UpdateDetailModal
        update={selectedUpdate}
        visible={Boolean(selectedUpdate)}
        loading={toggleApproved.isPending || deleteUpdate.isPending}
        onClose={() => setSelectedUpdate(null)}
        onEdit={() => {
          setEditingUpdate(selectedUpdate);
          setFormOpen(true);
        }}
        onDelete={handleDelete}
        onToggleApproved={handleToggleApproved}
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
    color: "#c7ccd5",
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
    gap: 10,
  },
  updateCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  updateWeek: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  updateSummary: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  approvedText: {
    marginLeft: "auto",
    fontSize: 12,
    color: colors.success,
    fontWeight: "700",
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
    maxHeight: "88%",
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  detailCard: {
    width: "100%",
    maxHeight: "88%",
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
  row: {
    flexDirection: "row",
    gap: 10,
  },
  fieldBlock: {
    gap: 8,
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
  primaryInput: {
    borderWidth: 2,
    borderColor: "#d97b00",
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
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
  mediaActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  mediaButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    alignItems: "center",
  },
  mediaButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  mediaPreviewRow: {
    gap: 10,
  },
  mediaThumbWrap: {
    position: "relative",
    marginRight: 2,
  },
  mediaThumb: {
    width: 84,
    height: 84,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
  },
  mediaRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(31, 28, 23, 0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaRemoveText: {
    color: colors.surface,
    fontSize: 15,
    marginTop: -1,
  },
  videoList: {
    gap: 8,
  },
  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  videoText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  videoRemoveText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
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
  dropdownModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 28, 23, 0.12)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  dropdownModalCard: {
    maxHeight: 260,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    overflow: "hidden",
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
  detailTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  detailWeek: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  detailDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  detailSummary: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  detailActionRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  detailBullet: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  detailBulletDanger: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.danger,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagSuccess: {
    borderRadius: 999,
    backgroundColor: "#e7f4ec",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagDanger: {
    borderRadius: 999,
    backgroundColor: "#fdeae7",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagTextSuccess: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  tagTextDanger: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
