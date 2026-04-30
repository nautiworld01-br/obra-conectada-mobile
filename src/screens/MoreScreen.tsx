import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../components/AppScreen";
import { SectionCard } from "../components/SectionCard";
import { AnimatedModal } from "../components/AnimatedModal";
import { colors } from "../config/theme";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { uploadAppMediaIfNeeded } from "../lib/appMedia";
import { getErrorMessage } from "../lib/errorMessage";
import { deleteFileFromStorage } from "../lib/storageUpload";
import { supabase } from "../lib/supabase";

/**
 * Tela de Perfil (Mais): Gestao de dados pessoais e foto de perfil do usuario.
 */
export function MoreScreen() {
  const queryClient = useQueryClient();
  const { user, reauthenticate, signOut } = useAuth();
  const { fullName, avatarUrl, occupationLabel, initials } = useProfile();
  const pushNotifications = usePushNotifications();
  const [editVisible, setEditVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sincroniza estado com dados reais ao abrir modal de edicao.
  useEffect(() => {
    if (editVisible) {
      setDraftName(fullName);
      setDraftAvatar(avatarUrl || "");
    }
  }, [avatarUrl, editVisible, fullName]);

  useEffect(() => {
    if (deleteVisible) {
      setCurrentPassword("");
      setDeleteError(null);
    }
  }, [deleteVisible]);

  /**
   * Dispara seletor de imagem nativo para trocar a foto de perfil.
   */
  const pickAvatarFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Galeria", "Permissão necessária."); return; }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, quality: 0.9, aspect: [1, 1],
    });

    if (!result.canceled && result.assets.length) {
      setDraftAvatar(result.assets[0].uri);
    }
  };

  /**
   * Salva as alteracoes de perfil no Storage e no Banco (Tabela profiles).
   */
  const handleSaveProfile = async () => {
    if (!supabase || !user) return;
    if (!draftName.trim()) { Alert.alert("Perfil", "Informe o nome."); return; }
    setSaving(true);
    try {
      // Se a foto mudou, deletamos a antiga antes de subir a nova para economizar espaco.
      if (draftAvatar !== avatarUrl) {
        await deleteFileFromStorage("app-media", avatarUrl);
      }

      const uploadedUrl = await uploadAppMediaIfNeeded({
        uri: draftAvatar.trim() || null,
        pathPrefix: `users/${user.id}/avatar`,
        fileBaseName: "profile_avatar",
      });

      // Sincroniza tambem o full_name no Auth Metadata para consistencia
      await supabase.auth.updateUser({ data: { full_name: draftName.trim() } });
      
      await supabase.from("profiles").upsert({ id: user.id, full_name: draftName.trim(), avatar_url: uploadedUrl });
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      setEditVisible(false);
    } catch (e) { Alert.alert("Erro", "Falha ao salvar perfil."); }
    finally { setSaving(false); }
  };

  const getDeleteAccountErrorMessage = (message?: string) => {
    if (!message) {
      return "Não foi possível remover sua conta agora. Tente novamente mais tarde.";
    }

    if (message.includes("ultimo proprietario")) {
      return "Esta conta é o último proprietário da obra e não pode ser excluída enquanto não houver outro proprietário ativo.";
    }

    return message;
  };

  const handleDeleteAccount = async () => {
    if (!supabase || !user) return;
    if (!currentPassword) {
      setDeleteError("Informe sua senha atual para confirmar a exclusão.");
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const reauthResult = await reauthenticate(currentPassword);
    if (reauthResult.error) {
      setDeleteError("Senha atual incorreta ou sessão inválida. Confirme sua identidade para continuar.");
      setDeleting(false);
      return;
    }

    const { error } = await supabase.rpc("delete_user_account");
    if (error) {
      setDeleteError(getDeleteAccountErrorMessage(error.message));
      setDeleting(false);
      return;
    }

    setDeleteVisible(false);
    setDeleting(false);
    await signOut();
  };

  const handleEnableNotifications = async () => {
    try {
      await pushNotifications.subscribe();
      Alert.alert("Notificações", "Notificações ativadas neste navegador.");
    } catch (error) {
      Alert.alert("Notificações", getErrorMessage(error, "Não foi possível ativar notificações."));
    }
  };

  const handleDisableNotifications = async () => {
    try {
      await pushNotifications.unsubscribe();
      Alert.alert("Notificações", "Notificações desativadas neste navegador.");
    } catch (error) {
      Alert.alert("Notificações", getErrorMessage(error, "Não foi possível desativar notificações."));
    }
  };

  const handleSendTestNotification = async () => {
    try {
      const result = await pushNotifications.sendTest();
      Alert.alert("Notificações", `Teste enviado para ${result.sent}/${result.total} inscrição ativa.`);
    } catch (error) {
      Alert.alert("Notificações", getErrorMessage(error, "Não foi possível enviar a notificação de teste."));
    }
  };

  const notificationCopy = getNotificationStateCopy(pushNotifications.supportState);
  const notificationBusy = pushNotifications.isSubscribing || pushNotifications.isUnsubscribing || pushNotifications.isSendingTest;

  return (
    <>
      <AppScreen title="Perfil">
        <SectionCard title="Conta">
          <View style={styles.profileRow}>
            <View style={styles.avatarShell}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}</View>
            <View style={styles.profileCopy}>
              <Text style={styles.name}>{fullName}</Text>
              <Text style={styles.meta}>{occupationLabel}</Text>
              <Text style={styles.meta}>{user?.email}</Text>
            </View>
          </View>
          <View style={styles.profileActions}>
            <Pressable style={styles.editButton} onPress={() => setEditVisible(true)}><Text style={styles.editButtonText}>Editar perfil</Text></Pressable>
            <Pressable style={styles.deleteAccountButton} onPress={() => setDeleteVisible(true)}><Text style={styles.deleteAccountText}>Excluir conta</Text></Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Notificações">
          <View style={styles.notificationBlock}>
            <Text style={styles.notificationTitle}>{notificationCopy.title}</Text>
            <Text style={styles.notificationDescription}>{notificationCopy.description}</Text>
            {pushNotifications.supportState === "subscribed" ? (
              <View style={styles.notificationActions}>
                <Pressable style={styles.notificationPrimaryButton} onPress={() => void handleSendTestNotification()} disabled={notificationBusy}>
                  {pushNotifications.isSendingTest ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.notificationPrimaryText}>Enviar teste</Text>}
                </Pressable>
                <Pressable style={styles.notificationSecondaryButton} onPress={() => void handleDisableNotifications()} disabled={notificationBusy}>
                  {pushNotifications.isUnsubscribing ? <ActivityIndicator color={colors.text} /> : <Text style={styles.notificationSecondaryText}>Desativar neste navegador</Text>}
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.notificationPrimaryButton,
                  !notificationCopy.canEnable && styles.notificationButtonDisabled,
                ]}
                onPress={() => void handleEnableNotifications()}
                disabled={!notificationCopy.canEnable || notificationBusy}
              >
                {pushNotifications.isSubscribing ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.notificationPrimaryText}>Ativar notificações</Text>}
              </Pressable>
            )}
          </View>
        </SectionCard>
      </AppScreen>

      <AnimatedModal visible={editVisible} onRequestClose={() => setEditVisible(false)} position="center" contentStyle={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Editar perfil</Text>
        </View>
        <View style={styles.modalAvatarArea}>
          <View style={styles.avatarShellLarge}>{draftAvatar ? <Image source={{ uri: draftAvatar }} style={styles.avatarImage} /> : <Text style={styles.avatarTextLarge}>{initials}</Text>}</View>
          <Pressable style={styles.photoButton} onPress={() => void pickAvatarFromGallery()}><Text style={styles.photoButtonText}>Trocar foto</Text></Pressable>
        </View>
        <View style={styles.formBlock}>
          <TextInput
            style={styles.formInput}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Nome completo"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.modalActions}>
          <Pressable style={styles.cancelButton} onPress={() => setEditVisible(false)}><Text style={styles.cancelButtonText}>Cancelar</Text></Pressable>
          <Pressable style={styles.saveButton} onPress={() => void handleSaveProfile()}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Salvar</Text>}</Pressable>
        </View>
      </AnimatedModal>

      <AnimatedModal visible={deleteVisible} onRequestClose={() => !deleting && setDeleteVisible(false)} position="center" contentStyle={styles.modalCard} dismissOnBackdropPress={!deleting}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Excluir conta</Text>
          <Text style={styles.deleteDescription}>Confirme sua senha atual para continuar.</Text>
        </View>
        <View style={styles.deleteNotice}>
          <Text style={styles.deleteNoticeText}>
            Seus dados pessoais, vínculo com a obra e acesso ao app serão removidos. Se esta conta for o último proprietário da obra, a exclusão será bloqueada.
          </Text>
        </View>
        <View style={styles.formBlock}>
          <TextInput style={[styles.formInput, styles.formInputDisabled]} value={user?.email ?? ""} editable={false} />
        </View>
        <View style={styles.formBlock}>
          <TextInput
            style={styles.formInput}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Senha atual"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            editable={!deleting}
          />
        </View>
        {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
        <View style={styles.deleteModalActions}>
          <Pressable style={styles.deleteCancelButton} onPress={() => setDeleteVisible(false)} disabled={deleting}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>
          <Pressable style={styles.deleteConfirmButton} onPress={() => void handleDeleteAccount()} disabled={deleting}>
            {deleting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.deleteConfirmText}>Excluir conta definitivamente</Text>}
          </Pressable>
        </View>
      </AnimatedModal>
    </>
  );
}

