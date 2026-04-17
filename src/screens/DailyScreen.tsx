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
import * as ImagePicker from "expo-image-picker";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { uploadAppMediaListIfNeeded } from "../lib/appMedia";
import {
  DailyLogRow,
  EmployeeRow,
  useDailyLogDetail,
  useDailyLogs,
  useDeleteDailyLog,
  useUpsertDailyLog,
} from "../hooks/useDailyLogs";

type DayCell = {
  key: string;
  date: Date;
  iso: string;
  dayNumber: number;
  currentMonth: boolean;
};

const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const monthLabels = [
  "janeiro",
  "fevereiro",
  "marco",
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

// Funcoes utilitarias para manipulacao de datas e geracao da grade do calendario.
// future_fix: mover para src/lib/dateUtils.ts para evitar duplicacao de logica de calendario.
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function sameMonth(iso: string, monthDate: Date) {
  const [year, month] = iso.split("-").map(Number);
  return year === monthDate.getFullYear() && month === monthDate.getMonth() + 1;
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
      date,
      iso: isoDate(date),
      dayNumber: date.getDate(),
      currentMonth: date.getMonth() === currentMonthDate.getMonth(),
    };
  });
}

// Componente de formulario para criacao e edicao de registros diarios.
// Gerencia estados complexos de campos de texto, selecao de funcionarios e upload de midia.
function DailyLogForm({
  projectId,
  date,
  employees,
  existingLog,
  initialEmployeeIds,
  visible,
  loading,
  deleting,
  onClose,
  onSave,
  onDelete,
}: {
  projectId: string;
  date: string;
  employees: EmployeeRow[];
  existingLog: DailyLogRow | null;
  initialEmployeeIds: string[];
  visible: boolean;
  loading: boolean;
  deleting: boolean;
  onClose: () => void;
  onSave: (payload: { 
    activities: string; 
    weather: string; 
    observations: string; 
    employeeIds: string[];
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
  const [employeeIds, setEmployeeIds] = useState<string[]>(initialEmployeeIds);
  const [photosUrls, setPhotosUrls] = useState<string[]>(existingLog?.photos_urls ?? []);
  const [videosUrls, setVideosUrls] = useState<string[]>(existingLog?.videos_urls ?? []);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ type: "photo" | "video"; index: number } | null>(null);

  useEffect(() => {
    setActivities(existingLog?.activities ?? "");
    setWeather(existingLog?.weather ?? "");
    setObservations(existingLog?.observations ?? "");
    setEmployeeIds(initialEmployeeIds);
    setPhotosUrls(existingLog?.photos_urls ?? []);
    setVideosUrls(existingLog?.videos_urls ?? []);
    setLocalError(null);
    setPendingRemoval(null);
  }, [existingLog, initialEmployeeIds, visible]);

  const handleToggleEmployee = (employeeId: string) => {
    setEmployeeIds((current) =>
      current.includes(employeeId) ? current.filter((item) => item !== employeeId) : [...current, employeeId],
    );
  };

  // Logica de selecao de arquivos da galeria utilizando Expo ImagePicker.
  // Suporta selecao multipla de fotos e videos com controle de permissao.
  const pickMediaFiles = async (isPhoto: boolean): Promise<string[]> => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        Alert.alert("Permissao", `Permita o acesso a galeria para escolher ${isPhoto ? "fotos" : "videos"}.`);
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
      setLocalError(`Erro ao selecionar arquivo: ${error instanceof Error ? error.message : "erro desconhecido"}`);
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
      Alert.alert("Midia", "Nao foi possivel abrir este arquivo.");
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
    setEmployeeIds(initialEmployeeIds);
    setPhotosUrls(existingLog?.photos_urls ?? []);
    setVideosUrls(existingLog?.videos_urls ?? []);
    setLocalError(null);
    onClose();
  };

  // Processo de salvamento do registro, incluindo o upload de midias para o Supabase Storage.
  // future_fix: implementar barra de progresso para uploads de videos grandes.
  const handleSave = async () => {
    if (!activities.trim()) {
      setLocalError("Descreva ao menos as atividades realizadas no dia.");
      return;
    }

    setUploading(true);
    setLocalError(null);

    try {
      const uploadedPhotos = await uploadAppMediaListIfNeeded({
        uris: photosUrls,
        pathPrefix: `${projectId}/photos`,
        fileBaseName: "photo",
        bucket: "daily-logs"
      });

      const uploadedVideos = await uploadAppMediaListIfNeeded({
        uris: videosUrls,
        pathPrefix: `${projectId}/videos`,
        fileBaseName: "video",
        bucket: "daily-logs",
        contentType: "video/mp4",
      });

      await onSave({
        activities,
        weather,
        observations,
        employeeIds,
        photosUrls: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
        videosUrls: uploadedVideos.length > 0 ? uploadedVideos : undefined,
      });
    } catch (error) {
      console.error("Upload error:", error);
      setLocalError(`Erro ao enviar arquivos: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setUploading(false);
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
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.modalCard}>
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
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Atividades realizadas *</Text>
              <TextInput
                multiline
                placeholder="Descreva o que foi feito hoje ..."
                placeholderTextColor={colors.textMuted}
                style={[styles.fieldInput, styles.textAreaLarge]}
                value={activities}
                onChangeText={setActivities}
              />
            </View>

            {localError ? <Text style={styles.localError}>{localError}</Text> : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Clima</Text>
              <TextInput
                placeholder="Ex: Ensolarado, Chuvoso ..."
                placeholderTextColor={colors.textMuted}
                style={styles.fieldInput}
                value={weather}
                onChangeText={setWeather}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Observacoes</Text>
              <TextInput
                multiline
                placeholder="Observacoes do dia ..."
                placeholderTextColor={colors.textMuted}
                style={[styles.fieldInput, styles.textAreaMedium]}
                value={observations}
                onChangeText={setObservations}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Funcionarios presentes ({employeeIds.length}/{employees.length})</Text>
              {employees.length > 0 ? (
                <View style={styles.employeeList}>
                  {employees.map((employee) => {
                    const selected = employeeIds.includes(employee.id);

                    return (
                      <Pressable
                        key={employee.id}
                        style={({ pressed }) => [
                          styles.employeeChip,
                          selected && styles.employeeChipActive,
                          pressed && styles.buttonPressed,
                        ]}
                        onPress={() => handleToggleEmployee(employee.id)}
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
                  <Text style={styles.emptyEmployeeText}>Nenhum funcionario ativo cadastrado</Text>
                </View>
              )}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Fotos e Videos</Text>
              <View style={styles.mediaSection}>
                <Pressable 
                  style={({ pressed }) => [styles.mediaButton, pressed && styles.buttonPressed]}
                  onPress={handleAddPhoto}
                  disabled={uploading}
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
                  style={({ pressed }) => [styles.mediaButton, pressed && styles.buttonPressed]}
                  onPress={handleAddVideo}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.mediaButtonText}>+ Videos</Text>
                  )}
                </Pressable>
                <View style={styles.previewSection}>
                  <Text style={styles.mediaGridTitle}>Videos ({videosUrls.length})</Text>
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
                      <Text style={styles.emptyPreviewText}>Nenhum video adicionado.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <Modal transparent animationType="fade" visible={Boolean(pendingRemoval)} onRequestClose={() => setPendingRemoval(null)}>
              <View style={styles.confirmBackdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingRemoval(null)} />
                <View style={styles.confirmCard}>
                  <Text style={styles.confirmTitle}>Excluir arquivo?</Text>
                  <Text style={styles.confirmText}>Deseja remover este item da lista de uploads?</Text>
                  <View style={styles.confirmActions}>
                    <Pressable style={styles.confirmCancel} onPress={() => setPendingRemoval(null)}>
                      <Text style={styles.confirmCancelText}>Nao</Text>
                    </Pressable>
                    <Pressable style={styles.confirmAccept} onPress={handleConfirmRemoval}>
                      <Text style={styles.confirmAcceptText}>Sim</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>

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
              style={({ pressed }) => [styles.saveButton, (loading || pressed) && styles.buttonPressed]}
              onPress={() => void handleSave()}
            >
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Salvar Registro</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Modal de visualizacao detalhada de um registro diario ja existente.
// Exibe textos, lista de equipe presente e galeria de midias anexadas.
function DailyLogDetailsModal({
  date,
  log,
  employees,
  employeeIds,
  visible,
  onClose,
  onEdit,
}: {
  date: string;
  log: DailyLogRow;
  employees: EmployeeRow[];
  employeeIds: string[];
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const selectedEmployees = employees.filter((e) => employeeIds.includes(e.id));

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Detalhes do Dia - {displayDate(date)}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Atividades realizadas</Text>
              <Text style={styles.detailValue}>{log.activities || "Nenhuma atividade descrita."}</Text>
            </View>

            {log.weather ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Clima</Text>
                <Text style={styles.detailValue}>{log.weather}</Text>
              </View>
            ) : null}

            {log.observations ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Observacoes</Text>
                <Text style={styles.detailValue}>{log.observations}</Text>
              </View>
            ) : null}

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
                  <Text style={styles.detailValueEmpty}>Nenhum funcionario registrado.</Text>
                )}
              </View>
            </View>

            {(log.photos_urls?.length ?? 0) > 0 || (log.videos_urls?.length ?? 0) > 0 ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Midias</Text>
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
        </View>
      </View>
    </Modal>
  );
}

// Tela principal do modulo "Dia a Dia", exibindo um calendario mensal de registros.
// Controla a navegacao entre meses e a abertura de modais de criacao/detalhes.
export function DailyScreen() {
  // Hooks para autenticacao, dados do projeto, logs e equipe.
  // Utiliza queries do TanStack Query (via custom hooks) para sincronizacao com Supabase.
  const { user } = useAuth();
  const { project, logs, employees, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = useDailyLogs();
  const upsertDailyLog = useUpsertDailyLog();
  const deleteDailyLog = useDeleteDailyLog();
  const [monthDate, setMonthDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
  const employeeIdsQuery = useDailyLogDetail(selectedLog?.id ?? null);
  
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
    employeeIds: string[];
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
      createdBy: user.id,
      employeeIds: payload.employeeIds,
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
          <Text style={styles.dailySubtitle}>Registro diario da obra</Text>
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
              const hasLog = Boolean(logsByDate[cell.iso]);
              const isSelected = selectedDate === cell.iso;

              return (
                <Pressable
                  key={cell.key}
                  style={({ pressed }) => [
                    styles.dayCell,
                    isCurrentDay && styles.dayToday,
                    isSelected && styles.daySelected,
                    hasLog && styles.dayRegistered,
                    pressed && !isDisabled && styles.buttonPressed,
                  ]}
                  disabled={isDisabled}
                  onPress={() => handleOpenDate(cell.date)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !cell.currentMonth && styles.dayOutsideMonth,
                      isDisabled && styles.dayDisabled,
                      hasLog && styles.dayWithLog,
                      (isCurrentDay || isSelected) && styles.dayTextHighlighted,
                    ]}
                  >
                    {cell.dayNumber}
                  </Text>
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
              <View style={[styles.legendDot, styles.legendDotToday]} />
              <Text style={styles.legendText}>Hoje</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotEmpty]} />
              <Text style={styles.legendText}>Sem registro</Text>
            </View>
          </View>

          {!projectStartDate ? (
            <Text style={styles.projectHint}>Configure a data de inicio da obra em Configuracoes</Text>
          ) : null}

          <View style={styles.monthListSection}>
            <Text style={styles.monthListTitle}>Registros de {monthLabel}</Text>

            {monthLogs.length ? (
              <View style={styles.monthLogList}>
                {monthLogs.map((log) => (
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
                      <Text style={styles.monthLogTag}>Registrado</Text>
                    </View>
                    <Text numberOfLines={2} style={styles.monthLogActivities}>
                      {log.activities || "Sem descricao preenchida."}
                    </Text>
                    {log.weather ? <Text style={styles.monthLogMeta}>Clima: {log.weather}</Text> : null}
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
                      <Text style={styles.loadMoreText}>Carregar registros anteriores...</Text>
                    )}
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={styles.monthLogEmpty}>
                <Text style={styles.monthLogEmptyText}>Nenhum registro salvo neste mes.</Text>
              </View>
            )}

            {hasNextPage && (
              <Pressable 
                style={({ pressed }) => [styles.loadMoreButton, pressed && styles.buttonPressed]} 
                onPress={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>Carregar registros anteriores...</Text>
                )}
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}

      {selectedDate && selectedLog ? (
        <DailyLogDetailsModal
          date={selectedDate}
          log={selectedLog}
          employees={employees}
          employeeIds={employeeIdsQuery.data ?? []}
          visible={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          onEdit={handleEditFromDetails}
        />
      ) : null}

      {selectedDate ? (
        <DailyLogForm
          projectId={project?.id ?? ""}
          date={selectedDate}
          employees={employees}
          existingLog={selectedLog}
          initialEmployeeIds={employeeIdsQuery.data ?? []}
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
    minHeight: 44,
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
  dayToday: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#d97b00",
  },
  daySelected: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#d97b00",
  },
  dayRegistered: {
    borderRadius: 20,
    backgroundColor: "#eef8f0",
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
  fieldLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
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
  employeeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  buttonPressed: {
    opacity: 0.82,
  },
});
