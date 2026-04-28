import { useEffect, useMemo, useRef, useState } from "react";
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
import * as ImagePicker from "expo-image-picker";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { uploadAppMediaListIfNeeded } from "../lib/appMedia";
import { buildMonthGrid, displayDate, isoDate, sameMonth, startOfDay } from "../lib/dateUtils";
import { getErrorMessage } from "../lib/errorMessage";
import { useRooms } from "../hooks/useRooms";
import {
  DailyLogRow,
  PresenceEmployeeRow,
  useDailyLogDetail,
  useDailyLogs,
  useDeleteDailyLog,
  useUpsertDailyLog,
} from "../hooks/useDailyLogs";
import { AnimatedModal } from "../components/AnimatedModal";
import { AppMediaUploadProgress } from "../lib/appMedia";
import { AppIcon } from "../components/AppIcon";

const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const monthLabels = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const monthLogSortOptions = [
  { value: "recentes", label: "Mais recentes" },
  { value: "antigos", label: "Mais antigos" },
  { value: "com_midia", label: "Com mídia primeiro" },
  { value: "sem_midia", label: "Sem mídia primeiro" },
] as const;

type MonthLogSortOrder = (typeof monthLogSortOptions)[number]["value"];

const noWorkReasonOptions = [
  { value: "feriado", label: "Feriado" },
  { value: "condominio fechado", label: "Condomínio fechado" },
  { value: "condominio nao autorizou realizar servicos", label: "Condomínio não autorizou realizar serviços" },
  { value: "chuva intensa", label: "Chuva intensa" },
  { value: "outro", label: "Outro" },
] as const;

type NoWorkReason = (typeof noWorkReasonOptions)[number]["value"];

function getNoWorkReasonLabel(reason: string | null | undefined) {
  return noWorkReasonOptions.find((option) => option.value === reason)?.label ?? "Motivo não informado";
}

function getRoomNames(roomIds: string[] | undefined, roomNameById: Record<string, string>) {
  return (roomIds ?? []).map((roomId) => roomNameById[roomId] ?? "Cômodo removido");
}

function buildServiceSummary(
  serviceItems: { roomId: string; description: string }[],
  roomNameById: Record<string, string>,
) {
  const roomNames = Array.from(
    new Set(
      serviceItems
        .map((item) => roomNameById[item.roomId])
        .filter((roomName): roomName is string => Boolean(roomName)),
    ),
  );

  if (roomNames.length === 0) {
    return "Serviços realizados no dia.";
  }

  if (roomNames.length === 1) {
    return `Serviços realizados em ${roomNames[0]}.`;
  }

  if (roomNames.length === 2) {
    return `Serviços realizados em ${roomNames[0]} e ${roomNames[1]}.`;
  }

  return `Serviços realizados em ${roomNames.slice(0, -1).join(", ")} e ${roomNames[roomNames.length - 1]}.`;
}

function getDailyLogPreview(log: DailyLogRow, roomNameById: Record<string, string>) {
  if (log.no_work_reason) {
    return getNoWorkReasonLabel(log.no_work_reason);
  }

  if ((log.activities ?? "").trim()) {
    return log.activities;
  }

  if (log.service_items.length > 0) {
    const firstItem = log.service_items[0];
    const roomName = roomNameById[firstItem.room_id] ?? "Cômodo removido";
    const suffix = log.service_items.length > 1 ? ` +${log.service_items.length - 1}` : "";
    return `${roomName}: ${firstItem.description}${suffix}`;
  }

  return "Sem descrição preenchida.";
}

type DraftServiceItem = {
  id: string;
  sequence: number;
  roomId: string | null;
  description: string;
};