function getNotificationStateCopy(state: ReturnType<typeof usePushNotifications>["supportState"]) {
  if (state === "subscribed") {
    return {
      title: "Notificações ativadas",
      description: "Este navegador já pode receber avisos importantes da obra.",
      canEnable: false,
    };
  }

  if (state === "permission_denied") {
    return {
      title: "Permissão bloqueada",
      description: "Ative as notificações nas configurações do navegador ou do sistema para continuar.",
      canEnable: false,
    };
  }

  if (state === "missing_vapid_key") {
    return {
      title: "Configuração pendente",
      description: "A chave pública VAPID ainda não foi configurada neste build.",
      canEnable: false,
    };
  }

  if (state === "unsupported") {
    return {
      title: "Indisponível neste dispositivo",
      description: "Este navegador não suporta notificações push para PWA.",
      canEnable: false,
    };
  }

  return {
    title: "Ativar notificações",
    description: "Você receberá apenas avisos importantes. Quem cria uma ação não recebe push da própria ação.",
    canEnable: true,
  };
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarShell: { width: 76, height: 76, borderRadius: 26, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontSize: 22, fontWeight: "800", color: colors.primary },
  profileCopy: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontSize: 22, fontWeight: "800", color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
  profileActions: { gap: 10, marginTop: 18 },
  notificationBlock: { gap: 10 },
  notificationActions: { gap: 10 },
  notificationTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  notificationDescription: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  notificationPrimaryButton: { minHeight: 50, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  notificationPrimaryText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  notificationSecondaryButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  notificationSecondaryText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  notificationButtonDisabled: { backgroundColor: colors.textMuted, opacity: 0.6 },
  editButton: { borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: colors.primary },
  editButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  deleteAccountButton: { paddingVertical: 8, alignItems: "center" },
  deleteAccountText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  modalCard: { width: "100%", maxWidth: 360, gap: 16, borderRadius: 24, padding: 18, backgroundColor: colors.surface },
  modalHeader: { gap: 6, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center" },
  modalAvatarArea: { alignItems: "center", gap: 12 },
  avatarShellLarge: { width: 92, height: 92, borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarTextLarge: { fontSize: 28, fontWeight: "800", color: colors.primary },
  photoButton: { borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surfaceMuted },
  photoButtonText: { fontSize: 14, fontWeight: "700", color: colors.text },
  formBlock: { gap: 8 },
  formInput: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, fontSize: 15 },
  formInputDisabled: { color: colors.textMuted },
  modalActions: { flexDirection: "row", gap: 12 },
  deleteModalActions: { gap: 12 },
  cancelButton: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder },
  deleteCancelButton: { minHeight: 56, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder },
  cancelButtonText: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  saveButton: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: colors.primary },
  saveButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  deleteDescription: { fontSize: 14, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  deleteNotice: { borderRadius: 16, borderWidth: 1, borderColor: colors.dangerLight, backgroundColor: colors.dangerLight, padding: 14 },
  deleteNoticeText: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  deleteError: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  deleteConfirmButton: { minHeight: 56, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger },
  deleteConfirmText: { color: colors.surface, fontSize: 15, lineHeight: 20, fontWeight: "800", textAlign: "center" },
});