// Componente de formulario para criacao e edicao de registros diarios.
// Gerencia estados complexos de campos de texto, selecao de funcionarios e upload de midia.
function DailyLogForm({
  projectId,
  date,
  presenceEmployees,
  rooms,
  existingLog,
  initialUserIds,
  visible,
  loading,
  deleting,
  onClose,
  onSave,
  onDelete,
}: {
  projectId: string;
  date: string;
  presenceEmployees: PresenceEmployeeRow[];
  rooms: { id: string; name: string }[];
  existingLog: DailyLogRow | null;
  initialUserIds: string[];
  visible: boolean;
  loading: boolean;
  deleting: boolean;
  onClose: () => void;
  onSave: (payload: { 
    activities: string; 
    weather: string; 
    observations: string; 
    noWorkReason?: NoWorkReason | null;
    noWorkNote?: string | null;
    userIds: string[];
    roomIds?: string[];
    serviceItems?: { roomId: string; description: string }[];
    photosUrls?: string[];
    videosUrls?: string[];
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  // Estados locais para controle dos campos do formulario e lista de midias (fotos/videos).
  // future_fix: considerar o uso de react-hook-form para reduzir a quantidade de estados manuais.
  const [activities, setActivities] = useState(existingLog?.activities ?? "");
  const [weather, setWeather] = useState(existingLog?.weather ?? "");
  const [observations, setObservations] = useState(existingLog?.observations ?? "");
  const [noWorkReason, setNoWorkReason] = useState<NoWorkReason | "">((existingLog?.no_work_reason as NoWorkReason | null) ?? "");
  const [noWorkNote, setNoWorkNote] = useState(existingLog?.no_work_note ?? "");
  const [userIds, setUserIds] = useState<string[]>(initialUserIds);
  const [photosUrls, setPhotosUrls] = useState<string[]>(existingLog?.photos_urls ?? []);
  const [videosUrls, setVideosUrls] = useState<string[]>(existingLog?.videos_urls ?? []);
  const [serviceItems, setServiceItems] = useState<DraftServiceItem[]>(
    (existingLog?.service_items ?? []).map((item, index) => ({
      id: item.id,
      sequence: index + 1,
      roomId: item.room_id,
      description: item.description,
    })),
  );
  const [openServiceRoomId, setOpenServiceRoomId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ type: "photo" | "video"; index: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<AppMediaUploadProgress | null>(null);
  const [noWorkReasonOpen, setNoWorkReasonOpen] = useState(false);
  const previousVisibleRef = useRef(false);
  const lastHydratedLogIdRef = useRef<string | null>(null);
  const hasNoWorkReason = noWorkReason !== "";
  const roomNameById = useMemo(
    () => Object.fromEntries(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );

  useEffect(() => {
    const openedNow = visible && !previousVisibleRef.current;
    const currentLogId = existingLog?.id ?? `new:${date}`;
    const changedTargetLog = visible && lastHydratedLogIdRef.current !== currentLogId;

    if (!openedNow && !changedTargetLog) {
      previousVisibleRef.current = visible;
      return;
    }

    setActivities(existingLog?.activities ?? "");
    setWeather(existingLog?.weather ?? "");
    setObservations(existingLog?.observations ?? "");
    setNoWorkReason((existingLog?.no_work_reason as NoWorkReason | null) ?? "");
    setNoWorkNote(existingLog?.no_work_note ?? "");
    setUserIds(initialUserIds);
    setServiceItems(
      (existingLog?.service_items ?? []).map((item, index) => ({
        id: item.id,
        sequence: index + 1,
        roomId: item.room_id,
        description: item.description,
      })),
    );
    setPhotosUrls(existingLog?.photos_urls ?? []);
    setVideosUrls(existingLog?.videos_urls ?? []);
    setLocalError(null);
    setPendingRemoval(null);
    setUploadProgress(null);
    setNoWorkReasonOpen(false);
    setOpenServiceRoomId(null);
    lastHydratedLogIdRef.current = currentLogId;
    previousVisibleRef.current = visible;
  }, [date, existingLog, initialUserIds, visible]);

  useEffect(() => {
    if (!visible) {
      previousVisibleRef.current = false;
      lastHydratedLogIdRef.current = null;
      setUploadProgress(null);
      setNoWorkReasonOpen(false);
      setOpenServiceRoomId(null);
    }
  }, [visible]);

  const handleToggleUser = (userId: string) => {
    setUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  };

  // Logica de selecao de arquivos da galeria utilizando Expo ImagePicker.
  // Suporta selecao multipla de fotos e videos com controle de permissao.
  const pickMediaFiles = async (isPhoto: boolean): Promise<string[]> => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        Alert.alert("Permissão", `Permita o acesso à galeria para escolher ${isPhoto ? "fotos" : "vídeos"}.`);
        return [];
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isPhoto ? ["images"] : ["videos"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets.length) {
        return [];
      }

      return result.assets.map((asset) => asset.uri).filter(Boolean);
    } catch (error) {
      console.error("Media selection error:", error);
      setLocalError(`Erro ao selecionar arquivo: ${getErrorMessage(error, "Não foi possível selecionar o arquivo.")}`);
      return [];
    }
  };

  const handleAddPhoto = async () => {
    const urls = await pickMediaFiles(true);
    if (urls.length) {
      setPhotosUrls((current) => [...current, ...urls]);
    }
  };

  const handleAddVideo = async () => {
    const urls = await pickMediaFiles(false);
    if (urls.length) {
      setVideosUrls((current) => [...current, ...urls]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotosUrls((current) => current.filter((_, i) => i !== index));
  };

  const handleRemoveVideo = (index: number) => {
    setVideosUrls((current) => current.filter((_, i) => i !== index));
  };

  const handleOpenMedia = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Mídia", "Não foi possível abrir este arquivo.");
    }
  };

  const handleRequestRemoval = (type: "photo" | "video", index: number) => {
    setPendingRemoval({ type, index });
  };

  const handleConfirmRemoval = () => {
    if (!pendingRemoval) return;

    if (pendingRemoval.type === "photo") {
      handleRemovePhoto(pendingRemoval.index);
    } else {
      handleRemoveVideo(pendingRemoval.index);
    }

    setPendingRemoval(null);
  };

  const handleClose = () => {
    setActivities(existingLog?.activities ?? "");
    setWeather(existingLog?.weather ?? "");
    setObservations(existingLog?.observations ?? "");
    setNoWorkReason((existingLog?.no_work_reason as NoWorkReason | null) ?? "");
    setNoWorkNote(existingLog?.no_work_note ?? "");
    setUserIds(initialUserIds);
    setServiceItems(
      (existingLog?.service_items ?? []).map((item, index) => ({
        id: item.id,
        sequence: index + 1,
        roomId: item.room_id,
        description: item.description,
      })),
    );
    setPhotosUrls(existingLog?.photos_urls ?? []);
    setVideosUrls(existingLog?.videos_urls ?? []);
    setLocalError(null);
    setUploadProgress(null);
    setNoWorkReasonOpen(false);
    setOpenServiceRoomId(null);
    onClose();
  };

  // Processo de salvamento do registro, incluindo o upload de midias para o Supabase Storage.
  // future_fix: implementar barra de progresso para uploads de videos grandes.
  const handleSave = async () => {
    if (noWorkReason === "outro" && !noWorkNote.trim()) {
      setLocalError("Descreva o motivo de não ter tido serviço hoje.");
      return;
    }

    setUploading(true);
    setLocalError(null);
    setUploadProgress({ progress: 0, message: "Preparando envio...", completedItems: 0, totalItems: 0 });

    try {
      if (hasNoWorkReason) {
        setUploadProgress({ progress: 100, message: "Salvando dia sem serviço...", completedItems: 0, totalItems: 0 });
        await onSave({
          activities: "",
          weather: "",
          observations: "",
          noWorkReason: noWorkReason || null,
          noWorkNote: noWorkReason === "outro" ? noWorkNote : null,
          userIds: [],
          photosUrls: [],
          videosUrls: [],
        });
        return;
      }

      const normalizedServiceItems = serviceItems
        .map((item) => ({
          roomId: item.roomId?.trim() ?? "",
          description: item.description.trim(),
        }));

      const hasPartialServiceItem = normalizedServiceItems.some(
        (item) => Boolean(item.roomId) !== Boolean(item.description),
      );

      if (hasPartialServiceItem) {
        setLocalError("Preencha cômodo e descrição em cada serviço detalhado, ou remova a linha incompleta.");
        setUploading(false);
        setUploadProgress(null);
        return;
      }

      const validServiceItems = normalizedServiceItems.filter(
        (item) => Boolean(item.roomId) && Boolean(item.description),
      ) as { roomId: string; description: string }[];

      if (!activities.trim() && validServiceItems.length === 0) {
        setLocalError("Preencha um resumo geral do dia ou adicione ao menos uma frente de trabalho.");
        setUploading(false);
        setUploadProgress(null);
        return;
      }

      const derivedRoomIds = Array.from(new Set(validServiceItems.map((item) => item.roomId)));
      const resolvedActivities = activities.trim() || buildServiceSummary(validServiceItems, roomNameById);

      const uploadedPhotos = await uploadAppMediaListIfNeeded({
        uris: photosUrls,
        pathPrefix: `${projectId}/photos`,
        fileBaseName: "photo",
        bucket: "daily-logs",
        onProgress: (progress) => {
          setUploadProgress({
            ...progress,
            message: `Fotos: ${progress.message}`,
          });
        },
      });

      const uploadedVideos = await uploadAppMediaListIfNeeded({
        uris: videosUrls,
        pathPrefix: `${projectId}/videos`,
        fileBaseName: "video",
        bucket: "daily-logs",
        contentType: "video/mp4",
        onProgress: (progress) => {
          setUploadProgress({
            ...progress,
            message: `Videos: ${progress.message}`,
          });
        },
      });

      setUploadProgress({ progress: 100, message: "Salvando registro...", completedItems: 0, totalItems: 0 });
      await onSave({
        activities: resolvedActivities,
        weather,
        observations,
        noWorkReason: null,
        noWorkNote: null,
        userIds,
        roomIds: derivedRoomIds,
        serviceItems: validServiceItems,
        photosUrls: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
        videosUrls: uploadedVideos.length > 0 ? uploadedVideos : undefined,
      });
    } catch (error) {
      console.error("Upload error:", error);
      setLocalError(`Erro ao salvar registro: ${getErrorMessage(error, "Não foi possível concluir o upload e o salvamento.")}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = () => {
    const message = "Esse registro do dia sera removido permanentemente.";

    if (Platform.OS === "web") {
      if (window.confirm(`Excluir registro?\n\n${message}`)) {
        void onDelete();
      }
      return;
    }

    Alert.alert("Excluir registro?", message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void onDelete();
        },
      },
    ]);
  };

  const handleChangeNoWorkReason = (reason: NoWorkReason | "") => {
    setNoWorkReason(reason);
    if (reason !== "outro") {
      setNoWorkNote("");
    }
    setNoWorkReasonOpen(false);
  };

  const handleAddServiceItem = () => {
    setServiceItems((current) => {
      const nextSequence = current.reduce((highest, item) => Math.max(highest, item.sequence), 0) + 1;

      return [
        {
          id: `draft-${Date.now()}-${current.length}`,
          sequence: nextSequence,
          roomId: null,
          description: "",
        },
        ...current,
      ];
    });
  };

  const handleChangeServiceItem = (itemId: string, updates: Partial<DraftServiceItem>) => {
    setServiceItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  };

  const handleRemoveServiceItem = (itemId: string) => {
    setServiceItems((current) => current.filter((item) => item.id !== itemId));
    setOpenServiceRoomId((current) => (current === itemId ? null : current));
  };
  return (
    <AnimatedModal visible={visible} onRequestClose={handleClose} position="center" contentStyle={styles.modalCard}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Registro do Dia - {displayDate(date)}</Text>
        <Pressable onPress={handleClose}>
          <Text style={styles.closeIcon}>×</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.modalScroll}
        contentContainerStyle={styles.modalContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
            {localError ? <Text style={styles.localError}>{localError}</Text> : null}

            {uploadProgress ? (
              <View style={styles.progressBlock}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${uploadProgress.progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(uploadProgress.progress)}% • {uploadProgress.message}</Text>
              </View>
            ) : null}

            <Text style={styles.formSectionTitle}>Contexto do dia</Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Não teve serviço no dia?</Text>
              <View style={styles.selectBlock}>
                <Pressable
                  style={({ pressed }) => [styles.selectButton, pressed && styles.buttonPressed]}
                  onPress={() => setNoWorkReasonOpen((current) => !current)}
                >
                  <Text style={[styles.selectButtonText, !hasNoWorkReason && styles.selectPlaceholderText]}>
                    {hasNoWorkReason ? getNoWorkReasonLabel(noWorkReason) : "Selecione o motivo"}
                  </Text>
                  <AppIcon name={noWorkReasonOpen ? "ChevronUp" : "ChevronDown"} size={18} color={colors.textMuted} />
                </Pressable>
                {noWorkReasonOpen ? (
                  <View style={styles.selectMenu}>
                    <ScrollView nestedScrollEnabled style={styles.selectMenuScroll}>
                      <Pressable
                        style={[styles.selectOption, !hasNoWorkReason && styles.selectOptionActive]}
                        onPress={() => handleChangeNoWorkReason("")}
                      >
                        <Text style={[styles.selectOptionText, !hasNoWorkReason && styles.selectOptionTextActive]}>Selecione o motivo</Text>
                      </Pressable>
                      {noWorkReasonOptions.map((option) => (
                        <Pressable
                          key={option.value}
                          style={[styles.selectOption, noWorkReason === option.value && styles.selectOptionActive]}
                          onPress={() => handleChangeNoWorkReason(option.value)}
                        >
                          <Text style={[styles.selectOptionText, noWorkReason === option.value && styles.selectOptionTextActive]}>{option.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>

            {hasNoWorkReason ? (
              <View style={styles.noWorkInfoCard}>
                <AppIcon name="CircleAlert" size={18} color={colors.danger} />
                <Text style={styles.noWorkInfoText}>
                  Ao salvar, este dia será registrado como sem serviço e os campos operacionais abaixo serão ignorados.
                </Text>
              </View>
            ) : null}

            {noWorkReason === "outro" ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Qual motivo de não ter tido serviço hoje?</Text>
                <TextInput
                  multiline
                  placeholder="Descreva o motivo..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.fieldInput, styles.textAreaMedium]}
                  value={noWorkNote}
                  onChangeText={setNoWorkNote}
                />
              </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Clima</Text>
              <TextInput
                placeholder="Ex: Ensolarado, Chuvoso ..."
                placeholderTextColor={colors.textMuted}
                style={[styles.fieldInput, hasNoWorkReason && styles.fieldDisabled]}
                value={weather}
                onChangeText={setWeather}
                editable={!hasNoWorkReason}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Funcionários presentes ({userIds.length}/{presenceEmployees.length})</Text>
              {presenceEmployees.length > 0 ? (
                <View style={styles.employeeList}>
                  {presenceEmployees.map((employee) => {
                    const selected = userIds.includes(employee.id);

                    return (
                      <Pressable
                        key={employee.id}
                        style={({ pressed }) => [
                          styles.employeeChip,
                          selected && styles.employeeChipActive,
                          hasNoWorkReason && styles.fieldDisabled,
                          pressed && !hasNoWorkReason && styles.buttonPressed,
                        ]}
                        onPress={() => {
                          if (hasNoWorkReason) return;
                          handleToggleUser(employee.id);
                        }}
                      >
                        <Text style={[styles.employeeChipText, selected && styles.employeeChipTextActive]}>
                          {employee.full_name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyEmployeeBox}>
                  <Text style={styles.emptyEmployeeText}>Nenhum funcionário ativo cadastrado</Text>
                </View>
              )}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Fotos e Vídeos</Text>
              <View style={styles.mediaSection}>
                <Pressable 
                  style={({ pressed }) => [styles.mediaButton, hasNoWorkReason && styles.fieldDisabled, pressed && !hasNoWorkReason && styles.buttonPressed]}
                  onPress={handleAddPhoto}
                  disabled={uploading || hasNoWorkReason}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.mediaButtonText}>+ Fotos</Text>
                  )}
                </Pressable>
                <View style={styles.previewSection}>
                  <Text style={styles.mediaGridTitle}>Fotos ({photosUrls.length})</Text>
                  {photosUrls.length ? (
                    <View style={styles.mediaListRow}>
                      {photosUrls.map((url, index) => (
                        <Pressable
                          key={`photo_${index}`}
                          style={styles.mediaItemContainer}
                          onPress={() => void handleOpenMedia(url)}
                          onLongPress={() => handleRequestRemoval("photo", index)}
                          delayLongPress={1500}
                        >
                          <Image source={{ uri: url }} style={styles.mediaThumb} />
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyPreviewBox}>
                      <Text style={styles.emptyPreviewText}>Nenhuma foto adicionada.</Text>
                    </View>
                  )}
                </View>

                <Pressable 
                  style={({ pressed }) => [styles.mediaButton, hasNoWorkReason && styles.fieldDisabled, pressed && !hasNoWorkReason && styles.buttonPressed]}
                  onPress={handleAddVideo}
                  disabled={uploading || hasNoWorkReason}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.mediaButtonText}>+ Vídeos</Text>
                  )}
                </Pressable>
                <View style={styles.previewSection}>
                  <Text style={styles.mediaGridTitle}>Vídeos ({videosUrls.length})</Text>
                  {videosUrls.length ? (
                    <View style={styles.mediaListRow}>
                      {videosUrls.map((url, index) => (
                        <Pressable
                          key={`video_${index}`}
                          style={styles.mediaItemContainer}
                          onPress={() => void handleOpenMedia(url)}
                          onLongPress={() => handleRequestRemoval("video", index)}
                          delayLongPress={1500}
                        >
                          <View style={styles.videoThumb}>
                            <Text style={styles.videoIcon}>▶</Text>
                            <Text style={styles.videoLabel}>Video {index + 1}</Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyPreviewBox}>
                      <Text style={styles.emptyPreviewText}>Nenhum vídeo adicionado.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {!hasNoWorkReason ? <View style={styles.divider} /> : null}

            <Text style={styles.formSectionTitle}>Frentes de trabalho</Text>

            <View style={styles.fieldBlock}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Adicionar frente</Text>
                <Pressable
                  style={({ pressed }) => [styles.inlineActionButton, hasNoWorkReason && styles.fieldDisabled, pressed && !hasNoWorkReason && styles.buttonPressed]}
                  onPress={handleAddServiceItem}
                  disabled={hasNoWorkReason}
                >
                  <Text style={styles.inlineActionButtonText}>+ Nova frente</Text>
                </Pressable>
              </View>
              {serviceItems.length === 0 ? (
                <View style={styles.emptyServiceBox}>
                  <Text style={styles.emptyServiceText}>
                    Registre cada frente como um par simples: cômodo + descrição do serviço realizado.
                  </Text>
                </View>
              ) : (
                <View style={styles.serviceItemList}>
                  {serviceItems.map((item, index) => (
                    <View key={item.id} style={styles.serviceItemCard}>
                      <View style={styles.serviceItemHeader}>
                        <Text style={styles.serviceItemTitle}>Frente {item.sequence}</Text>
                        <Pressable onPress={() => handleRemoveServiceItem(item.id)}>
                          <Text style={styles.serviceItemRemove}>Remover</Text>
                        </Pressable>
                      </View>
                      <View style={styles.selectBlock}>
                        <Pressable
                          style={({ pressed }) => [styles.selectButton, hasNoWorkReason && styles.fieldDisabled, pressed && !hasNoWorkReason && styles.buttonPressed]}
                          onPress={() => {
                            if (hasNoWorkReason) return;
                            setOpenServiceRoomId((current) => (current === item.id ? null : item.id));
                          }}
                        >
                          <Text style={[styles.selectButtonText, !item.roomId && styles.selectPlaceholderText]}>
                            {item.roomId ? roomNameById[item.roomId] ?? "Cômodo removido" : "Selecione o cômodo"}
                          </Text>
                          <AppIcon name={openServiceRoomId === item.id ? "ChevronUp" : "ChevronDown"} size={18} color={colors.textMuted} />
                        </Pressable>
                        {openServiceRoomId === item.id ? (
                          <View style={styles.selectMenu}>
                            <ScrollView nestedScrollEnabled style={styles.selectMenuScroll}>
                              {rooms.map((room) => (
                                <Pressable
                                  key={`${item.id}-${room.id}`}
                                  style={[styles.selectOption, item.roomId === room.id && styles.selectOptionActive]}
                                  onPress={() => {
                                    handleChangeServiceItem(item.id, { roomId: room.id });
                                    setOpenServiceRoomId(null);
                                  }}
                                >
                                  <Text style={[styles.selectOptionText, item.roomId === room.id && styles.selectOptionTextActive]}>
                                    {room.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                      <TextInput
                        multiline
                        placeholder="Ex: assentamento de piso, passagem elétrica, impermeabilização..."
                        placeholderTextColor={colors.textMuted}
                        style={[styles.fieldInput, styles.textAreaMedium, hasNoWorkReason && styles.fieldDisabled]}
                        value={item.description}
                        onChangeText={(value) => handleChangeServiceItem(item.id, { description: value })}
                        editable={!hasNoWorkReason}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <Text style={styles.formSectionTitle}>Resumo geral do dia</Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Resumo geral</Text>
              <TextInput
                multiline
                placeholder="Opcional. Se deixar vazio, o app gera um resumo a partir das frentes de trabalho."
                placeholderTextColor={colors.textMuted}
                style={[styles.fieldInput, styles.textAreaLarge, hasNoWorkReason && styles.fieldDisabled]}
                value={activities}
                onChangeText={setActivities}
                editable={!hasNoWorkReason}
              />
              <Text style={styles.helperTextSmall}>
                Use este campo para um resumo consolidado do dia. O detalhamento principal fica nas frentes de trabalho acima.
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Observações</Text>
              <TextInput
                multiline
                placeholder="Observações do dia ..."
                placeholderTextColor={colors.textMuted}
                style={[styles.fieldInput, styles.textAreaMedium, hasNoWorkReason && styles.fieldDisabled]}
                value={observations}
                onChangeText={setObservations}
                editable={!hasNoWorkReason}
              />
            </View>

            <AnimatedModal visible={Boolean(pendingRemoval)} onRequestClose={() => setPendingRemoval(null)} position="center" contentStyle={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Excluir arquivo?</Text>
              <Text style={styles.confirmText}>Deseja remover este item da lista de uploads?</Text>
              <View style={styles.confirmActions}>
                <Pressable style={styles.confirmCancel} onPress={() => setPendingRemoval(null)}>
                  <Text style={styles.confirmCancelText}>Não</Text>
                </Pressable>
                <Pressable style={styles.confirmAccept} onPress={handleConfirmRemoval}>
                  <Text style={styles.confirmAcceptText}>Sim</Text>
                </Pressable>
              </View>
            </AnimatedModal>

            {existingLog ? (
              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  (deleting || pressed) && styles.buttonPressed,
                ]}
                onPress={handleDelete}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Text style={styles.deleteButtonText}>Excluir Registro</Text>
                )}
              </Pressable>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.saveButton, ((loading || uploading) || pressed) && styles.buttonPressed]}
              onPress={() => void handleSave()}
              disabled={loading || uploading}
            >
              {(loading || uploading) ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Salvar Registro</Text>}
            </Pressable>
      </ScrollView>
    </AnimatedModal>
  );
}

// Modal de visualizacao detalhada de um registro diario ja existente.
// Exibe textos, lista de equipe presente e galeria de midias anexadas.
function DailyLogDetailsModal({
  date,
  log,
  presenceEmployees,
  userIds,
  roomNames,
  roomNameById,
  visible,
  onClose,
  onEdit,
}: {
  date: string;
  log: DailyLogRow;
  presenceEmployees: PresenceEmployeeRow[];
  userIds: string[];
  roomNames: string[];
  roomNameById: Record<string, string>;
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const selectedEmployees = presenceEmployees.filter((employee) => userIds.includes(employee.id));
  const isNoWorkDay = Boolean(log.no_work_reason);

  return (
    <AnimatedModal visible={visible} onRequestClose={onClose} position="center" contentStyle={styles.modalCard}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Detalhes do Dia - {displayDate(date)}</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.closeIcon}>×</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {isNoWorkDay ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Dia sem serviço</Text>
                <Text style={[styles.detailValue, styles.detailValueDanger]}>{getNoWorkReasonLabel(log.no_work_reason)}</Text>
              </View>
            ) : (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Atividades realizadas</Text>
                <Text style={styles.detailValue}>{getDailyLogPreview(log, roomNameById)}</Text>
              </View>
            )}

            {isNoWorkDay && log.no_work_note ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Detalhe do motivo</Text>
                <Text style={styles.detailValue}>{log.no_work_note}</Text>
              </View>
            ) : null}

            {!isNoWorkDay && log.weather ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Clima</Text>
                <Text style={styles.detailValue}>{log.weather}</Text>
              </View>
            ) : null}

            {!isNoWorkDay && roomNames.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Cômodos relacionados</Text>
                <Text style={styles.detailValue}>{roomNames.join(", ")}</Text>
              </View>
            ) : null}

            {!isNoWorkDay && log.service_items.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Serviços por cômodo</Text>
                <View style={styles.serviceDetailList}>
                  {log.service_items.map((item) => (
                    <View key={item.id} style={styles.serviceDetailCard}>
                      <Text style={styles.serviceDetailRoom}>{roomNameById[item.room_id] ?? "Cômodo removido"}</Text>
                      <Text style={styles.serviceDetailText}>{item.description}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {!isNoWorkDay && log.observations ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Observações</Text>
                <Text style={styles.detailValue}>{log.observations}</Text>
              </View>
            ) : null}

            {!isNoWorkDay ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Equipe presente ({selectedEmployees.length})</Text>
                <View style={styles.employeeList}>
                  {selectedEmployees.length > 0 ? (
                    selectedEmployees.map((e) => (
                      <View key={e.id} style={styles.employeeChipReadonly}>
                        <Text style={styles.employeeChipText}>{e.full_name}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.detailValueEmpty}>Nenhum funcionário registrado.</Text>
                  )}
                </View>
              </View>
            ) : null}

            {!isNoWorkDay && ((log.photos_urls?.length ?? 0) > 0 || (log.videos_urls?.length ?? 0) > 0) ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Mídias</Text>
                <View style={styles.mediaListRow}>
                  {log.photos_urls?.map((url, i) => (
                    <Pressable key={`p_${i}`} style={styles.mediaItemContainer} onPress={() => Linking.openURL(url)}>
                      <Image source={{ uri: url }} style={styles.mediaThumb} />
                    </Pressable>
                  ))}
                  {log.videos_urls?.map((url, i) => (
                    <Pressable key={`v_${i}`} style={styles.mediaItemContainer} onPress={() => Linking.openURL(url)}>
                      <View style={styles.videoThumb}>
                        <Text style={styles.videoIcon}>▶</Text>
                        <Text style={styles.videoLabel}>Video {i + 1}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Pressable style={styles.editButton} onPress={onEdit}>
              <Text style={styles.editButtonText}>Editar Registro</Text>
            </Pressable>
      </ScrollView>
    </AnimatedModal>
  );
}

// Tela principal do modulo "Dia a Dia", exibindo um calendario mensal de registros.
// Controla a navegacao entre meses e a abertura de modais de criacao/detalhes.
export function DailyScreen() {
  // Hooks para autenticacao, dados do projeto, logs e equipe.
  // Utiliza queries do TanStack Query (via custom hooks) para sincronizacao com Supabase.
  const { user } = useAuth();
  const { project, logs, presenceEmployees, isLoading } = useDailyLogs();
  const { rooms } = useRooms();
  const upsertDailyLog = useUpsertDailyLog();
  const deleteDailyLog = useDeleteDailyLog();
  const [monthDate, setMonthDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState<string | "todos">("todos");
  const [mediaFilter, setMediaFilter] = useState<"todos" | "com_midia" | "sem_midia">("todos");
  const [sortOrder, setSortOrder] = useState<MonthLogSortOrder>("recentes");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [roomFilterDropdownOpen, setRoomFilterDropdownOpen] = useState(false);

  // Mapeamento dos logs por data para facilitar a verificacao de registros no calendario.
  // Otimiza a performance de renderizacao da grade mensal (O(1) para cada dia).
  const logsByDate = useMemo(() => {
    const map: Record<string, DailyLogRow> = {};
    logs.forEach((log) => {
      map[log.date] = log;
    });
    return map;
  }, [logs]);

  const selectedLog = selectedDate ? logsByDate[selectedDate] ?? null : null;
  const userIdsQuery = useDailyLogDetail(selectedLog?.id ?? null);
  const roomNameById = useMemo(
    () => Object.fromEntries(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );
  
  // Calculo e memorizacao da grade de dias do mes atual e labels de exibicao.
  // monthGrid gera uma lista de objetos DayCell para renderizar no calendario.
  const monthGrid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const monthLabel = `${monthLabels[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
  const today = startOfDay(new Date());
  const projectStartDate = project?.start_date ? startOfDay(new Date(project.start_date)) : null;
  const monthLogs = useMemo(
    () => logs.filter((log) => sameMonth(log.date, monthDate)).sort((a, b) => a.date.localeCompare(b.date) * -1),
    [logs, monthDate],
  );
  const filteredMonthLogs = useMemo(() => {
    return [...monthLogs]
      .filter((log) => {
        const roomName = getRoomNames(log.room_ids, roomNameById).join(", ");
        const serviceDescriptions = log.service_items.map((item) => item.description).join(" ");
        const query = searchQuery.trim().toLowerCase();
        const hasMedia = Boolean((log.photos_urls?.length ?? 0) || (log.videos_urls?.length ?? 0));
        const matchesSearch =
          query.length === 0 ||
          displayDate(log.date).toLowerCase().includes(query) ||
          (log.activities ?? "").toLowerCase().includes(query) ||
          (log.weather ?? "").toLowerCase().includes(query) ||
          (log.observations ?? "").toLowerCase().includes(query) ||
          getNoWorkReasonLabel(log.no_work_reason).toLowerCase().includes(query) ||
          (log.no_work_note ?? "").toLowerCase().includes(query) ||
          roomName.toLowerCase().includes(query) ||
          serviceDescriptions.toLowerCase().includes(query);
        const matchesRoom = roomFilter === "todos" || log.room_ids.includes(roomFilter);
        const matchesMedia =
          mediaFilter === "todos" ||
          (mediaFilter === "com_midia" && hasMedia) ||
          (mediaFilter === "sem_midia" && !hasMedia);

        return matchesSearch && matchesRoom && matchesMedia;
      })
      .sort((a, b) => {
        const aHasMedia = Number(Boolean((a.photos_urls?.length ?? 0) || (a.videos_urls?.length ?? 0)));
        const bHasMedia = Number(Boolean((b.photos_urls?.length ?? 0) || (b.videos_urls?.length ?? 0)));

        if (sortOrder === "com_midia" || sortOrder === "sem_midia") {
          const mediaComparison =
            sortOrder === "com_midia" ? bHasMedia - aHasMedia : aHasMedia - bHasMedia;
          if (mediaComparison !== 0) {
            return mediaComparison;
          }
        }

        return sortOrder === "antigos"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date);
      });
  }, [mediaFilter, monthLogs, roomFilter, roomNameById, searchQuery, sortOrder]);
  const monthSummary = useMemo(() => {
    const total = monthLogs.length;
    const withRoom = monthLogs.filter((log) => log.room_ids.length > 0).length;
    const withMedia = monthLogs.filter((log) => Boolean((log.photos_urls?.length ?? 0) || (log.videos_urls?.length ?? 0))).length;
    const withWeather = monthLogs.filter((log) => Boolean(log.weather)).length;
    const withoutWork = monthLogs.filter((log) => Boolean(log.no_work_reason)).length;
    return { total, withRoom, withMedia, withWeather, withoutWork };
  }, [monthLogs]);

  // Manipulador para abertura de um dia especifico no calendario.
  // Decide se deve abrir o formulario de criacao ou o modal de detalhes (se ja houver log).
  const handleOpenDate = (date: Date) => {
    const normalizedDate = startOfDay(date);

    if (normalizedDate.getTime() > today.getTime()) {
      return;
    }

    if (projectStartDate && normalizedDate.getTime() < projectStartDate.getTime()) {
      return;
    }

    const iso = isoDate(normalizedDate);
    setSelectedDate(iso);
    
    if (logsByDate[iso]) {
      setDetailsOpen(true);
    } else {
      setFormOpen(true);
    }
  };

  const handleEditFromDetails = () => {
    setDetailsOpen(false);
    setTimeout(() => {
      setFormOpen(true);
    }, 300);
  };

  // Funcao para salvar (criar ou atualizar) um registro diario no Supabase.
  // Chama a mutation do hook useUpsertDailyLog e fecha o formulario em caso de sucesso.
  const handleSave = async (payload: { 
    activities: string; 
    weather: string; 
      observations: string; 
      noWorkReason?: NoWorkReason | null;
      noWorkNote?: string | null;
      userIds: string[];
      roomIds?: string[];
      serviceItems?: { roomId: string; description: string }[];
    photosUrls?: string[];
    videosUrls?: string[];
  }) => {
    if (!project?.id || !selectedDate || !user?.id) {
      return;
    }

    await upsertDailyLog.mutateAsync({
      projectId: project.id,
      date: selectedDate,
      activities: payload.activities,
      weather: payload.weather,
      observations: payload.observations,
      noWorkReason: payload.noWorkReason ?? null,
      noWorkNote: payload.noWorkNote ?? null,
      createdBy: user.id,
      userIds: payload.userIds,
      roomIds: payload.roomIds ?? [],
      serviceItems: payload.serviceItems ?? [],
      photosUrls: payload.photosUrls,
      videosUrls: payload.videosUrls,
    });

    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (!project?.id || !selectedLog?.id) {
      return;
    }

    await deleteDailyLog.mutateAsync({
      projectId: project.id,
      logId: selectedLog.id,
    });

    setFormOpen(false);
  };

  // Renderizacao do componente principal com Header, Calendario e Listagem mensal.
  // O calendario utiliza pressables para cada dia da grade gerada.
  return (
    <View style={styles.screen}>
      <View style={styles.dailyHeader}>
        <View>
          <Text style={styles.dailyTitle}>Dia a Dia</Text>
          <Text style={styles.dailySubtitle}>Registro diário da obra</Text>
        </View>

        <Pressable style={({ pressed }) => [styles.todayButton, pressed && styles.buttonPressed]} onPress={() => handleOpenDate(new Date())}>
          <Text style={styles.todayButtonText}>+ Hoje</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingCopy}>Carregando registros...</Text>
        </View>
      ) : (
        <ScrollView style={styles.calendarCard} contentContainerStyle={styles.dailyContent} showsVerticalScrollIndicator={false}>
          <View style={styles.monthHeader}>
            <Pressable style={styles.monthArrow} onPress={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
              <Text style={styles.monthArrowText}>‹</Text>
            </Pressable>

            <Text style={styles.monthLabel}>{monthLabel}</Text>

            <Pressable style={styles.monthArrow} onPress={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
              <Text style={styles.monthArrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekHeader}>
            {weekLabels.map((label) => (
              <Text key={label} style={styles.weekLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {monthGrid.map((cell) => {
              const isDisabled =
                cell.date.getTime() > today.getTime() ||
                (projectStartDate ? cell.date.getTime() < projectStartDate.getTime() : false);
              const isCurrentDay = cell.iso === isoDate(today);
              const logForDay = logsByDate[cell.iso];
              const hasLog = Boolean(logForDay);
              const isNoWorkDay = Boolean(logForDay?.no_work_reason);
              const isSelected = selectedDate === cell.iso;

              return (
                <Pressable
                  key={cell.key}
                  style={({ pressed }) => [
                    styles.dayCell,
                    pressed && !isDisabled && styles.buttonPressed,
                  ]}
                  disabled={isDisabled}
                  onPress={() => handleOpenDate(cell.date)}
                >
                  <View
                    style={[
                      styles.dayBubble,
                      isCurrentDay && styles.dayBubbleToday,
                      isSelected && styles.dayBubbleSelected,
                      hasLog && (isNoWorkDay ? styles.dayBubbleRegisteredNoWork : styles.dayBubbleRegistered),
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !cell.currentMonth && styles.dayOutsideMonth,
                        isDisabled && styles.dayDisabled,
                        hasLog && (isNoWorkDay ? styles.dayWithNoWork : styles.dayWithLog),
                        (isCurrentDay || isSelected) && styles.dayTextHighlighted,
                      ]}
                    >
                      {cell.dayNumber}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotRegistered]} />
              <Text style={styles.legendText}>Registrado</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotNoWork]} />
              <Text style={styles.legendText}>Sem serviço</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotToday]} />
              <Text style={styles.legendText}>Hoje</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotEmpty]} />
              <Text style={styles.legendText}>Sem registro</Text>
            </View>
          </View>

          {!projectStartDate ? (
            <Text style={styles.projectHint}>Configure a data de início da obra em Configurações</Text>
          ) : null}

          <View style={styles.monthListSection}>
            <Text style={styles.monthListTitle}>Registros de {monthLabel}</Text>
            <View style={styles.searchBar}>
              <AppIcon name="Search" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar registro do mês..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== "" ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <AppIcon name="XCircle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCount}>{monthSummary.total}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardRoom]}>
                <Text style={[styles.summaryCount, styles.summaryCountRoom]}>{monthSummary.withRoom}</Text>
                <Text style={[styles.summaryLabel, styles.summaryLabelRoom]}>Com cômodo</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardMedia]}>
                <Text style={[styles.summaryCount, styles.summaryCountMedia]}>{monthSummary.withMedia}</Text>
                <Text style={[styles.summaryLabel, styles.summaryLabelMedia]}>Com mídia</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCount}>{monthSummary.withWeather}</Text>
                <Text style={styles.summaryLabel}>Com clima</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardNoWork]}>
                <Text style={[styles.summaryCount, styles.summaryCountNoWork]}>{monthSummary.withoutWork}</Text>
                <Text style={[styles.summaryLabel, styles.summaryLabelNoWork]}>Sem serviço</Text>
              </View>
            </View>

            <Pressable
              style={styles.filtersDropdownButton}
              onPress={() => {
                setFiltersOpen((current) => !current);
                setRoomFilterDropdownOpen(false);
              }}
            >
              <View style={styles.filtersDropdownInfo}>
                <AppIcon name="SlidersHorizontal" size={16} color={colors.primary} />
                <Text style={styles.filtersDropdownTitle}>Filtros da lista</Text>
              </View>
              <View style={styles.filtersDropdownBadges}>
                <View style={styles.activeBadge}>
                  <AppIcon name="MapPinned" size={12} color={colors.primary} />
                  <Text style={styles.activeBadgeText}>
                    {roomFilter === "todos" ? "Sem filtro de cômodo" : roomNameById[roomFilter] ?? "Cômodo"}
                  </Text>
                </View>
                <View style={styles.activeBadge}>
                  <AppIcon name="ArrowUpDown" size={12} color={colors.primary} />
                  <Text style={styles.activeBadgeText}>{monthLogSortOptions.find((option) => option.value === sortOrder)?.label}</Text>
                </View>
                <AppIcon name={filtersOpen ? "ChevronUp" : "ChevronDown"} size={18} color={colors.textMuted} />
              </View>
            </Pressable>

            {filtersOpen ? (
              <View style={styles.filtersDropdownPanel}>
                <View style={styles.sortRow}>
                  <View style={styles.sortHeaderRow}>
                    <Text style={styles.sortLabel}>Cômodo</Text>
                  </View>
                  <View style={styles.selectBlock}>
                    <Pressable
                      style={({ pressed }) => [styles.selectButton, pressed && styles.buttonPressed]}
                      onPress={() => setRoomFilterDropdownOpen((current) => !current)}
                    >
                      <Text style={[styles.selectButtonText, roomFilter === "todos" && styles.selectPlaceholderText]}>
                        {roomFilter === "todos" ? "Selecione um cômodo" : roomNameById[roomFilter] ?? "Cômodo"}
                      </Text>
                      <AppIcon name={roomFilterDropdownOpen ? "ChevronUp" : "ChevronDown"} size={18} color={colors.textMuted} />
                    </Pressable>
                    {roomFilterDropdownOpen ? (
                      <View style={styles.selectMenu}>
                        <ScrollView nestedScrollEnabled style={styles.selectMenuScroll}>
                          {roomFilter !== "todos" ? (
                            <Pressable
                              style={styles.selectOption}
                              onPress={() => {
                                setRoomFilter("todos");
                                setRoomFilterDropdownOpen(false);
                              }}
                            >
                              <Text style={styles.selectOptionText}>Limpar filtro de cômodo</Text>
                            </Pressable>
                          ) : null}
                          {rooms.map((room) => (
                            <Pressable
                              key={room.id}
                              style={[styles.selectOption, roomFilter === room.id && styles.selectOptionActive]}
                              onPress={() => {
                                setRoomFilter(room.id);
                                setRoomFilterDropdownOpen(false);
                              }}
                            >
                              <Text style={[styles.selectOptionText, roomFilter === room.id && styles.selectOptionTextActive]}>
                                {room.name}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.sortRow}>
                  <View style={styles.sortHeaderRow}>
                    <Text style={styles.sortLabel}>Mídia</Text>
                    <View style={styles.activeBadge}>
                      <AppIcon name="Images" size={12} color={colors.primary} />
                      <Text style={styles.activeBadgeText}>
                        {mediaFilter === "todos" ? "Todos" : mediaFilter === "com_midia" ? "Com mídia" : "Sem mídia"}
                      </Text>
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                    {[
                      { value: "todos", label: "Todos" },
                      { value: "com_midia", label: "Com mídia" },
                      { value: "sem_midia", label: "Sem mídia" },
                    ].map((option) => (
                      <Pressable
                        key={option.value}
                        style={[styles.chip, mediaFilter === option.value && styles.chipActive]}
                        onPress={() => setMediaFilter(option.value as "todos" | "com_midia" | "sem_midia")}
                      >
                        <Text style={[styles.chipText, mediaFilter === option.value && styles.chipTextActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.sortRow}>
                  <View style={styles.sortHeaderRow}>
                    <Text style={styles.sortLabel}>Ordenação</Text>
                    <View style={styles.activeBadge}>
                      <AppIcon name="ArrowUpDown" size={12} color={colors.primary} />
                      <Text style={styles.activeBadgeText}>{monthLogSortOptions.find((option) => option.value === sortOrder)?.label}</Text>
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                    {monthLogSortOptions.map((option) => (
                      <Pressable
                        key={option.value}
                        style={[styles.chip, sortOrder === option.value && styles.chipActive]}
                        onPress={() => setSortOrder(option.value)}
                      >
                        <Text style={[styles.chipText, sortOrder === option.value && styles.chipTextActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            ) : null}

            {filteredMonthLogs.length ? (
              <View style={styles.monthLogList}>
                {filteredMonthLogs.map((log) => (
                  <Pressable
                    key={log.id}
                    style={({ pressed }) => [styles.monthLogCard, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setSelectedDate(log.date);
                      setDetailsOpen(true);
                    }}
                  >
                    <View style={styles.monthLogHeader}>
                      <Text style={styles.monthLogDate}>{displayDate(log.date)}</Text>
                      <Text style={[styles.monthLogTag, log.no_work_reason && styles.monthLogTagDanger]}>
                        {log.no_work_reason ? "Sem serviço" : "Registrado"}
                      </Text>
                    </View>
                    <Text numberOfLines={2} style={styles.monthLogActivities}>
                      {getDailyLogPreview(log, roomNameById)}
                    </Text>
                    {log.no_work_reason && log.no_work_note ? <Text style={styles.monthLogMeta}>{log.no_work_note}</Text> : null}
                    {log.weather ? <Text style={styles.monthLogMeta}>Clima: {log.weather}</Text> : null}
                    {log.room_ids.length > 0 ? <Text style={styles.monthLogMeta}>Cômodos: {getRoomNames(log.room_ids, roomNameById).join(", ")}</Text> : null}
                    {log.service_items.length > 0 ? <Text style={styles.monthLogMeta}>Serviços detalhados: {log.service_items.length}</Text> : null}
                  </Pressable>
                ))}

              </View>
            ) : (
              <View style={styles.monthLogEmpty}>
                <Text style={styles.monthLogEmptyText}>
                  {monthLogs.length === 0
                    ? "Nenhum registro salvo neste mês."
                    : "Nenhum registro encontrado com os filtros atuais."}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {selectedDate && selectedLog ? (
        <DailyLogDetailsModal
          date={selectedDate}
          log={selectedLog}
          presenceEmployees={presenceEmployees}
          userIds={userIdsQuery.data ?? []}
          roomNames={getRoomNames(selectedLog?.room_ids ?? [], roomNameById)}
          roomNameById={roomNameById}
          visible={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          onEdit={handleEditFromDetails}
        />
      ) : null}

      {selectedDate ? (
        <DailyLogForm
          projectId={project?.id ?? ""}
          date={selectedDate}
          presenceEmployees={presenceEmployees}
          rooms={rooms}
          existingLog={selectedLog}
          initialUserIds={userIdsQuery.data ?? []}
          visible={formOpen}
          loading={upsertDailyLog.isPending}
          deleting={deleteDailyLog.isPending}
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  dailyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  dailyTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.text,
  },
  dailySubtitle: {
    marginTop: 2,
    fontSize: 14,
    color: colors.textMuted,
  },
  todayButton: {
    borderRadius: 14,
    backgroundColor: "#d97b00",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  todayButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingCopy: {
    color: colors.textMuted,
    fontSize: 14,
  },
  calendarCard: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 18,
  },
  dailyContent: {
    paddingBottom: 28,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  monthArrow: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  monthArrowText: {
    fontSize: 26,
    lineHeight: 28,
    color: colors.textMuted,
    textAlign: "center",
    includeFontPadding: false,
  },
  monthLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#4c2d12",
    textTransform: "lowercase",
    textAlign: "center",
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  weekLabel: {
    width: "14.28%",
    textAlign: "center",
    fontSize: 14,
    color: colors.textMuted,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 10,
  },
  dayCell: {
    width: "14.28%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingVertical: 2,
  },
  dayBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    fontSize: 24,
    color: "#1d3159",
  },
  dayOutsideMonth: {
    color: "#b0b6c1",
  },
  dayDisabled: {
    color: "#c7ccd5",
  },
  dayWithLog: {
    color: colors.success,
    fontWeight: "700",
  },
  dayWithNoWork: {
    color: colors.danger,
    fontWeight: "700",
  },
  dayBubbleToday: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#d97b00",
  },
  dayBubbleSelected: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#d97b00",
  },
  dayBubbleRegistered: {
    backgroundColor: "#eef8f0",
    borderWidth: 1,
    borderColor: "#79c98d",
  },
  dayBubbleRegisteredNoWork: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: "#d58f85",
  },
  dayTextHighlighted: {
    color: "#4c2d12",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 18,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendDotRegistered: {
    backgroundColor: "#c5f0cf",
    borderWidth: 1,
    borderColor: "#79c98d",
  },
  legendDotNoWork: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  legendDotToday: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: "#d97b00",
  },
  legendDotEmpty: {
    backgroundColor: "#d8dbe0",
  },
  legendText: {
    fontSize: 13,
    color: "#5b5d7b",
  },
  projectHint: {
    marginTop: 18,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    color: "#4f6185",
  },
  monthListSection: {
    marginTop: 22,
    gap: 12,
  },
  monthListTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryCard: {
    minWidth: 96,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  summaryCardRoom: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  summaryCardMedia: {
    backgroundColor: colors.infoLight,
    borderColor: colors.info,
  },
  summaryCardNoWork: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger,
  },
  summaryCount: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
  },
  summaryCountRoom: {
    color: colors.primary,
  },
  summaryCountMedia: {
    color: colors.info,
  },
  summaryCountNoWork: {
    color: colors.danger,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  summaryLabelRoom: {
    color: colors.primary,
  },
  summaryLabelMedia: {
    color: colors.info,
  },
  summaryLabelNoWork: {
    color: colors.danger,
  },
  filtersDropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filtersDropdownInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filtersDropdownTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  filtersDropdownBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  filtersDropdownPanel: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 12,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
  },
  sortRow: {
    gap: 8,
  },
  sortHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  filterChips: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.surface,
  },
  monthLogList: {
    gap: 10,
  },
  monthLogCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 8,
  },
  monthLogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  monthLogDate: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  monthLogTag: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success,
  },
  monthLogTagDanger: {
    color: colors.danger,
  },
  monthLogActivities: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  monthLogMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  monthLogEmpty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
  },
  monthLogEmptyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 28, 23, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalCard: {
    width: "100%",
    height: "82%",
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: colors.text,
  },
  closeIcon: {
    fontSize: 24,
    color: colors.textMuted,
    marginLeft: 10,
  },
  modalContent: {
    gap: 14,
    paddingBottom: 20,
    flexGrow: 1,
  },
  modalScroll: {
    flex: 1,
    minHeight: 0,
  },
  fieldBlock: {
    gap: 8,
  },
  formSectionTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  inlineActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inlineActionButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  fieldInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  fieldDisabled: {
    opacity: 0.5,
  },
  textAreaLarge: {
    minHeight: 116,
    textAlignVertical: "top",
    borderColor: "#d97b00",
    borderWidth: 2,
  },
  textAreaMedium: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  selectBlock: {
    gap: 8,
  },
  selectButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  selectButtonText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  selectPlaceholderText: {
    color: colors.textMuted,
  },
  selectMenu: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  selectMenuScroll: {
    maxHeight: 220,
  },
  selectOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  selectOptionActive: {
    backgroundColor: colors.primarySoft,
  },
  selectOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  selectOptionTextActive: {
    color: colors.primary,
    fontWeight: "800",
  },
  employeeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChipsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  optionChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  optionChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  optionChipTextActive: {
    color: colors.primary,
  },
  helperTextSmall: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyServiceBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyServiceText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  serviceItemList: {
    gap: 12,
  },
  serviceItemCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    padding: 12,
  },
  serviceItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  serviceItemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  serviceItemRemove: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
  },
  employeeChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
  },
  employeeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  employeeChipReadonly: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  employeeChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  employeeChipTextActive: {
    color: colors.primary,
  },
  emptyEmployeeBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyEmployeeText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: 4,
  },
  noWorkInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1c3c3",
    backgroundColor: "#fff5f5",
    padding: 12,
  },
  noWorkInfoText: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  mediaSection: { gap: 12 },
  mediaButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  mediaButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  previewSection: { gap: 8 },
  mediaGridTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  mediaListRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  emptyPreviewBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyPreviewText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  mediaItemContainer: {
    position: "relative",
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
  },
  mediaThumb: {
    width: "100%",
    height: "100%",
  },
  videoThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  videoIcon: {
    fontSize: 32,
    color: colors.text,
  },
  videoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
    borderRadius: 12,
  },
  serviceDetailList: {
    gap: 10,
  },
  serviceDetailCard: {
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serviceDetailRoom: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase",
  },
  serviceDetailText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  detailValueDanger: {
    color: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  detailValueEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  editButton: {
    borderRadius: 14,
    backgroundColor: colors.text,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  editButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
  },
  confirmBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31, 28, 23, 0.24)",
    paddingHorizontal: 20,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 12,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  confirmText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: "center",
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmCancel: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmCancelText: {
    color: colors.text,
    fontWeight: "700",
  },
  confirmAccept: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.danger,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmAcceptText: {
    color: colors.surface,
    fontWeight: "800",
  },
  saveButton: {
    borderRadius: 14,
    backgroundColor: "#d97b00",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 2,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
  },
  deleteButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1c3c3",
    backgroundColor: "#fff5f5",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 2,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "700",
  },
  localError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  progressBlock: {
    gap: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
